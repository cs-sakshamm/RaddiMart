import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// End-to-end consumer listing flow against a real LOCAL Supabase instance.
// The app must be built with VITE_SUPABASE_* pointing at the same instance.
// These tests create and delete one local user and refuse any hosted URL.

const url = process.env.INTEGRATION_SUPABASE_URL;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
if (url && !isLocal) {
  throw new Error(`Refusing listing E2E tests against non-local URL: ${url}`);
}
const configured = Boolean(url && anonKey && serviceKey && isLocal);

const PASSWORD = 'local-test-password-123';
const email = `e2e-listing-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.local`;

test.describe('Consumer creates a listing from the seeded catalogue', () => {
  test.skip(!configured, 'Requires a running local Supabase and integration env vars');

  let admin;
  let userId;
  let categoryId;
  let subcategoryId;

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    if (!configured) return;
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Listing E2E Consumer' },
    });
    expect(created.error).toBeNull();
    userId = created.data.user.id;

    const category = await admin
      .from('material_categories')
      .select('id')
      .eq('id', 'a1000000-0000-4000-8000-000000000001')
      .single();
    expect(category.error).toBeNull();
    categoryId = category.data.id;

    const subcategory = await admin
      .from('material_categories')
      .select('id')
      .eq('id', 'a1000000-0000-4000-8000-000000000101')
      .single();
    expect(subcategory.error).toBeNull();
    subcategoryId = subcategory.data.id;
  });

  test.afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from('scrap_listings').delete().eq('consumer_id', userId);
    await admin.auth.admin.deleteUser(userId);
  });

  test('loads categories, selects a subcategory and stores the listing', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/consumer$/);

    await page.goto('/dashboard/create-listing');
    await expect(page.getByRole('heading', { name: 'Create scrap listing' })).toBeVisible();

    const categorySelect = page.getByLabel('Material category');
    await expect(categorySelect.locator('option', { hasText: 'E-waste' })).toHaveCount(1);
    await expect(categorySelect.locator('option', { hasText: 'Metals' })).toHaveCount(1);
    await categorySelect.selectOption({ label: 'E-waste' });

    const subcategorySelect = page.getByLabel('Subcategory (optional)');
    await expect(subcategorySelect.locator('option', { hasText: 'PCBs' })).toHaveCount(1);

    await subcategorySelect.selectOption({ label: 'PCBs' });
    await page.getByLabel(/Estimated weight/).fill('12.5');
    await page.getByLabel('Condition').selectOption('Used');
    await page.getByLabel('Pickup address').fill('42 E2E Catalogue Road, Pune');
    await page.getByLabel(/Pickup zone/).fill('Pune West');

    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page).toHaveURL(/\/listing\/[0-9a-f-]{36}$/);

    const listingId = page.url().split('/').pop();
    const listing = await admin
      .from('scrap_listings')
      .select('consumer_id, category_id, subcategory_id, status')
      .eq('id', listingId)
      .single();
    expect(listing.error).toBeNull();
    expect(listing.data).toMatchObject({
      consumer_id: userId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      status: 'LISTED',
    });

    const address = await admin
      .from('scrap_listing_addresses')
      .select('address')
      .eq('listing_id', listingId)
      .single();
    expect(address.data.address).toBe('42 E2E Catalogue Road, Pune');
  });
});
