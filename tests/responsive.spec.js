import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'small-mobile', width: 360, height: 800 },
  { name: 'large-mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'small-desktop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

for (const vp of viewports) {
  test(`renders homepage without overflow at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    // Page should not have horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = vp.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    // Brand and main navigation should be visible
    await expect(page.getByRole('heading', { name: /Scrap collection that leaves a record/ })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Sign in/ }),
    ).toBeVisible();
  });

  test(`popup is responsive at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const popup = page.getByRole('dialog');
    await expect(popup).toBeVisible();

    // Popup should fit within viewport
    const popupBox = await popup.boundingBox();
    expect(popupBox.width).toBeLessThanOrEqual(vp.width);
    expect(popupBox.height).toBeLessThanOrEqual(vp.height);

    // Close button should be reachable
    await page.getByRole('button', { name: /close/i }).click();
    await expect(popup).not.toBeVisible();
  });
}

test('touch targets meet minimum 44px on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const signInLink = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: /Sign in/ });
  const box = await signInLink.boundingBox();
  if (box) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
