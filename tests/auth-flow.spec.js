import { test, expect } from '@playwright/test';

// Sign-in and sign-up journeys driven through the real UI, with the Supabase
// endpoints stubbed at the network layer. No project, account or network call is
// involved, so the suite runs in CI without credentials and never touches a
// remote database.

const USER_ID = '00000000-0000-4000-8000-0000000000aa';

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'collector@example.com',
  email_confirmed_at: '2026-11-26T10:00:00Z',
  confirmed_at: '2026-11-26T10:00:00Z',
  last_sign_in_at: '2026-11-26T10:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Ravi Collector' },
  identities: [],
  created_at: '2026-11-20T10:00:00Z',
  updated_at: '2026-11-20T10:00:00Z',
};

function tokenBody(user = USER) {
  return {
    access_token: 'stub-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'stub-refresh-token',
    user,
  };
}

function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

// The signed-in reads the app performs (profile row, dashboard data). Routes are
// matched most-recently-registered first, so the profiles route deliberately
// comes last.
async function stubData(page, { role = 'collector' } = {}) {
  await page.route('**/rest/v1/**', (route) => json(route, 200, []));
  await page.route('**/storage/v1/**', (route) => json(route, 200, {}));
  await page.route('**/rest/v1/profiles**', (route) =>
    json(route, 200, {
      id: USER_ID,
      full_name: 'Ravi Collector',
      phone: null,
      email: USER.email,
      active_role: role,
      is_admin: false,
    }),
  );
}

async function stubSignIn(page, { status = 200, body, delayMs = 0, counter } = {}) {
  await page.route('**/auth/v1/token**', async (route) => {
    if (counter) counter.count += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return json(route, status, body ?? tokenBody());
  });
}

async function stubSignUp(page, { status = 200, body, counter } = {}) {
  await page.route('**/auth/v1/signup**', (route) => {
    if (counter) counter.count += 1;
    return json(route, status, body ?? tokenBody());
  });
}

async function fillSignIn(page, { email = USER.email, password = 'long-enough-password' } = {}) {
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
}

async function fillSignUp(page, { email = 'new@example.com', password = 'long-enough-password' } = {}) {
  await page.getByLabel(/Full name/).fill('New User');
  await page.getByLabel(/^Email$/).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel(/terms of service/).check();
}

test.describe('Sign in', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs in, opens the role dashboard and survives a refresh', async ({ page }) => {
    await stubSignIn(page);
    await stubData(page, { role: 'collector' });

    await page.goto('/signin');
    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    await expect(page).toHaveURL(/\/dashboard\/collector$/);
    await expect(page.getByRole('heading', { name: 'Collector dashboard' })).toBeVisible();

    // The stored session must outlive a reload instead of looking signed out.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard\/collector$/);
    await expect(page.getByRole('heading', { name: 'Collector dashboard' })).toBeVisible();
  });

  test('reports wrong credentials without leaving the page', async ({ page }) => {
    await stubSignIn(page, {
      status: 400,
      body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
    });

    await page.goto('/signin');
    await fillSignIn(page, { email: 'nobody@example.com', password: 'wrong-password' });
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Email or password is incorrect.');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('reports an unconfirmed account as a configuration block, not a wrong password', async ({ page }) => {
    await stubSignIn(page, {
      status: 400,
      body: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' },
    });

    await page.goto('/signin');
    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/email confirmation/i);
    await expect(alert).not.toContainText(/email or password is incorrect/i);
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('reports a network failure in plain language', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) => route.abort('failed'));

    await page.goto('/signin');
    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    await expect(page.getByRole('alert')).toContainText(/could not reach the sign-in service/i);
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('rejects empty and malformed input without contacting the provider', async ({ page }) => {
    const counter = { count: 0 };
    await stubSignIn(page, { counter });

    await page.goto('/signin');
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();

    await fillSignIn(page, { email: 'not-an-email', password: 'x' });
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page.getByText(/enter a valid email address/i)).toBeVisible();

    expect(counter.count).toBe(0);
  });

  test('a double submit sends one request and the button shows a loading state', async ({ page }) => {
    const counter = { count: 0 };
    await stubSignIn(page, { counter, delayMs: 800 });
    await stubData(page, { role: 'collector' });

    await page.goto('/signin');
    await fillSignIn(page);
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.requestSubmit();
      form.requestSubmit();
    });

    await expect(page.getByRole('button', { name: /Signing in/ })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/collector$/);
    expect(counter.count).toBe(1);
  });

  test('returns to the page the visitor originally asked for', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/signin$/);

    await stubSignIn(page);
    await stubData(page, { role: 'collector' });

    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    // Regression: the guard used to push every signed-in visitor to their role
    // dashboard, so a deep link could never be resumed.
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  });

  test('an expired session is dropped instead of showing protected content', async ({ page }) => {
    await stubSignIn(page);
    await stubData(page, { role: 'collector' });

    await page.goto('/signin');
    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/collector$/);

    // A refresh token that the provider rejects: the stored session can no
    // longer be refreshed, so the guard must treat the visitor as signed out.
    await page.route(/\/auth\/v1\/token\?grant_type=refresh_token/, (route) =>
      json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }),
    );
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (!key.endsWith('-auth-token')) continue;
        const stored = JSON.parse(localStorage.getItem(key));
        stored.expires_at = Math.floor(Date.now() / 1000) - 60;
        localStorage.setItem(key, JSON.stringify(stored));
      }
    });

    await page.reload();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { name: /^Sign in$/ })).toBeVisible();
  });

  test('signing out clears the session and protects routes again', async ({ page }) => {
    await stubSignIn(page);
    await stubData(page, { role: 'collector' });
    await page.route('**/auth/v1/logout**', (route) => json(route, 204, {}));

    await page.goto('/signin');
    await fillSignIn(page);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/collector$/);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/signin$/);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/signin$/);
  });
});

test.describe('Sign up', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('creates an account and opens the matching dashboard', async ({ page }) => {
    const counter = { count: 0 };
    await stubSignUp(page, { counter });
    await stubData(page, { role: 'consumer' });

    await page.goto('/signup');
    await fillSignUp(page);
    await page.getByRole('button', { name: /^Create account$/ }).click();

    await expect(page).toHaveURL(/\/dashboard\/consumer$/);
    expect(counter.count).toBe(1);
  });

  test('validates the form without contacting the provider', async ({ page }) => {
    const counter = { count: 0 };
    await stubSignUp(page, { counter });

    await page.goto('/signup');
    await page.getByRole('button', { name: /^Create account$/ }).click();

    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Choose a password.')).toBeVisible();
    await expect(page.getByText('Repeat your password.')).toBeVisible();
    await expect(page.getByText('Accept the terms of service to continue.')).toBeVisible();
    expect(counter.count).toBe(0);
  });

  test('rejects a password confirmation mismatch before sending', async ({ page }) => {
    const counter = { count: 0 };
    await stubSignUp(page, { counter });

    await page.goto('/signup');
    await fillSignUp(page);
    await page.getByLabel('Confirm password', { exact: true }).fill('a-different-password');
    await page.getByRole('button', { name: /^Create account$/ }).click();

    await expect(page.getByText('The passwords do not match.')).toBeVisible();
    expect(counter.count).toBe(0);
  });

  test('keeps the entered data after a recoverable failure', async ({ page }) => {
    await stubSignUp(page, {
      status: 500,
      body: { code: 500, error_code: 'unexpected_failure', msg: 'boom' },
    });

    await page.goto('/signup');
    await fillSignUp(page, { email: 'retry@example.com' });
    await page.getByRole('button', { name: /^Create account$/ }).click();

    // A 5xx answer is a server problem, not a connectivity one, and it must not
    // be reported as a successful registration.
    await expect(page.getByRole('alert')).toHaveText(
      'The registration service is temporarily unavailable. Please try again shortly.',
    );
    await expect(page.getByLabel(/^Email$/)).toHaveValue('retry@example.com');
    await expect(page.getByLabel(/Full name/)).toHaveValue('New User');
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('reports a duplicate email without confirming the account exists', async ({ page }) => {
    await stubSignUp(page, {
      status: 422,
      body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' },
    });

    await page.goto('/signup');
    await fillSignUp(page);
    await page.getByRole('button', { name: /^Create account$/ }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/if this email already has an account/i);
    await expect(alert).not.toContainText(/already registered/i);
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('never reports success when the provider withholds a session', async ({ page }) => {
    // What a project with `mailer_autoconfirm: false` returns: a user, no session.
    await stubSignUp(page, {
      status: 200,
      body: {
        id: USER_ID,
        email: 'new@example.com',
        identities: [{ id: 'identity-1' }],
        created_at: '2026-11-26T10:00:00Z',
        session: null,
      },
    });

    await page.goto('/signup');
    await fillSignUp(page);
    await page.getByRole('button', { name: /^Create account$/ }).click();

    await expect(page.getByRole('alert')).toContainText(/email confirmation/i);
    await expect(page).toHaveURL(/\/signup$/);
  });
});
