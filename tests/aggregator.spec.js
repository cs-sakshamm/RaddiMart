import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Phase 5 browser tests. They need a LOCAL Supabase instance and a build that
// points at it (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), plus the
// INTEGRATION_* variables for fixtures. Skipped when those are absent.

const url = process.env.INTEGRATION_SUPABASE_URL;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
const configured = Boolean(url && serviceKey && anonKey && isLocal);
const PASSWORD = 'local-test-password-123';

function adminClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createUser(admin, email, fullName, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Could not create ${email}: ${error.message}`);
  if (role) await admin.from('profiles').update({ active_role: role }).eq('id', data.user.id);
  return data.user.id;
}

async function seed({ withOffer = false } = {}) {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const zone = `P5 E2E ${stamp}`;

  const consumerId = await createUser(admin, `p5-consumer-${stamp}@test.local`, 'P5 Consumer');
  const collectorEmail = `p5-collector-${stamp}@test.local`;
  const collectorId = await createUser(admin, collectorEmail, 'P5 Collector', 'collector');
  const aggregatorId = await createUser(admin, `p5-agg-${stamp}@test.local`, 'P5 Aggregator', 'aggregator');
  const recyclerId = await createUser(admin, `p5-recycler-${stamp}@test.local`, 'P5 Recycler', 'recycler');

  const { data: category, error: catError } = await admin
    .from('material_categories')
    .select('id')
    .eq('name', 'E-waste')
    .single();
  if (catError) throw new Error('Material catalogue is not seeded (run supabase db reset)');

  const { data: listing, error: listingError } = await admin
    .from('scrap_listings')
    .insert({
      consumer_id: consumerId,
      collector_id: collectorId,
      category_id: category.id,
      approximate_weight: 10,
      condition: 'Used',
      pickup_zone: zone,
      status: 'ACCEPTED',
    })
    .select('id')
    .single();
  if (listingError) throw new Error(`Could not seed listing: ${listingError.message}`);

  // Complete the collection as the collector so the database creates the lot.
  const collectorClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await collectorClient.auth.signInWithPassword({
    email: collectorEmail,
    password: PASSWORD,
  });
  if (signIn.error) throw new Error(`Could not sign in seed collector: ${signIn.error.message}`);
  const { error: collectError } = await collectorClient
    .from('scrap_listings')
    .update({ status: 'COLLECTED', actual_weight: 9.5 })
    .eq('id', listing.id);
  if (collectError) throw new Error(`Could not complete seed collection: ${collectError.message}`);

  await admin
    .from('scrap_listing_addresses')
    .insert({ listing_id: listing.id, address: '5 Phase Five Street, Pune' });

  const { data: lot, error: lotError } = await admin
    .from('material_lots')
    .select('id, lot_code')
    .eq('source_listing_id', listing.id)
    .single();
  if (lotError) throw new Error(`Lot was not created automatically: ${lotError.message}`);

  const { data: facility, error: facilityError } = await admin
    .from('recyclers')
    .insert({
      profile_id: recyclerId,
      facility_name: `P5 Facility ${stamp}`,
      location: 'Pune',
      accepted_categories: ['E-waste'],
      verification_status: 'pending',
    })
    .select('id')
    .single();
  if (facilityError) throw new Error(`Could not seed facility: ${facilityError.message}`);

  let offerId = null;
  if (withOffer) {
    await admin.from('material_lots').update({ aggregator_id: aggregatorId }).eq('id', lot.id);
    const { data: offer, error: offerError } = await admin
      .from('transactions')
      .insert({
        lot_id: lot.id,
        recycler_id: facility.id,
        offered_rate: 95,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id')
      .single();
    if (offerError) throw new Error(`Could not seed offer: ${offerError.message}`);
    offerId = offer.id;
  }

  return {
    admin,
    zone,
    lot,
    facility,
    offerId,
    emails: {
      consumer: `p5-consumer-${stamp}@test.local`,
      aggregator: `p5-agg-${stamp}@test.local`,
      recycler: `p5-recycler-${stamp}@test.local`,
    },
    ids: { consumerId, collectorId, aggregatorId, recyclerId, listingId: listing.id },
  };
}

async function cleanup(fixture) {
  const { admin, ids, lot, facility } = fixture;
  await admin.from('transactions').delete().eq('lot_id', lot.id);
  await admin.from('material_lots').delete().eq('id', lot.id);
  await admin.from('scrap_listings').delete().eq('id', ids.listingId);
  await admin.from('recyclers').delete().eq('id', facility.id);
  for (const id of [ids.consumerId, ids.collectorId, ids.aggregatorId, ids.recyclerId]) {
    await admin.auth.admin.deleteUser(id);
  }
}

async function signIn(page, email) {
  await page.goto('/signin');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/(consumer|collector|aggregator|recycler)$/);
}

test.describe('Aggregator inventory and offers', () => {
  test.skip(!configured, 'Requires a running local Supabase and integration env vars');

  test('aggregator receives a lot, sends an offer and withdraws it', async ({ page }) => {
    const fixture = await seed();
    try {
      await signIn(page, fixture.emails.aggregator);
      await expect(page.getByRole('heading', { name: 'Aggregator dashboard' })).toBeVisible();

      await page.goto('/aggregator/inventory');
      await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
      await page.getByLabel('Search').fill(fixture.lot.lot_code.slice(0, 8));
      await expect(page.getByText(fixture.zone)).toBeVisible();
      await page.getByRole('button', { name: 'Receive lot' }).first().click();
      await expect(page.getByText(/In inventory/).first()).toBeVisible();

      await page.getByRole('button', { name: 'Open lot' }).first().click();
      await expect(page.getByRole('heading', { name: 'E-waste' })).toBeVisible();
      await page.getByLabel('Recycler facility').selectOption(fixture.facility.id);
      await page.getByLabel(/Buying rate/).fill('95');
      await expect(page.getByText(/₹902\.50/)).toBeVisible();
      await page.getByRole('button', { name: 'Send offer' }).click();
      await expect(page.getByText('Offer sent to the recycler.')).toBeVisible();
      await expect(page.getByText('Open offer', { exact: true })).toBeVisible();

      await page.goto('/aggregator/offers');
      await page.getByLabel('Search').fill(fixture.lot.lot_code.slice(0, 8));
      await expect(page.locator('.status-pill').filter({ hasText: 'Awaiting recycler' }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Withdraw', exact: true }).first().click();
      await page.getByRole('button', { name: 'Confirm withdraw' }).click();
      await expect(page.getByText(/Offer withdrawn/)).toBeVisible();
      await expect(page.locator('.status-pill').filter({ hasText: 'Withdrawn' }).first()).toBeVisible();
    } finally {
      await cleanup(fixture);
    }
  });

  test('recycler sees the facility verification fact and the incoming offer', async ({ page }) => {
    const fixture = await seed({ withOffer: true });
    try {
      await signIn(page, fixture.emails.recycler);
      await expect(page.getByRole('heading', { name: 'Recycler dashboard' })).toBeVisible();
      await expect(page.getByText('Verification pending')).toBeVisible();
      await expect(page.getByText(`Lot ${fixture.lot.lot_code.slice(0, 8).toUpperCase()}`)).toBeVisible();
      await expect(page.getByText('Awaiting recycler').first()).toBeVisible();

      await page.goto('/recycler/facility');
      await expect(page.getByRole('heading', { name: 'Facility profile' })).toBeVisible();
      await expect(page.getByText('Verification pending')).toBeVisible();
      await expect(page.getByText(/does not describe a facility as/)).toBeVisible();
    } finally {
      await cleanup(fixture);
    }
  });

  test('non-aggregators do not get inventory access', async ({ page }) => {
    const fixture = await seed();
    try {
      await signIn(page, fixture.emails.consumer);
      await page.goto('/aggregator/inventory');
      await expect(page.getByRole('heading', { name: 'Aggregator access required' })).toBeVisible();
    } finally {
      await cleanup(fixture);
    }
  });
});
