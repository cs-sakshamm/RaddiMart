import { test, expect } from '@playwright/test';

// Profile loading in the real UI, with Supabase stubbed at the network layer.
// No project, account or remote database is involved.

const USER_ID = '00000000-0000-4000-8000-0000000000bb';

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'consumer@example.com',
  email_confirmed_at: '2026-11-26T10:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Test Consumer' },
  identities: [],
  created_at: '2026-11-20T10:00:00Z',
};

const PROFILE = {
  id: USER_ID,
  full_name: 'Test Consumer',
  phone: null,
  active_role: 'consumer',
  is_admin: false,
};

function json(route, status, body) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function tokenBody() {
  return {
    access_token: 'stub-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'stub-refresh-token',
    user: USER,
  };
}

async function signIn(page) {
  await page.goto('/signin');
  await page.getByLabel(/^Email/).fill(USER.email);
  await page.getByLabel(/^Password/).fill('long-enough-password');
  await page.getByRole('button', { name: /^Sign in$/ }).click();
}

test.describe('Profile loading', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an account with no profile row heals itself and reaches the dashboard', async ({ page }) => {
    let repairCalls = 0;

    await page.route('**/auth/v1/token**', (route) => json(route, 200, tokenBody()));
    // Dashboard data other than the profile.
    await page.route('**/rest/v1/**', (route) => json(route, 200, []));
    // No profile row: this is what an account created without the signup trigger
    // returns. `.maybeSingle()` reports it as an empty result, not an error.
    await page.route('**/rest/v1/profiles**', (route) => json(route, 200, []));
    // The safe repair creates the caller's own row with the default role.
    await page.route('**/rest/v1/rpc/ensure_own_profile**', (route) => {
      repairCalls += 1;
      return json(route, 200, PROFILE);
    });

    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard\/consumer$/);
    await expect(page.getByRole('heading', { name: 'Consumer dashboard' })).toBeVisible();
    await expect(page.getByText(/Profile not found/i)).toHaveCount(0);
    expect(repairCalls).toBeGreaterThan(0);

    // A refresh must not lose the (now repaired) profile access.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard\/consumer$/);
    await expect(page.getByRole('heading', { name: 'Consumer dashboard' })).toBeVisible();

    // The profile page uses the same lookup, so it loads as well.
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    await expect(page.getByText(/Profile not found/i)).toHaveCount(0);
  });

  test('a transient profile failure can be retried without signing out', async ({ page }) => {
    let failing = true;

    await page.route('**/auth/v1/token**', (route) => json(route, 200, tokenBody()));
    await page.route('**/rest/v1/**', (route) => json(route, 200, []));
    await page.route('**/rest/v1/profiles**', (route) =>
      failing
        ? json(route, 500, { code: '500', message: 'database unavailable' })
        : json(route, 200, PROFILE),
    );

    await signIn(page);

    await expect(page.getByRole('alert')).toContainText(/could not be loaded right now/i);
    // The session is still valid, so the page offers a retry rather than only
    // asking the user to sign in again.
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Consumer dashboard' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/consumer$/);
  });

  test('a refused profile read is reported as an access problem, not a missing profile', async ({ page }) => {
    let repairCalls = 0;

    await page.route('**/auth/v1/token**', (route) => json(route, 200, tokenBody()));
    await page.route('**/rest/v1/**', (route) => json(route, 200, []));
    await page.route('**/rest/v1/profiles**', (route) =>
      json(route, 403, {
        code: '42501',
        message: 'permission denied for table profiles',
        hint: null,
        details: null,
      }),
    );
    await page.route('**/rest/v1/rpc/ensure_own_profile**', (route) => {
      repairCalls += 1;
      return json(route, 200, PROFILE);
    });

    await signIn(page);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/not accessible with the current permissions/i);
    await expect(alert).not.toContainText(/Profile not found/i);
    // A refused read is not a missing row, so no repair should be attempted.
    expect(repairCalls).toBe(0);
    // The user still has a valid session; they are not sent back to sign in.
    await expect(page).not.toHaveURL(/\/signin$/);
  });

  test('the profile page reports a load failure and retries without losing the session', async ({ page }) => {
    let failing = true;

    await page.route('**/auth/v1/token**', (route) => json(route, 200, tokenBody()));
    await page.route('**/rest/v1/**', (route) => json(route, 200, []));
    await page.route('**/rest/v1/profiles**', (route) =>
      failing
        ? json(route, 500, { code: '500', message: 'database unavailable' })
        : json(route, 200, PROFILE),
    );

    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard\/consumer$/);
    await page.goto('/profile');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/could not be loaded right now/i);
    // A failed load is not an empty profile: do not offer an Edit action that
    // would save against a profile that was never loaded.
    await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
    await expect(page.getByText('Test Consumer')).toBeVisible();
    await expect(page).not.toHaveURL(/\/signin$/);
  });
});
