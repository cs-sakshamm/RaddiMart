// Local-only UI review fixtures and screenshots for Hallmark.
// Creates real accounts and listings in the local Supabase instance, signs in
// through the real UI and captures each implemented screen at desktop and phone.
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
  emails[key] = `review-${key}-${run}@test.local`;
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
  const { data: cats } = await admin
    .from('material_categories')
    .select('id, name, parent_id')
    .order('name');
  const eWaste = cats.find((c) => c.name === 'E-waste');
  const cables = cats.find((c) => c.name === 'Cables and wires' && c.parent_id === eWaste.id);
  const paper = cats.find((c) => c.name === 'Paper');
  const newspaper = cats.find((c) => c.name === 'Newspapers' && c.parent_id === paper.id);
  const metals = cats.find((c) => c.name === 'Metals');
  const copper = cats.find((c) => c.name === 'Copper' && c.parent_id === metals?.id);

  await user('consumer', 'Ananya Sharma', null);
  await user('collector', 'Ravi Kabadiwala', 'collector');
  await user('aggregator', 'GreenLoop Aggregators', 'aggregator');
  await user('recycler', 'EcoCycle Facilitation', 'recycler');

  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const listings = [
    { key: 'open', status: 'LISTED', zone: 'Pune West', weight: 10, cat: eWaste.id, sub: cables?.id, address: '12 Baner Road, Pune 411045', condition: 'Used' },
    { key: 'accepted', status: 'ACCEPTED', zone: 'Pune West', weight: 18.5, cat: paper.id, sub: newspaper?.id, address: '8 Aundh Colony, Pune 411007', condition: 'Used', collector: ids.collector },
    { key: 'collected', status: 'COLLECTED', zone: 'Pune East', weight: 6, cat: metals?.id, sub: copper?.id, address: '44 Kharadi, Pune 411014', condition: 'Refurbished', collector: ids.collector, actual: 5.4 },
    { key: 'second', status: 'PICKUP_REQUESTED', zone: 'Pune East', weight: 3.2, cat: eWaste.id, sub: cables?.id, address: '2 Viman Nagar, Pune 411014', condition: 'For Parts' },
  ];
  ids.listings = {};
  for (const l of listings) {
    const { data, error } = await admin
      .from('scrap_listings')
      .insert({
        consumer_id: ids.consumer,
        collector_id: l.collector || null,
        category_id: l.cat,
        subcategory_id: l.sub || null,
        approximate_weight: l.weight,
        actual_weight: l.actual || null,
        condition: l.condition,
        pickup_zone: l.zone,
        preferred_pickup_time: tomorrow,
        status: l.status,
        created_at: yesterday,
      })
      .select('id')
      .single();
    if (error) throw error;
    ids.listings[l.key] = data.id;
    await admin.from('scrap_listing_addresses').insert({ listing_id: data.id, address: l.address });
  }

  writeFileSync('/tmp/review-fixtures.json', JSON.stringify({ ids, emails, password: PASSWORD }, null, 2));

  const browser = await chromium.launch();
  async function session(key, viewport, name) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${APP}/signin`);
    await page.getByLabel(/^Email/).fill(emails[key]);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign In$/ }).click();
    await page.waitForURL(/\/dashboard\//);
    return { context, page };
  }

  const sizes = [
    { label: 'desktop', viewport: { width: 1440, height: 900 } },
    { label: 'phone', viewport: { width: 390, height: 844 } },
  ];

  async function shot(page, name, full = true) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  }

  // Public pages need no session.
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(APP);
  await publicPage.getByRole('dialog').waitFor({ state: 'visible' }).catch(() => {});
  await shot(publicPage, 'public-home-popup');
  await publicPage.keyboard.press('Escape');
  await publicPage.waitForTimeout(200);
  await shot(publicPage, 'public-home');
  await publicPage.goto(`${APP}/signin`);
  await shot(publicPage, 'public-signin');
  await publicPage.goto(`${APP}/signup`);
  await shot(publicPage, 'public-signup');
  await publicContext.close();

  for (const { label, viewport } of sizes) {
    const consumer = await session('consumer', viewport);
    for (const [path, name] of [
      ['/dashboard/consumer', 'consumer-dashboard'],
      ['/dashboard/create-listing', 'consumer-create-listing'],
      [`/listing/${ids.listings.open}`, 'consumer-listing-details'],
    ]) {
      await consumer.page.goto(`${APP}${path}`);
      await consumer.page.waitForTimeout(500);
      await shot(consumer.page, `${name}-${label}`);
    }
    await consumer.context.close();

    const collector = await session('collector', viewport);
    for (const [path, name] of [
      ['/dashboard/collector', 'collector-dashboard'],
      ['/collector/marketplace', 'collector-marketplace'],
      ['/collector/pickups', 'collector-pickups'],
      [`/listing/${ids.listings.accepted}`, 'collector-listing-details'],
    ]) {
      await collector.page.goto(`${APP}${path}`);
      await collector.page.waitForTimeout(500);
      await shot(collector.page, `${name}-${label}`);
    }
    await collector.context.close();

    for (const key of ['aggregator', 'recycler']) {
      const s = await session(key, viewport);
      await s.page.goto(`${APP}/dashboard/${key}`);
      await s.page.waitForTimeout(500);
      await shot(s.page, `${key}-dashboard-${label}`);
      await s.context.close();
    }

    const consumer2 = await session('consumer', viewport);
    await consumer2.page.goto(`${APP}/role-request`);
    await consumer2.page.waitForTimeout(500);
    await shot(consumer2.page, `role-request-${label}`);
    await consumer2.page.goto(`${APP}/profile`);
    await consumer2.page.waitForTimeout(500);
    await shot(consumer2.page, `profile-${label}`);
    await consumer2.context.close();
  }

  await browser.close();
  console.log('Captured review screens to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
