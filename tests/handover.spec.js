import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Phase 6 browser test. Requires a LOCAL Supabase instance and a local build of
// the app (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), plus INTEGRATION_* vars.
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

async function seed() {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const zone = `P6 E2E ${stamp}`;

  const consumerId = await createUser(admin, `p6-e2e-consumer-${stamp}@test.local`, 'P6 Consumer');
  const collectorEmail = `p6-e2e-collector-${stamp}@test.local`;
  const collectorId = await createUser(admin, collectorEmail, 'P6 Collector', 'collector');
  const aggregatorId = await createUser(admin, `p6-e2e-agg-${stamp}@test.local`, 'P6 Aggregator', 'aggregator');
  const recyclerId = await createUser(admin, `p6-e2e-recycler-${stamp}@test.local`, 'P6 Recycler', 'recycler');

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

  await admin.from('scrap_listing_addresses').insert({
    listing_id: listing.id,
    address: '77 Hidden Consumer Road, Pune',
  });

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
      facility_name: `P6 Facility ${stamp}`,
      location: 'Pune',
      accepted_categories: ['E-waste'],
      verification_status: 'pending',
    })
    .select('id')
    .single();
  if (facilityError) throw new Error(`Could not seed facility: ${facilityError.message}`);

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

  return {
    admin,
    lot,
    facility,
    offer,
    emails: {
      consumer: `p6-e2e-consumer-${stamp}@test.local`,
      aggregator: `p6-e2e-agg-${stamp}@test.local`,
      recycler: `p6-e2e-recycler-${stamp}@test.local`,
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
  await page.getByRole('button', { name: /^Sign In$/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/(consumer|collector|aggregator|recycler)$/);
}

test.describe('Phase 6 handover and verification', () => {
  test.skip(!configured, 'Requires a running local Supabase and integration env vars');

  test('accepts, records handover, pays, confirms receipt and verifies publicly', async ({ page }) => {
    const fixture = await seed();
    try {
      await signIn(page, fixture.emails.recycler);
      await page.goto('/recycler/offers');
      await expect(page.getByRole('heading', { name: 'Incoming Offers' })).toBeVisible();
      await page.getByRole('button', { name: 'Respond' }).first().click();
      await expect(page.getByRole('heading', { name: 'Your response' })).toBeVisible();
      await page.getByRole('button', { name: 'Accept offer' }).click();
      await page.getByRole('button', { name: 'Confirm accept' }).click();
      await expect(page.getByText(/Offer accepted/)).toBeVisible();
      await expect(page.getByText('Accepted. Awaiting handover.')).toBeVisible();

      await page.goto('/signout');
      await signIn(page, fixture.emails.aggregator);
      await page.goto(`/aggregator/offers/${fixture.offer.id}`);
      await expect(page.getByRole('heading', { name: 'Next action' })).toBeVisible();
      await page.getByLabel('Final received weight (kg)').fill('8.75');
      await page.getByLabel('Handover notes (optional)').fill('E2E handover at the facility gate.');
      await page.getByRole('button', { name: 'Review handover' }).click();
      await expect(page.getByText(/Record 8\.75 kg received/)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm handover' }).click();
      await expect(page.getByText(/Handover recorded/)).toBeVisible();
      await expect(page.getByText('Awaiting recycler confirmation')).toBeVisible();
      await expect(page.getByText('Payment pending')).toBeVisible();

      await page.getByRole('button', { name: 'Mark as paid' }).click();
      await page.getByRole('button', { name: 'Confirm payment' }).click();
      await expect(page.getByText('Payment recorded')).toBeVisible();

      await page.goto('/signout');
      await signIn(page, fixture.emails.recycler);
      await page.goto(`/recycler/offers/${fixture.offer.id}`);
      await expect(page.getByText('Handover recorded')).toBeVisible();
      await page.getByRole('button', { name: 'Confirm receipt' }).click();
      await expect(page.getByText(/Confirm that your facility received/)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm receipt' }).click();
      await expect(page.getByText(/Receipt confirmed/)).toBeVisible();
      await expect(page.getByText('Handover complete')).toBeVisible();
      const verifyLink = await page.getByRole('link', { name: 'Open verification page' }).getAttribute('href');
      expect(verifyLink).toMatch(/^\/verify\/[0-9a-f-]+$/i);

      const publicPage = await page.context().browser().newPage();
      await publicPage.goto(verifyLink);
      await expect(publicPage.getByRole('heading', { name: 'Material handover completed' })).toBeVisible();
      await expect(publicPage.getByText('8.75 kg')).toBeVisible();
      await expect(publicPage.getByText('P6 Facility')).toBeVisible();
      await expect(publicPage.getByText('Hidden Consumer Road')).toHaveCount(0);
      await expect(publicPage.getByText('77 Hidden')).toHaveCount(0);
      await expect(publicPage.getByText('Payment')).toHaveCount(0);
      await publicPage.close();
    } finally {
      await cleanup(fixture);
    }
  });
});
