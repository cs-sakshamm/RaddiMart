// Local-only review capture for signed-in screens without a database.
// A signed-in session is placed in storage and every PostgREST response is
// stubbed, so layout and states can be inspected while the real app and its
// components run unchanged. This script never contacts Supabase.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const APP = process.env.REVIEW_APP_URL || 'http://localhost:4173';
const OUT = process.env.REVIEW_OUT || '.hallmark/review/phase7';

let url = 'https://example.supabase.co';
try {
  const env = readFileSync('.env', 'utf8');
  url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim() || url;
} catch {
  // A missing .env is fine: the storage key is derived from the URL only.
}
const projectRef = new URL(url).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

const now = new Date('2026-11-26T09:30:00.000Z');
const iso = (daysAgo = 0) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

const USERS = {
  consumer: '00000000-0000-4000-8000-000000000001',
  collector: '00000000-0000-4000-8000-000000000002',
  aggregator: '00000000-0000-4000-8000-000000000003',
  recycler: '00000000-0000-4000-8000-000000000004',
};

const category = (id, name) => ({ id, name });
const CATEGORIES = {
  ewaste: category('cat-ewaste', 'E-waste'),
  metals: category('cat-metals', 'Metals'),
  paper: category('cat-paper', 'Paper'),
  plastics: category('cat-plastics', 'Plastics'),
};

function booking(options) {
  return {
    id: options.id,
    consumer_id: USERS.consumer,
    collector_id: options.collector_id || null,
    category_id: options.category.id,
    subcategory_id: null,
    approximate_weight: options.weight,
    actual_weight: options.actual_weight || null,
    condition: options.condition || 'Used',
    pickup_zone: options.zone || 'Pune West',
    preferred_pickup_time: iso(-1),
    photo_path: null,
    status: options.status,
    created_at: iso(options.days || 3),
    updated_at: iso(1),
    category: options.category,
    subcategory: null,
  };
}

const LISTINGS = [
  booking({ id: 'listing-open', category: CATEGORIES.ewaste, weight: 10, status: 'LISTED', days: 4 }),
  booking({ id: 'listing-accepted', category: CATEGORIES.paper, weight: 18.5, status: 'ACCEPTED', collector_id: USERS.collector, days: 3 }),
  booking({ id: 'listing-collected', category: CATEGORIES.metals, weight: 6, actual_weight: 5.4, status: 'COLLECTED', collector_id: USERS.collector, days: 7 }),
  booking({ id: 'listing-requested', category: CATEGORIES.plastics, weight: 3.2, status: 'PICKUP_REQUESTED', days: 2 }),
];

function lot(options) {
  return {
    id: options.id,
    lot_code: options.code,
    collector_id: USERS.collector,
    aggregator_id: options.aggregator_id ?? USERS.aggregator,
    category_id: options.category.id,
    subcategory_id: null,
    source_listing_id: options.id,
    approximate_weight: options.weight,
    actual_weight: options.actual_weight || options.weight,
    condition: 'Used',
    pickup_zone: options.zone || 'Pune West',
    status: 'IN_AGGREGATOR_INVENTORY',
    created_at: iso(options.days || 5),
    updated_at: iso(2),
    category: options.category,
    subcategory: null,
  };
}

const LOTS = [
  lot({ id: 'lot-intake', code: 'a1b2c3d4-0000-4000-8000-000000000001', category: CATEGORIES.ewaste, weight: 8.5, aggregator_id: null, zone: 'Pune East', days: 1 }),
  lot({ id: 'lot-owned', code: 'b2c3d4e5-0000-4000-8000-000000000002', category: CATEGORIES.metals, weight: 22.4, days: 6 }),
  lot({ id: 'lot-offered', code: 'c3d4e5f6-0000-4000-8000-000000000003', category: CATEGORIES.paper, weight: 14.2, days: 9 }),
];

function offer(options) {
  const offeredLot = options.lot;
  return {
    id: options.id,
    tx_reference: options.id,
    lot_id: offeredLot.id,
    recycler_id: options.recycler_id || 'recycler-1',
    offered_rate: options.rate,
    final_value: Math.round(options.rate * 22.4 * 100) / 100,
    status: options.status,
    payment_status: options.payment_status || 'PENDING',
    created_at: iso(options.days || 2),
    updated_at: iso(1),
    lot: offeredLot,
    recycler: {
      id: options.recycler_id || 'recycler-1',
      facility_name: 'EcoCycle Material Recovery',
      location: 'Chakan, Pune',
      verification_status: 'verified',
    },
  };
}

const OFFERS = [
  offer({ id: 'offer-live', lot: LOTS[2], rate: 26.5, status: 'OFFERED_TO_RECYCLER', days: 1 }),
  offer({ id: 'offer-accepted', lot: LOTS[1], rate: 31, status: 'ACCEPTED_BY_RECYCLER', days: 3 }),
];

const PROFILES = {
  consumer: { id: USERS.consumer, full_name: 'Ananya Sharma', phone: '+91 98200 00001', active_role: 'consumer', is_admin: false },
  collector: { id: USERS.collector, full_name: 'Ravi Kabadiwala', phone: '+91 98200 00002', active_role: 'collector', is_admin: false },
  aggregator: { id: USERS.aggregator, full_name: 'GreenLoop Aggregators', phone: '+91 98200 00003', active_role: 'aggregator', is_admin: false },
  recycler: { id: USERS.recycler, full_name: 'EcoCycle Facilitation', phone: '+91 98200 00004', active_role: 'recycler', is_admin: false },
};

const FACILITY = {
  id: 'recycler-1',
  profile_id: USERS.recycler,
  facility_name: 'EcoCycle Material Recovery',
  location: 'Chakan, Pune',
  contact_email: 'facility@example.com',
  accepted_categories: ['E-waste', 'Metals'],
  verification_status: 'verified',
  created_at: iso(30),
  updated_at: iso(2),
};

function session(user, role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: user.id,
      email: `${role}@raddimart.test`,
      role: 'authenticated',
      exp: Math.floor(now.getTime() / 1000) + 3600,
    }),
    'stub-signature',
  ].join('.');

  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(now.getTime() / 1000) + 3600,
    refresh_token: 'stub-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${role}@raddimart.test`,
      email_confirmed_at: iso(20),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: user.full_name },
      created_at: iso(20),
    },
  };
}

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubApi(page, role) {
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');

    if (path.endsWith('/profiles')) return json(route, single ? PROFILES[role] : [PROFILES[role]]);
    if (path.endsWith('/scrap_listings')) return json(route, single ? LISTINGS[0] : LISTINGS);
    if (path.endsWith('/scrap_listing_addresses')) return json(route, single ? { listing_id: LISTINGS[0].id, address: '12 Baner Road, Pune 411045' } : []);
    if (path.endsWith('/material_categories')) {
      return json(route, Object.values(CATEGORIES).map((item) => ({ ...item, parent_id: null, is_subcategory: false })));
    }
    if (path.endsWith('/price_rates')) {
      return json(route, [
        { category_id: CATEGORIES.ewaste.id, rate_per_kg: 42, is_active: true },
        { category_id: CATEGORIES.metals.id, rate_per_kg: 31, is_active: true },
        { category_id: CATEGORIES.paper.id, rate_per_kg: 14, is_active: true },
        { category_id: CATEGORIES.plastics.id, rate_per_kg: 9, is_active: true },
      ]);
    }
    if (path.endsWith('/material_lots')) return json(route, single ? LOTS[1] : LOTS);
    if (path.endsWith('/transactions')) return json(route, single ? OFFERS[0] : OFFERS);
    if (path.endsWith('/recyclers')) return json(route, single ? FACILITY : [FACILITY]);
    if (path.endsWith('/role_requests')) return json(route, []);
    if (path.endsWith('/transaction_events')) return json(route, []);
    if (path.includes('/rpc/')) return json(route, null);
    return json(route, []);
  });
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

async function capture(role, viewport, label, routes) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey, JSON.stringify(session(PROFILES[role], role))],
  );
  const page = await context.newPage();
  await stubApi(page, role);
  for (const [path, name, fullPage = true] of routes) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) console.warn(`Horizontal overflow ${overflow}px: ${path} (${label})`);
    await page.screenshot({ path: `${OUT}/${name}-${label}.jpg`, fullPage, type: 'jpeg', quality: 66 });
  }
  await context.close();
}

const sizes = [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
];

for (const [label, viewport] of sizes) {
  await capture('consumer', viewport, label, [
    ['/dashboard/consumer', 'consumer-dashboard'],
    ['/dashboard/create-listing', 'consumer-create-listing'],
    ['/listing/listing-open', 'consumer-listing-details'],
    ['/profile', 'profile'],
  ]);
  await capture('collector', viewport, label, [
    ['/dashboard/collector', 'collector-dashboard'],
    ['/collector/marketplace', 'collector-marketplace'],
    ['/collector/pickups', 'collector-pickups'],
  ]);
  await capture('aggregator', viewport, label, [
    ['/dashboard/aggregator', 'aggregator-dashboard'],
    ['/aggregator/inventory', 'aggregator-inventory'],
  ]);
  await capture('recycler', viewport, label, [
    ['/dashboard/recycler', 'recycler-dashboard'],
    ['/recycler/offers', 'recycler-offers'],
    ['/recycler/facility', 'recycler-facility'],
  ]);
}

await browser.close();
console.log('Phase 7 signed-in screenshots written to', OUT);
