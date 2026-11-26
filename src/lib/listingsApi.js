// Supabase access for the scrap listing workflow.
// All functions return { data, error } where error is a user-facing string;
// authorization itself is enforced by the database RLS policies.

import { LISTING_STATUS, MARKETPLACE_STATUSES, buildMarketplaceFilters } from './listings.js';
import { PROFILE_MESSAGES, readOwnProfile } from './profileApi.js';

const PHOTO_BUCKET = 'scrap-listings';

const LISTING_SELECT = [
  'id',
  'consumer_id',
  'collector_id',
  'category_id',
  'subcategory_id',
  'approximate_weight',
  'actual_weight',
  'condition',
  'pickup_zone',
  'preferred_pickup_time',
  'photo_path',
  'status',
  'created_at',
  'updated_at',
  'category:material_categories!scrap_listings_category_id_fkey(id, name)',
  'subcategory:material_categories!scrap_listings_subcategory_id_fkey(id, name)',
].join(', ');

function fail(message) {
  return { data: null, error: message };
}

export async function getSessionUser(supabase) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.user;
}

// The profile read repairs a genuinely missing row once (see profileApi.js) and
// reports permission, network and server failures as themselves instead of
// calling every failure a missing profile.
export async function fetchOwnProfile(supabase) {
  const user = await getSessionUser(supabase);
  if (!user) return fail(PROFILE_MESSAGES.noSession);
  const { profile, error } = await readOwnProfile(supabase, user.id);
  if (error) return fail(error.message);
  return { data: { user, profile }, error: null };
}

export async function fetchCatalogue(supabase) {
  const [{ data: categories, error: catError }, { data: rates, error: rateError }] =
    await Promise.all([
      supabase.from('material_categories').select('id, name, parent_id, is_subcategory').order('name'),
      supabase.from('price_rates').select('category_id, rate_per_kg, is_active').eq('is_active', true),
    ]);

  if (catError) return fail('Could not load the material catalogue.');
  if (rateError) return fail('Could not load indicative rates.');

  const parents = (categories || []).filter((c) => !c.parent_id);
  const subcategories = (categories || []).filter((c) => c.parent_id);
  const rateByCategory = {};
  (rates || []).forEach((rate) => {
    if (rate.is_active === false) return;
    if (rate.category_id) rateByCategory[rate.category_id] = Number(rate.rate_per_kg);
  });

  return {
    data: {
      categories: parents
        .map((parent) => ({
          ...parent,
          subcategories: subcategories.filter((s) => s.parent_id === parent.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      rateByCategory,
    },
    error: null,
  };
}

export async function fetchConsumerListings(supabase, userId) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .select(LISTING_SELECT)
    .eq('consumer_id', userId)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load your listings.');
  return { data: data || [], error: null };
}

export async function fetchMarketplaceListings(supabase, filters = {}, { page = 1, pageSize = 9 } = {}) {
  const serverFilters = buildMarketplaceFilters(filters);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from('scrap_listings')
    .select(LISTING_SELECT, { count: 'exact' })
    .is('collector_id', null)
    .in('status', serverFilters.status ? [serverFilters.status] : MARKETPLACE_STATUSES);

  if (serverFilters.category_id) query = query.eq('category_id', serverFilters.category_id);
  if (serverFilters.subcategory_id) query = query.eq('subcategory_id', serverFilters.subcategory_id);
  if (serverFilters.pickup_zone) query = query.ilike('pickup_zone', `%${serverFilters.pickup_zone}%`);
  if (serverFilters.search) {
    query = query.or(
      `condition.ilike.%${serverFilters.search}%,pickup_zone.ilike.%${serverFilters.search}%`,
    );
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) return fail('Failed to load available listings.');
  return { data: { listings: data || [], total: count || 0 }, error: null };
}

export async function fetchListing(supabase, listingId) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .select(LISTING_SELECT)
    .eq('id', listingId)
    .maybeSingle();
  if (error) return fail('Failed to load this listing.');
  if (!data) return fail('Listing not found, or you do not have access to it.');
  return { data, error: null };
}

// Returns null when the address is not visible to the caller (an unclaimed
// listing viewed by a collector), which is the intended privacy behaviour.
export async function fetchListingAddress(supabase, listingId) {
  const { data, error } = await supabase
    .from('scrap_listing_addresses')
    .select('listing_id, address')
    .eq('listing_id', listingId)
    .maybeSingle();
  if (error) return fail('Failed to load the pickup address.');
  return { data: data || null, error: null };
}

// The bucket is private: photos are served through short-lived signed URLs for
// signed-in users instead of a permanent public URL.
export async function listingPhotoUrl(supabase, path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) return null;
  return data?.signedUrl || null;
}

async function uploadPhoto(supabase, userId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `listings/${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return { data: null, error: 'Photo upload failed. The listing can still be created without a photo.' };
  return { data: path, error: null };
}

export async function createListing(supabase, payload) {
  const {
    userId,
    categoryId,
    subcategoryId,
    approximateWeight,
    condition,
    address,
    pickupZone,
    preferredPickupTime,
    photo,
    requestPickup = false,
  } = payload;

  let photoPath = null;
  let warning = '';
  if (photo) {
    const upload = await uploadPhoto(supabase, userId, photo);
    if (upload.error) warning = upload.error;
    else photoPath = upload.data;
  }

  const { data: listing, error } = await supabase
    .from('scrap_listings')
    .insert({
      consumer_id: userId,
      category_id: categoryId,
      subcategory_id: subcategoryId || null,
      approximate_weight: Number.parseFloat(approximateWeight),
      condition,
      pickup_zone: pickupZone || null,
      preferred_pickup_time: preferredPickupTime || null,
      photo_path: photoPath,
      status: requestPickup ? LISTING_STATUS.PICKUP_REQUESTED : LISTING_STATUS.LISTED,
    })
    .select('id')
    .single();

  if (error) return fail('Failed to create the listing. Please try again.');

  const { error: addressError } = await supabase
    .from('scrap_listing_addresses')
    .insert({ listing_id: listing.id, address });

  if (addressError) {
    // Do not leave a listing without a pickup address behind.
    await supabase.from('scrap_listings').delete().eq('id', listing.id);
    return fail('Failed to save the pickup address. Please try again.');
  }

  return { data: { id: listing.id, warning }, error: null };
}

export async function updateListing(supabase, listingId, patch) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .update(patch)
    .eq('id', listingId)
    .select('id')
    .maybeSingle();
  if (error) return fail(error.message || 'Failed to update the listing.');
  if (!data) return fail('This listing can no longer be changed.');
  return { data, error: null };
}

export async function updateListingAddress(supabase, listingId, address) {
  const { error } = await supabase
    .from('scrap_listing_addresses')
    .update({ address })
    .eq('listing_id', listingId);
  if (error) return fail('Failed to update the pickup address.');
  return { data: true, error: null };
}

export async function cancelListing(supabase, listingId) {
  return updateListing(supabase, listingId, { status: LISTING_STATUS.CANCELLED });
}

export async function requestPickup(supabase, listingId) {
  return updateListing(supabase, listingId, { status: LISTING_STATUS.PICKUP_REQUESTED });
}

export async function claimListing(supabase, listingId, userId) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .update({ collector_id: userId, status: LISTING_STATUS.ACCEPTED })
    .eq('id', listingId)
    .is('collector_id', null)
    .in('status', MARKETPLACE_STATUSES)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to accept this pickup.');
  if (!data) return fail('This pickup has already been accepted by another collector.');
  return { data, error: null };
}

export async function completeListing(supabase, listingId, userId, actualWeight) {
  const patch = { status: LISTING_STATUS.COLLECTED };
  if (actualWeight !== undefined && actualWeight !== null && actualWeight !== '') {
    const parsed = Number.parseFloat(actualWeight);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fail('Enter a valid actual weight in kilograms.');
    }
    patch.actual_weight = parsed;
  }

  const { data, error } = await supabase
    .from('scrap_listings')
    .update(patch)
    .eq('id', listingId)
    .eq('collector_id', userId)
    .eq('status', LISTING_STATUS.ACCEPTED)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to mark this pickup as collected.');
  if (!data) return fail('This pickup can no longer be marked as collected.');
  return { data, error: null };
}

export async function releaseListing(supabase, listingId, userId) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .update({ collector_id: null, status: LISTING_STATUS.PICKUP_REQUESTED })
    .eq('id', listingId)
    .eq('collector_id', userId)
    .eq('status', LISTING_STATUS.ACCEPTED)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to release this pickup.');
  if (!data) return fail('This pickup can no longer be released.');
  return { data, error: null };
}

// Everything the collector dashboard needs: open marketplace rows plus rows
// assigned to this collector (which RLS returns in the same table).
export async function fetchCollectorListings(supabase, userId) {
  const { data, error } = await supabase
    .from('scrap_listings')
    .select(LISTING_SELECT)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load collector listings.');
  return {
    data: (data || []).filter(
      (l) => l.collector_id === userId || (!l.collector_id && MARKETPLACE_STATUSES.includes(l.status)),
    ),
    error: null,
  };
}

export { LISTING_SELECT, PHOTO_BUCKET };
