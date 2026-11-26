import { test, expect } from '@playwright/test';

test.describe('Protected routes', () => {
  test('redirects unauthenticated user to sign-in from dashboard', async ({ page }) => {
    await page.goto('/dashboard/consumer');
    await expect(page).toHaveURL('/signin');
  });

  test('redirects unauthenticated user to sign-in from profile', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL('/signin');
  });

  test('redirects unauthenticated user to sign-in from role request', async ({ page }) => {
    await page.goto('/role-request');
    await expect(page).toHaveURL('/signin');
  });

  test('allows access to public auth pages without authentication', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: /Sign in/ })).toBeVisible();

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Create account/ })).toBeVisible();

    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /Forgot password/ })).toBeVisible();
  });

  test('404 route redirects to homepage', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page).toHaveURL('/');
  });
});
