// Local-only Phase 6 fixtures and screenshots. Never run against a remote URL.
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.REVIEW_SUPABASE_URL;
const ANON = process.env.REVIEW_SUPABASE_ANON_KEY;
const SERVICE = process.env.REVIEW_SUPABASE_SERVICE_KEY;
const APP = process.env.REVIEW_APP_URL || 'http://localhost:4173';
const OUT = process.env.REVIEW_OUT || '.hallmark/review';
const PASSWORD = 'local-test-password-123';
if (!URL || !ANON || !SERVICE || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL)) {
  console.error('Review capture needs a loopback REVIEW_SUPABASE_URL plus keys.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const run = `${Date.now()}`;
const ids = {};
const emails = {};

async function user(key, label, role) {
  emails[key] = `review6-${key}-${run}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email: emails[key],
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: label },
  });
  if (error) throw error;
  ids[key] = data.user.id;
  if (role) await admin.from('profiles').update({ active_role: role }).eq('id', ids[key]);
}

async function makeLot({ categoryId, subcategoryId, weight, zone, condition, collector }) {
  const { data: listing, error } = await admin
    .from('scrap_listings')
    .insert({
      consumer_id: ids.consumer,
      collector_id: ids.collector,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      approximate_weight: weight + 0.5,
      condition,
      pickup_zone: zone,
      status: 'ACCEPTED',
    })
    .select('id')
    .single();
  if (error) throw error;
  await admin.from('scrap_listing_addresses').insert({
    listing_id: listing.id,
    address: '42 Hidden Consumer Road, Pune',
  });
  const { error: collectError } = await collector
    .from('scrap_listings')
    .update({ status: 'COLLECTED', actual_weight: weight })
    .eq('id', listing.id);
  if (collectError) throw collectError;
  const { data: lot, error: lotError } = await admin
    .from('material_lots')
    .select('id, lot_code')
    .eq('source_listing_id', listing.id)
    .single();
  if (lotError) throw lotError;
  await admin.from('material_lots').update({ aggregator_id: ids.aggregator }).eq('id', lot.id);
  return { listing, lot };
}

async function makeOffer({ lot, facility, rate }) {
  const { data, error } = await admin
    .from('transactions')
    .insert({
      lot_id: lot.id,
      recycler_id: facility.id,
      offered_rate: rate,
      status: 'OFFERED_TO_RECYCLER',
      payment_status: 'PENDING',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const { data: cats } = await admin.from('material_categories').select('id, name, parent_id').order('name');
  const eWaste = cats.find((c) => c.name === 'E-waste');
  const cables = cats.find((c) => c.name === 'Cables and wires' && c.parent_id === eWaste.id);
  const metals = cats.find((c) => c.name === 'Metals');
  const copper = cats.find((c) => c.name === 'Copper' && c.parent_id === metals.id);
  const paper = cats.find((c) => c.name === 'Paper');

  await user('consumer', 'Ananya Sharma');
  await user('collector', 'Ravi Kabadiwala', 'collector');
  await user('aggregator', 'GreenLoop Aggregators', 'aggregator');
  await user('recycler', 'EcoCycle Facilitation', 'recycler');

  const collector = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await collector.auth.signInWithPassword({
    email: emails.collector,
    password: PASSWORD,
  });
  if (signIn.error) throw signIn.error;

  const { data: facility, error: facilityError } = await admin
    .from('recyclers')
    .insert({
      profile_id: ids.recycler,
      facility_name: 'EcoCycle Facilitation',
      location: 'Pune',
      contact_email: 'private-facility@example.test',
      accepted_categories: ['E-waste', 'Metals'],
      verification_status: 'pending',
    })
    .select('id')
    .single();
  if (facilityError) throw facilityError;

  const offered = await makeLot({
    categoryId: eWaste.id,
    subcategoryId: cables?.id,
    weight: 9.5,
    zone: 'Pune West',
    condition: 'Used',
    collector,
  });
  const offeredOffer = await makeOffer({ lot: offered.lot, facility, rate: 95 });

  const accepted = await makeLot({
    categoryId: metals.id,
    subcategoryId: copper?.id,
    weight: 24,
    zone: 'Pune East',
    condition: 'Refurbished',
    collector,
  });
  const acceptedOffer = await makeOffer({ lot: accepted.lot, facility, rate: 88 });
  await admin.from('transactions').update({ status: 'ACCEPTED_BY_RECYCLER' }).eq('id', acceptedOffer.id);

  const handed = await makeLot({
    categoryId: paper.id,
    weight: 41,
    zone: 'Pune Central',
    condition: 'Used',
    collector,
  });
  const handedOffer = await makeOffer({ lot: handed.lot, facility, rate: 14 });
  await admin.from('transactions').update({ status: 'ACCEPTED_BY_RECYCLER' }).eq('id', handedOffer.id);
  const { error: handoverError } = await admin.from('handover_records').insert({
    transaction_id: handedOffer.id,
    received_weight: 39.6,
    handover_timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    notes: 'Delivered by tempo; bales weighed at the facility gate.',
  });
  if (handoverError) throw handoverError;

  const completed = await makeLot({
    categoryId: eWaste.id,
    subcategoryId: cables?.id,
    weight: 13.2,
    zone: 'Pune West',
    condition: 'For Parts',
    collector,
  });
  const completedOffer = await makeOffer({ lot: completed.lot, facility, rate: 72 });
  await admin.from('transactions').update({ status: 'ACCEPTED_BY_RECYCLER' }).eq('id', completedOffer.id);
  const { data: completedHandover, error: completedHandoverError } = await admin
    .from('handover_records')
    .insert({
      transaction_id: completedOffer.id,
      received_weight: 12.7,
      handover_timestamp: new Date(Date.now() - 86400000).toISOString(),
      notes: 'Receipt confirmed at the facility.',
    })
    .select('id, qr_token')
    .single();
  if (completedHandoverError) throw completedHandoverError;
  await admin
    .from('handover_records')
    .update({ recycler_confirmation: true })
    .eq('id', completedHandover.id);

  writeFileSync(
    '/tmp/review6-fixtures.json',
    JSON.stringify({ ids, emails, facility, qrToken: completedHandover.qr_token, offers: { offeredOffer, acceptedOffer, handedOffer, completedOffer } }, null, 2),
  );

  const browser = await chromium.launch();
  async function session(key, viewport) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${APP}/signin`);
    await page.getByLabel(/^Email/).fill(emails[key]);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign In$/ }).click();
    await page.waitForURL(/\/dashboard\//);
    return { context, page };
  }

  for (const { label, viewport } of [
    { label: 'desktop', viewport: { width: 1440, height: 900 } },
    { label: 'phone', viewport: { width: 390, height: 844 } },
  ]) {
    const agg = await session('aggregator', viewport);
    for (const [path, name] of [
      ['/aggregator/offers', 'p6-aggregator-offers'],
      [`/aggregator/offers/${offeredOffer.id}`, 'p6-aggregator-offer-open'],
      [`/aggregator/offers/${acceptedOffer.id}`, 'p6-aggregator-handover-form'],
      [`/aggregator/offers/${handedOffer.id}`, 'p6-aggregator-awaiting-receipt'],
      [`/aggregator/offers/${completedOffer.id}`, 'p6-aggregator-completed'],
      ['/dashboard/aggregator', 'p6-aggregator-dashboard'],
    ]) {
      await agg.page.goto(`${APP}${path}`);
      await agg.page.waitForTimeout(500);
      await agg.page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
    }
    await agg.context.close();

    const rec = await session('recycler', viewport);
    for (const [path, name] of [
      ['/recycler/offers', 'p6-recycler-offers'],
      [`/recycler/offers/${offeredOffer.id}`, 'p6-recycler-offer-response'],
      [`/recycler/offers/${acceptedOffer.id}`, 'p6-recycler-accepted'],
      [`/recycler/offers/${handedOffer.id}`, 'p6-recycler-confirm-receipt'],
      [`/recycler/offers/${completedOffer.id}`, 'p6-recycler-completed'],
      ['/dashboard/recycler', 'p6-recycler-dashboard'],
    ]) {
      await rec.page.goto(`${APP}${path}`);
      await rec.page.waitForTimeout(500);
      await rec.page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
    }
    await rec.context.close();

    const pub = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const pubPage = await pub.newPage();
    await pubPage.goto(`${APP}/verify/${completedHandover.qr_token}`);
    await pubPage.waitForTimeout(700);
    await pubPage.screenshot({ path: `${OUT}/p6-verify-${label}.png`, fullPage: true });
    await pubPage.goto(APP);
    await pubPage.getByRole('dialog').waitFor({ state: 'visible' }).catch(() => {});
    await pubPage.getByRole('button', { name: /close/i }).click().catch(() => {});
    await pubPage.waitForTimeout(500);
    await pubPage.screenshot({ path: `${OUT}/p6-public-home-${label}.png`, fullPage: true });
    await pub.close();
  }

  await browser.close();
  console.log('Captured Phase 6 review screens');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
