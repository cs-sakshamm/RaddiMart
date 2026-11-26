import { describe, expect, it } from 'vitest';
import { createListing, fetchCatalogue } from '../src/lib/listingsApi.js';

function queryResult(rows, error = null) {
  const state = { data: rows, error, calls: [] };
  const builder = {
    select(fields) {
      state.calls.push(['select', fields]);
      return builder;
    },
    order(column, options) {
      state.calls.push(['order', column, options]);
      return builder;
    },
    eq(column, value) {
      state.calls.push(['eq', column, value]);
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: state.data, error: state.error }).then(resolve, reject);
    },
  };
  return { builder, state };
}

function catalogueClient({ categories = [], categoryError = null, rates = [], rateError = null } = {}) {
  const categoryQuery = queryResult(categories, categoryError);
  const rateQuery = queryResult(rates, rateError);
  return {
    from(table) {
      if (table === 'material_categories') return categoryQuery.builder;
      if (table === 'price_rates') return rateQuery.builder;
      throw new Error(`Unexpected table: ${table}`);
    },
    queries: { categories: categoryQuery.state, rates: rateQuery.state },
  };
}

function listingClient({ addressError = null } = {}) {
  const calls = { listings: [], addresses: [], deletes: [] };
  return {
    calls,
    from(table) {
      if (table === 'scrap_listings') {
        return {
          insert(payload) {
            calls.listings.push(payload);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'listing-1' }, error: null }),
                };
              },
            };
          },
          delete() {
            return {
              eq(column, value) {
                calls.deletes.push({ column, value });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === 'scrap_listing_addresses') {
        return {
          insert(payload) {
            calls.addresses.push(payload);
            return Promise.resolve({ error: addressError ? { message: 'denied' } : null });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

const CATALOGUE = [
  { id: 'cat-paper', name: 'Paper', parent_id: null, is_subcategory: false },
  {
    id: 'sub-cardboard',
    name: 'Cardboard',
    parent_id: 'cat-paper',
    is_subcategory: true,
  },
  { id: 'cat-ewaste', name: 'E-waste', parent_id: null, is_subcategory: false },
  { id: 'sub-pcbs', name: 'PCBs', parent_id: 'cat-ewaste', is_subcategory: true },
  { id: 'orphan', name: 'Unattached', parent_id: 'missing', is_subcategory: true },
];

describe('fetchCatalogue', () => {
  it('builds the parent/subcategory hierarchy and numeric active rates', async () => {
    const client = catalogueClient({
      categories: CATALOGUE,
      rates: [
        { category_id: 'cat-ewaste', rate_per_kg: '28.50', is_active: true },
        { category_id: 'cat-paper', rate_per_kg: '9.00', is_active: false },
      ],
    });

    const { data, error } = await fetchCatalogue(client);

    expect(error).toBeNull();
    expect(data.categories.map((category) => category.name)).toEqual(['E-waste', 'Paper']);
    expect(data.categories[0].subcategories.map((subcategory) => subcategory.id)).toEqual([
      'sub-pcbs',
    ]);
    expect(data.categories[1].subcategories.map((subcategory) => subcategory.id)).toEqual([
      'sub-cardboard',
    ]);
    expect(data.rateByCategory).toEqual({ 'cat-ewaste': 28.5 });
    expect(client.queries.rates.calls).toContainEqual(['eq', 'is_active', true]);
  });

  it('returns an empty taxonomy when the database has no categories', async () => {
    const { data, error } = await fetchCatalogue(catalogueClient());

    expect(error).toBeNull();
    expect(data).toEqual({ categories: [], rateByCategory: {} });
  });

  it('reports category read failures instead of presenting an empty catalogue', async () => {
    const { data, error } = await fetchCatalogue(
      catalogueClient({ categoryError: { message: 'permission denied' } }),
    );

    expect(data).toBeNull();
    expect(error).toBe('Could not load the material catalogue.');
  });

  it('reports rate read failures separately', async () => {
    const { data, error } = await fetchCatalogue(
      catalogueClient({ rateError: { message: 'network unavailable' } }),
    );

    expect(data).toBeNull();
    expect(error).toBe('Could not load indicative rates.');
  });
});

describe('createListing', () => {
  const basePayload = {
    userId: 'user-1',
    categoryId: 'cat-ewaste',
    subcategoryId: 'sub-pcbs',
    approximateWeight: '12.5',
    condition: 'Used',
    address: '12 Test Street, Pune',
    pickupZone: 'Pune West',
    preferredPickupTime: '2026-11-27T09:00:00.000Z',
  };

  it('stores the selected IDs, owner and pickup details', async () => {
    const client = listingClient();

    const { data, error } = await createListing(client, basePayload);

    expect(error).toBeNull();
    expect(data).toEqual({ id: 'listing-1', warning: '' });
    expect(client.calls.listings[0]).toMatchObject({
      consumer_id: 'user-1',
      category_id: 'cat-ewaste',
      subcategory_id: 'sub-pcbs',
      approximate_weight: 12.5,
      condition: 'Used',
      pickup_zone: 'Pune West',
      preferred_pickup_time: '2026-11-27T09:00:00.000Z',
      photo_path: null,
      status: 'LISTED',
    });
    expect(client.calls.addresses[0]).toEqual({
      listing_id: 'listing-1',
      address: '12 Test Street, Pune',
    });
  });

  it('maps an omitted subcategory and optional fields to null', async () => {
    const client = listingClient();

    await createListing(client, {
      ...basePayload,
      subcategoryId: '',
      pickupZone: '',
      preferredPickupTime: null,
      requestPickup: true,
    });

    expect(client.calls.listings[0]).toMatchObject({
      subcategory_id: null,
      pickup_zone: null,
      preferred_pickup_time: null,
      status: 'PICKUP_REQUESTED',
    });
  });

  it('removes a listing when its address cannot be saved', async () => {
    const client = listingClient({ addressError: true });

    const { data, error } = await createListing(client, basePayload);

    expect(data).toBeNull();
    expect(error).toBe('Failed to save the pickup address. Please try again.');
    expect(client.calls.deletes).toEqual([{ column: 'id', value: 'listing-1' }]);
  });
});
