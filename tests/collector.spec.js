import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Phase 4 collector marketplace browser tests.
//
// They need a LOCAL Supabase instance plus a build of the app that points at it:
//   INTEGRATION_SUPABASE_URL / INTEGRATION_SUPABASE_ANON_KEY / INTEGRATION_SUPABASE_SERVICE_KEY
//   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set to the same local instance
//   before `npm run build`.
//
// The suite is skipped when the integration variables are absent.

const url = process.env.INTEGRATION_SUPABASE_URL;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
// Fixtures create and delete users: loopback instances only.
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
const configured = Boolean(url && serviceKey && isLocal);

const PASSWORD = 'local-test-password-123';

function adminClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createUser(admin, email, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Could not create ${email}: ${error.message}`);
  return data.user.id;
}

async function seed({ zone, withListing = true, collector = true } = {}) {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const collectorEmail = `e2e-collector-${stamp}@test.local`;
  const consumerEmail = `e2e-consumer-${stamp}@test.local`;

  const collectorId = await createUser(admin, collectorEmail, 'E2E Collector');
  if (collector) {
    await admin.from('profiles').update({ active_role: 'collector' }).eq('id', collectorId);
  }
  const consumerId = await createUser(admin, consumerEmail, 'E2E Consumer');

  let listingId = null;
  if (withListing) {
    const { data: category, error: catError } = await admin
      .from('material_categories')
      .select('id')
      .eq('name', 'E-waste')
      .single();
    if (catError) throw new Error('Material catalogue is not seeded (run supabase db reset)');

    const { data: listing, error: listError } = await admin
      .from('scrap_listings')
      .insert({
        consumer_id: consumerId,
        category_id: category.id,
        approximate_weight: 12,
        condition: 'Used',
        pickup_zone: zone,
        preferred_pickup_time: new Date(Date.now() + 86400000).toISOString(),
        status: 'LISTED',
      })
      .select('id')
      .single();
    if (listError) throw new Error(`Could not seed listing: ${listError.message}`);
    listingId = listing.id;

    await admin
      .from('scrap_listing_addresses')
      .insert({ listing_id: listingId, address: '42 E2E Street, Pune' });
  }

  return { admin, collectorEmail, consumerEmail, collectorId, consumerId, listingId };
}

async function cleanup(admin, ids) {
  for (const id of ids.filter(Boolean)) {
    await admin.from('scrap_listings').delete().eq('consumer_id', id);
    await admin.from('scrap_listings').delete().eq('collector_id', id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function signIn(page, email) {
  await page.goto('/signin');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  // Wait for the sign-in round trip before navigating: the session is written to
  // storage when the request resolves, and a reload before that loses it.
  await expect(page).toHaveURL(/\/dashboard\/(consumer|collector|aggregator|recycler)$/);
}

test.describe('Collector marketplace', () => {
  test.skip(!configured, 'Requires a running local Supabase and integration env vars');

  test('collector signs in and sees real dashboard totals', async ({ page }) => {
    const zone = `E2E Zone ${Date.now()}`;
    const fixture = await seed({ zone });
    try {
      await signIn(page, fixture.collectorEmail);
      await expect(page).toHaveURL(/\/dashboard\/collector$/);
      await expect(page.getByRole('heading', { name: 'Collector dashboard' })).toBeVisible();
      await expect(page.getByText('Available listings')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Browse marketplace' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Available Scrap Listings' })).toBeVisible();
      const available = await page.locator('.summary-card').first().locator('.summary-value').innerText();
      expect(Number(available)).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });

  test('collector browses and filters the marketplace', async ({ page }) => {
    const zone = `Filter Zone ${Date.now()}`;
    const fixture = await seed({ zone });
    try {
      await signIn(page, fixture.collectorEmail);
      await page.goto('/collector/marketplace');
      await expect(page.getByRole('heading', { name: 'Available Scrap Listings' })).toBeVisible();
      await expect(page.getByText(zone)).toBeVisible();

      await page.getByLabel('Pickup zone').fill(zone);
      await expect(page.getByText(zone)).toBeVisible();

      await page.getByLabel('Pickup zone').fill('No Such Zone');
      await expect(page.getByText(/No listings match these filters/)).toBeVisible();
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });

  test('collector opens listing details and accepts a pickup', async ({ page }) => {
    const zone = `Accept Zone ${Date.now()}`;
    const fixture = await seed({ zone });
    try {
      await signIn(page, fixture.collectorEmail);
      await page.goto('/collector/marketplace');
      // Isolate this fixture: other tests are seeding listings concurrently.
      await page.getByLabel('Pickup zone').fill(zone);
      await page.getByRole('button', { name: 'Review listing' }).first().click();

      await expect(page.getByRole('heading', { name: 'E-waste' })).toBeVisible();
      await expect(page.getByText(/Indicative only/)).toBeVisible();
      await expect(
        page.getByText(/full address is shared once a collector accepts/),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Accept pickup' }).click();

      await expect(page.getByText(/42 E2E Street, Pune/)).toBeVisible();
      await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });

  test('collector completes a pickup from pickup management', async ({ page }) => {
    const zone = `Complete Zone ${Date.now()}`;
    const fixture = await seed({ zone });
    try {
      await signIn(page, fixture.collectorEmail);
      await page.goto(`/listing/${fixture.listingId}`);

      await page.getByRole('button', { name: 'Accept pickup' }).click();
      await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

      await page.goto('/collector/pickups');
      await expect(page.getByRole('heading', { name: 'Pickup management' })).toBeVisible();
      await page.getByRole('button', { name: 'Open pickup' }).first().click();

      await page.getByLabel(/Actual Weight Collected/).fill('11.5');
      await page.getByRole('button', { name: 'Mark as collected' }).click();
      await expect(page.getByText('Collected', { exact: true }).first()).toBeVisible();

      await page.goto('/collector/pickups');
      await expect(page.getByRole('heading', { name: 'Completed Collections' })).toBeVisible();
      await expect(page.getByText(/actual weight 11.5 kg/)).toBeVisible();
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });

  test('consumer can submit a collector role request', async ({ page }) => {
    const fixture = await seed({ zone: 'Onboarding Zone', withListing: false, collector: false });
    try {
      await signIn(page, fixture.consumerEmail);
      await page.goto('/role-request');
      await expect(page.getByRole('heading', { name: 'Request another role' })).toBeVisible();

      await page.getByLabel('Role requested').selectOption('local_collector');
      await page.getByLabel('Your name').fill('E2E Consumer');
      await page.getByLabel('City or operating area').fill('Pune');
      await page.getByRole('button', { name: /^Submit request$/i }).click();

      await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible();
      await expect(page.getByText(/Local Kabadiwala/i)).toBeVisible();
      await expect(page.getByText(/pending/i)).toBeVisible();
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });

  test('non-collectors do not get the collector marketplace', async ({ page }) => {
    const fixture = await seed({ zone: 'Consumer Zone', withListing: false, collector: false });
    try {
      await signIn(page, fixture.consumerEmail);
      await page.goto('/collector/marketplace');
      await expect(page.getByRole('heading', { name: 'Collector access required' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Request collector access' })).toBeVisible();
    } finally {
      await cleanup(fixture.admin, [fixture.collectorId, fixture.consumerId]);
    }
  });
});
