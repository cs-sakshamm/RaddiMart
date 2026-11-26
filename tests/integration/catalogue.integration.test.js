import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createListing, fetchCatalogue } from '../../src/lib/listingsApi.js';

// Real local Supabase checks for the catalogue and listing submission path.
// These tests create and delete one local user; they refuse to run against a
// hosted project. Skip with no INTEGRATION_* environment variables.

const url = process.env.INTEGRATION_SUPABASE_URL;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
if (url && !isLocal) {
  throw new Error(`Refusing catalogue integration tests against non-local URL: ${url}`);
}
const configured = Boolean(url && anonKey && serviceKey && isLocal);

if (!configured) {
  console.warn(
    '[integration] Skipping catalogue integration tests: set INTEGRATION_SUPABASE_URL, ' +
      'INTEGRATION_SUPABASE_ANON_KEY and INTEGRATION_SUPABASE_SERVICE_KEY to run them.',
  );
}

const PASSWORD = 'local-test-password-123';
const email = `catalogue-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.local`;

let admin;
let consumer;
let userId;
let category;
let subcategory;
let otherSubcategory;

describe.skipIf(!configured)('Catalogue and listing integration (local Supabase)', () => {
  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Catalogue Integration' },
    });
    expect(created.error).toBeNull();
    userId = created.data.user.id;

    consumer = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await consumer.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signedIn.error).toBeNull();

    const categoryResult = await admin
      .from('material_categories')
      .select('id, name, parent_id')
      .eq('id', 'a1000000-0000-4000-8000-000000000001')
      .single();
    expect(categoryResult.error).toBeNull();
    category = categoryResult.data;

    const subcategoryResult = await admin
      .from('material_categories')
      .select('id, name, parent_id')
      .eq('id', 'a1000000-0000-4000-8000-000000000101')
      .single();
    expect(subcategoryResult.error).toBeNull();
    subcategory = subcategoryResult.data;

    const otherResult = await admin
      .from('material_categories')
      .select('id, name, parent_id')
      .eq('id', 'a1000000-0000-4000-8000-000000000201')
      .single();
    expect(otherResult.error).toBeNull();
    otherSubcategory = otherResult.data;
  }, 120000);

  afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from('scrap_listings').delete().eq('consumer_id', userId);
    await admin.auth.admin.deleteUser(userId);
  }, 60000);

  it('lets a signed-in consumer read parents, subcategories and an active rate', async () => {
    const { data, error } = await fetchCatalogue(consumer);

    expect(error).toBeNull();
    expect(data.categories.length).toBeGreaterThanOrEqual(5);
    const parent = data.categories.find((item) => item.id === category.id);
    expect(parent).toBeTruthy();
    expect(parent.subcategories.some((item) => item.id === subcategory.id)).toBe(true);
    expect(data.rateByCategory[category.id]).toBeGreaterThan(0);
  });

  it('creates a listing with the selected category and subcategory IDs', async () => {
    const { data, error } = await createListing(consumer, {
      userId,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      approximateWeight: '12.5',
      condition: 'Used',
      address: '18 Catalogue Test Road, Pune',
      pickupZone: 'Pune West',
      preferredPickupTime: null,
    });

    expect(error).toBeNull();

    const listing = await admin
      .from('scrap_listings')
      .select('consumer_id, category_id, subcategory_id, approximate_weight, status')
      .eq('id', data.id)
      .single();
    expect(listing.error).toBeNull();
    expect(listing.data).toMatchObject({
      consumer_id: userId,
      category_id: category.id,
      subcategory_id: subcategory.id,
      status: 'LISTED',
    });

    const address = await admin
      .from('scrap_listing_addresses')
      .select('address')
      .eq('listing_id', data.id)
      .single();
    expect(address.data.address).toBe('18 Catalogue Test Road, Pune');
  });

  it('rejects a subcategory that belongs to a different parent', async () => {
    const { data, error } = await createListing(consumer, {
      userId,
      categoryId: category.id,
      subcategoryId: otherSubcategory.id,
      approximateWeight: '2',
      condition: 'Used',
      address: '19 Catalogue Test Road, Pune',
    });

    expect(data).toBeNull();
    expect(error).toBe('Failed to create the listing. Please try again.');
  });
});
