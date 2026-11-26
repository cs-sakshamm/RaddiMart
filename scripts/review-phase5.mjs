// Local-only Phase 5 review fixtures and screenshots.
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
  emails[key] = `review5-${key}-${run}@test.local`;
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

async function main() {
  const { data: cats } = await admin.from('material_categories').select('id, name, parent_id').order('name');
  const eWaste = cats.find((c) => c.name === 'E-waste');
  const cables = cats.find((c) => c.name === 'Cables and wires' && c.parent_id === eWaste.id);
  const metals = cats.find((c) => c.name === 'Metals');
  const copper = cats.find((c) => c.name === 'Copper' && c.parent_id === metals.id);

  await user('consumer', 'Ananya Sharma');
  await user('collector', 'Ravi Kabadiwala', 'collector');
  await user('aggregator', 'GreenLoop Aggregators', 'aggregator');
  await user('recycler', 'EcoCycle Facilitation', 'recycler');

  const collectorClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const collectorSignIn = await collectorClient.auth.signInWithPassword({
    email: emails.collector,
    password: PASSWORD,
  });
  if (collectorSignIn.error) throw collectorSignIn.error;

  const { data: facility } = await admin
    .from('recyclers')
    .insert({
      profile_id: ids.recycler,
      facility_name: 'EcoCycle Facilitation',
      location: 'Pune',
      contact_email: 'facility@example.test',
      accepted_categories: ['E-waste', 'Metals'],
      verification_status: 'pending',
    })
    .select('id')
    .single();

  const lots = [];
  for (const [index, spec] of [
    { weight: 9.5, cat: eWaste.id, sub: cables?.id, zone: 'Pune West', condition: 'Used' },
    { weight: 24, cat: metals.id, sub: copper?.id, zone: 'Pune East', condition: 'Refurbished' },
    { weight: 6.2, cat: eWaste.id, sub: cables?.id, zone: 'Pune West', condition: 'For Parts' },
  ].entries()) {
    const { data: listing } = await admin
      .from('scrap_listings')
      .insert({
        consumer_id: ids.consumer,
        collector_id: ids.collector,
        category_id: spec.cat,
        subcategory_id: spec.sub || null,
        approximate_weight: spec.weight + 0.5,
        condition: spec.condition,
        pickup_zone: spec.zone,
        status: 'ACCEPTED',
        created_at: new Date(Date.now() - index * 86400000).toISOString(),
      })
      .select('id')
      .single();
    await admin.from('scrap_listing_addresses').insert({
      listing_id: listing.id,
      address: '12 Baner Road, Pune 411045',
    });
    const { error: collectError } = await collectorClient
      .from('scrap_listings')
      .update({ status: 'COLLECTED', actual_weight: spec.weight })
      .eq('id', listing.id);
    if (collectError) throw collectError;
    const { data: lot, error: lotError } = await admin
      .from('material_lots')
      .select('id, lot_code')
      .eq('source_listing_id', listing.id)
      .single();
    if (lotError) throw lotError;
    lots.push(lot);
  }

  // One lot in the aggregator's inventory with a live offer.
  await admin.from('material_lots').update({ aggregator_id: ids.aggregator }).eq('id', lots[0].id);
  await admin.from('transactions').insert({
    lot_id: lots[0].id,
    recycler_id: facility.id,
    offered_rate: 95,
    status: 'OFFERED_TO_RECYCLER',
    payment_status: 'PENDING',
  });
  // One withdrawn offer for history.
  await admin.from('material_lots').update({ aggregator_id: ids.aggregator }).eq('id', lots[1].id);
  await admin.from('transactions').insert({
    lot_id: lots[1].id,
    recycler_id: facility.id,
    offered_rate: 88,
    status: 'WITHDRAWN',
    payment_status: 'PENDING',
  });

  writeFileSync('/tmp/review5-fixtures.json', JSON.stringify({ ids, emails, lots, facility }, null, 2));

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
      ['/dashboard/aggregator', 'aggregator-dashboard'],
      ['/aggregator/inventory', 'aggregator-inventory'],
      [`/aggregator/inventory/${lots[2].id}`, 'aggregator-lot-intake'],
      [`/aggregator/inventory/${lots[0].id}`, 'aggregator-lot-offer'],
      ['/aggregator/offers', 'aggregator-offers'],
    ]) {
      await agg.page.goto(`${APP}${path}`);
      await agg.page.waitForTimeout(500);
      await agg.page.screenshot({ path: `${OUT}/${name}-${label}-v3.png`, fullPage: true });
    }
    await agg.context.close();

    const rec = await session('recycler', viewport);
    for (const [path, name] of [
      ['/dashboard/recycler', 'recycler-dashboard'],
      ['/recycler/facility', 'recycler-facility'],
    ]) {
      await rec.page.goto(`${APP}${path}`);
      await rec.page.waitForTimeout(500);
      await rec.page.screenshot({ path: `${OUT}/${name}-${label}-v3.png`, fullPage: true });
    }
    await rec.context.close();

    const pub = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const pubPage = await pub.newPage();
    await pubPage.goto(APP);
    await pubPage.getByRole('dialog').waitFor({ state: 'visible' }).catch(() => {});
    await pubPage.getByRole('button', { name: /close/i }).click().catch(() => {});
    await pubPage.waitForTimeout(400);
    await pubPage.screenshot({ path: `${OUT}/public-home-${label}-v3.png`, fullPage: true });
    await pub.close();
  }

  await browser.close();
  console.log('Captured Phase 5 review screens');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
