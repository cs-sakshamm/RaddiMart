import { test, expect } from '@playwright/test';

// The section links live behind the menu button on narrow viewports.
async function openMenuIfCollapsed(page) {
  const toggle = page.getByRole('button', { name: 'Menu' });
  if (await toggle.isVisible()) await toggle.click();
}

test.describe('Homepage', () => {
  test('loads and renders the RADDIMART brand', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/RADDIMART/);
    await expect(page.getByRole('heading', { name: /Scrap collection that leaves a record/ })).toBeVisible();
  });

  test('displays the four stakeholder role cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Consumer/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Local Kabadiwala/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Aggregator/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Recycler/ })).toBeVisible();
  });

  test('has navigation links to sign in and get started', async ({ page }) => {
    await page.goto('/');
    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expect(popup).not.toBeVisible();
    await openMenuIfCollapsed(page);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: /Sign in/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Get started/ })).toBeVisible();
  });

  test('renders the Problem & Solution popup on fresh visit', async ({ page }) => {
    await page.goto('/');
    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(/The problem/);
    await expect(popup).toContainText(/Our solution/);
    await expect(popup).toContainText(/Expected impact/);
  });

  test('popup closes via close button', async ({ page }) => {
    await page.goto('/');
    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expect(popup).not.toBeVisible();
  });

  test('navigation links scroll to page sections', async ({ page }) => {
    await page.goto('/');
    // The Problem & Solution dialog is an accessible modal; close it before
    // interacting with the page behind it.
    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expect(popup).not.toBeVisible();
    await openMenuIfCollapsed(page);
    // Scope to the main navigation: the footer links to the same sections.
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: /How it works/ })
      .click();
    await expect(page.locator('#how-works')).toBeVisible();
    await expect(page).toHaveURL(/\/#how-works$/);
  });
});
