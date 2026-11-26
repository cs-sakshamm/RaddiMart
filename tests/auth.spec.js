import { test, expect } from '@playwright/test';

// Authentication tests require test credentials configured via environment variables.
// These tests are SKIPPED unless both TEST_USER_EMAIL and TEST_USER_PASSWORD are set.
// Never hardcode personal or production credentials here.
const hasTestCredentials = !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

const SESSION_USER = {
  id: '00000000-0000-4000-8000-000000000002',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'collector@example.com',
  email_confirmed_at: '2026-11-26T10:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Ravi Collector' },
  created_at: '2026-11-20T10:00:00Z',
};

const STUB_SESSION = {
  access_token: 'stub-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'stub-refresh-token',
  user: SESSION_USER,
};

test.describe('Authentication pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sign-in page renders with email and password fields', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: /Sign in/ })).toBeVisible();
    await expect(page.getByLabel(/Email/)).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Sign in$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Forgot password/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create an account/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to home/ })).toBeVisible();
  });

  test('sign-up page renders with all required fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Create account/ })).toBeVisible();
    await expect(page.getByLabel(/Full name/)).toBeVisible();
    await expect(page.getByLabel(/Email/)).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
  });

  test('forgot password page renders with email field', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /Forgot password/ })).toBeVisible();
    await expect(page.getByLabel(/Email/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Send reset link/ })).toBeVisible();
  });

  test('reset password page rejects a visit without a recovery link', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /Reset password/ })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i);
    await expect(page.getByRole('link', { name: /Request a new link/ })).toBeVisible();
  });

  test.describe('Sign-in flow (requires TEST_USER_EMAIL / TEST_USER_PASSWORD)', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('signs in with valid test credentials', async ({ page }) => {
      test.skip(!hasTestCredentials, 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables');

      await page.goto('/signin');
      await page.getByLabel(/Email/).fill(process.env.TEST_USER_EMAIL);
      await page.getByLabel(/^Password/).fill(process.env.TEST_USER_PASSWORD);
      await page.getByRole('button', { name: /^Sign in$/ }).click();

      // After sign-in, user should be redirected to their dashboard
      await expect(page).toHaveURL(/\/dashboard\/(consumer|collector|aggregator|recycler)/);
    });
  });

  test.describe('Password recovery flow', () => {
    test('sends reset link for a registered email', async ({ page }) => {
      test.skip(!hasTestCredentials, 'Requires TEST_USER_EMAIL environment variable');

      await page.goto('/forgot-password');
      await page.getByLabel(/Email/).fill(process.env.TEST_USER_EMAIL);
      await page.getByRole('button', { name: /Send Reset Link/ }).click();
      await expect(page.getByText(/reset link has been sent/i)).toBeVisible();
    });
  });
});

// Regression coverage for the two reported failures. Both are reproduced with
// stubbed auth responses, so no project, account or network is involved.
test.describe('Authentication failure reporting', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signup without a session names the confirmation requirement', async ({ page }) => {
    // What a project with mailer_autoconfirm:false returns: a user, no session.
    await page.route('**/auth/v1/signup*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_USER.id,
          email: 'new@example.com',
          identities: [{ id: 'identity-1' }],
          created_at: '2026-11-26T10:00:00Z',
          session: null,
        }),
      }),
    );

    await page.goto('/signup');
    await page.getByLabel(/Full name/).fill('New User');
    await page.getByLabel(/Email/).fill('new@example.com');
    await page.getByLabel('Password', { exact: true }).fill('long-enough-password');
    await page.getByLabel('Confirm password', { exact: true }).fill('long-enough-password');
    await page.getByLabel(/terms of service/).check();
    await page.getByRole('button', { name: /Create account/ }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/email confirmation/i);
    // The old, unhelpful copy must not return.
    await expect(alert).not.toContainText(/session could not be established/i);
    // No session means no dashboard.
    await expect(page).not.toHaveURL(/\/dashboard\//);
  });

  test('sign-in blocked by confirmation is not reported as bad credentials', async ({ page }) => {
    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 400,
          error_code: 'email_not_confirmed',
          msg: 'Email not confirmed',
        }),
      }),
    );

    await page.goto('/signin');
    await page.getByLabel(/Email/).fill('new@example.com');
    await page.getByLabel(/^Password/).fill('long-enough-password');
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/email confirmation/i);
    await expect(alert).not.toContainText(/could not sign you in/i);
    await expect(alert).not.toContainText(/email or password is incorrect/i);
    await expect(page).not.toHaveURL(/\/dashboard\//);
  });
});

