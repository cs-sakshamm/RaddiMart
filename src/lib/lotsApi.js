// Supabase access for Phase 5 aggregator inventory and recycler offers.
// Every function returns { data, error } with a user-facing error string.
// Authorization is enforced by the database policies in migration 00600.

const LOT_SELECT = [
  'id',
  'lot_code',
  'collector_id',
  'aggregator_id',
  'category_id',
  'subcategory_id',
  'source_listing_id',
  'approximate_weight',
  'actual_weight',
  'condition',
  'pickup_zone',
  'status',
  'created_at',
  'updated_at',
  'category:material_categories!material_lots_category_id_fkey(id, name)',
  'subcategory:material_categories!material_lots_subcategory_id_fkey(id, name)',
].join(', ');

const OFFER_SELECT = [
  'id',
  'tx_reference',
  'lot_id',
  'recycler_id',
  'offered_rate',
  'final_value',
  'status',
  'payment_status',
  'created_at',
  'updated_at',
  'lot:material_lots!transactions_lot_id_fkey(id, lot_code, actual_weight, approximate_weight, condition, pickup_zone, status, category:material_categories!material_lots_category_id_fkey(id, name), subcategory:material_categories!material_lots_subcategory_id_fkey(id, name))',
  'recycler:recyclers!transactions_recycler_id_fkey(id, facility_name, location, verification_status)',
].join(', ');

function fail(message) {
  return { data: null, error: message };
}

export async function fetchAggregatorLots(supabase) {
  const { data, error } = await supabase
    .from('material_lots')
    .select(LOT_SELECT)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load aggregator inventory.');
  return { data: data || [], error: null };
}

export async function fetchLot(supabase, lotId) {
  const { data, error } = await supabase
    .from('material_lots')
    .select(LOT_SELECT)
    .eq('id', lotId)
    .maybeSingle();
  if (error) return fail('Failed to load this material lot.');
  if (!data) return fail('This lot is not available to your account.');
  return { data, error: null };
}

export async function claimLot(supabase, lotId, userId) {
  const { data, error } = await supabase
    .from('material_lots')
    .update({ aggregator_id: userId })
    .eq('id', lotId)
    .is('aggregator_id', null)
    .eq('status', 'IN_AGGREGATOR_INVENTORY')
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to receive this lot.');
  if (!data) return fail('This lot has already been received by another aggregator.');
  return { data, error: null };
}

export async function fetchOfferHistoryForLot(supabase, lotId) {
  const { data, error } = await supabase
    .from('transactions')
    .select(OFFER_SELECT)
    .eq('lot_id', lotId)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load offers for this lot.');
  return { data: data || [], error: null };
}

export async function fetchRecyclerDirectory(supabase) {
  const { data, error } = await supabase
    .from('recyclers')
    .select('id, facility_name, location, accepted_categories, verification_status')
    .order('facility_name');
  if (error) return fail('Failed to load the recycler directory.');
  return { data: data || [], error: null };
}

export async function createOffer(supabase, { lotId, recyclerId, offeredRate }) {
  const rate = Number.parseFloat(offeredRate);
  if (!lotId || !recyclerId) return fail('Choose a recycler and a lot before sending an offer.');
  if (!Number.isFinite(rate) || rate <= 0) return fail('Enter a buying rate above zero.');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      lot_id: lotId,
      recycler_id: recyclerId,
      offered_rate: rate,
      status: 'OFFERED_TO_RECYCLER',
      payment_status: 'PENDING',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail('This lot already has an active offer. Finish or withdraw it before sending another.');
    }
    return fail(error.message || 'Failed to send the offer.');
  }
  return { data, error: null };
}

export async function fetchAggregatorOffers(supabase) {
  const { data, error } = await supabase
    .from('transactions')
    .select(OFFER_SELECT)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load your offers.');
  return { data: data || [], error: null };
}

export async function withdrawOffer(supabase, offerId) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'WITHDRAWN' })
    .eq('id', offerId)
    .eq('status', 'OFFERED_TO_RECYCLER')
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to withdraw this offer.');
  if (!data) return fail('This offer can no longer be withdrawn.');
  return { data, error: null };
}

export async function fetchRecyclerOffers(supabase) {
  const { data, error } = await supabase
    .from('transactions')
    .select(OFFER_SELECT)
    .order('created_at', { ascending: false });
  if (error) return fail('Failed to load incoming offers.');
  return { data: data || [], error: null };
}

export async function fetchOffer(supabase, offerId) {
  const { data, error } = await supabase
    .from('transactions')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .maybeSingle();
  if (error) return fail('Failed to load this offer.');
  if (!data) return fail('This offer is not available to your account.');
  return { data, error: null };
}

export async function respondToOffer(supabase, offerId, response) {
  if (!['ACCEPTED_BY_RECYCLER', 'REJECTED_BY_RECYCLER'].includes(response)) {
    return fail('Choose whether to accept or decline this offer.');
  }
  const { data, error } = await supabase
    .from('transactions')
    .update({ status: response })
    .eq('id', offerId)
    .eq('status', 'OFFERED_TO_RECYCLER')
    .select('id, status')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to record your response.');
  if (!data) return fail('This offer has already been answered or withdrawn.');
  return { data, error: null };
}

export async function fetchHandoverForOffer(supabase, offerId) {
  const { data, error } = await supabase
    .from('handover_records')
    .select('id, transaction_id, lot_id, aggregator_id, recycler_id, qr_token, handover_timestamp, received_weight, recycler_confirmation, recycler_confirmed_at, notes, created_at')
    .eq('transaction_id', offerId)
    .maybeSingle();
  if (error) return fail('Failed to load the handover record.');
  return { data: data || null, error: null };
}

export async function recordHandover(supabase, { offerId, receivedWeight, handoverAt, notes }) {
  const weight = Number.parseFloat(receivedWeight);
  if (!offerId) return fail('Choose the accepted offer before recording handover.');
  if (!Number.isFinite(weight) || weight <= 0) return fail('Enter the final received weight above zero.');
  const timestamp = handoverAt ? new Date(handoverAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) return fail('Enter a valid handover date and time.');

  const { data, error } = await supabase
    .from('handover_records')
    .insert({
      transaction_id: offerId,
      received_weight: weight,
      handover_timestamp: timestamp.toISOString(),
      notes: (notes || '').trim() || null,
    })
    .select('id, qr_token')
    .single();

  if (error) {
    if (error.code === '23505') return fail('A handover is already recorded for this offer.');
    return fail(error.message || 'Failed to record the handover.');
  }
  return { data, error: null };
}

export async function confirmHandover(supabase, handoverId) {
  const { data, error } = await supabase
    .from('handover_records')
    .update({ recycler_confirmation: true })
    .eq('id', handoverId)
    .eq('recycler_confirmation', false)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to confirm the handover.');
  if (!data) return fail('This handover has already been confirmed or is unavailable.');
  return { data, error: null };
}

export async function markOfferPaid(supabase, offerId) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ payment_status: 'PAID' })
    .eq('id', offerId)
    .eq('payment_status', 'PENDING')
    .in('status', ['ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED'])
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message || 'Failed to record payment.');
  if (!data) return fail('Payment cannot be recorded for this offer yet.');
  return { data, error: null };
}

export async function fetchTransactionEvents(supabase, offerId) {
  const { data, error } = await supabase
    .from('transaction_events')
    .select('id, from_status, to_status, created_at, actor_id')
    .eq('transaction_id', offerId)
    .order('created_at', { ascending: true });
  if (error) return fail('Failed to load the offer history.');
  return { data: data || [], error: null };
}

export async function fetchPublicHandover(supabase, token) {
  const { data, error } = await supabase.rpc('get_handover_verification', { p_token: token });
  if (error) return fail('The verification service is unavailable. Try again later.');
  return { data: data || null, error: null };
}

export async function fetchOwnFacility(supabase, userId) {
  const { data, error } = await supabase
    .from('recyclers')
    .select('id, profile_id, facility_name, location, contact_email, accepted_categories, verification_status, created_at, updated_at')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) return fail('Failed to load your facility profile.');
  return { data: data || null, error: null };
}

export async function saveOwnFacility(supabase, { userId, facilityName, location, contactEmail, acceptedCategories, existingId }) {
  const name = (facilityName || '').trim();
  if (!name) return fail('Enter the facility name.');

  const patch = {
    facility_name: name,
    location: (location || '').trim() || null,
    contact_email: (contactEmail || '').trim() || null,
    accepted_categories: acceptedCategories || [],
  };

  if (existingId) {
    const { data, error } = await supabase
      .from('recyclers')
      .update(patch)
      .eq('id', existingId)
      .select('id')
      .maybeSingle();
    if (error) return fail(error.message || 'Failed to update the facility profile.');
    if (!data) return fail('You can no longer update this facility profile.');
    return { data, error: null };
  }

  const { data, error } = await supabase
    .from('recyclers')
    .insert({
      profile_id: userId,
      verification_status: 'pending',
      ...patch,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      return fail('A facility profile already exists for this account. Reload the page.');
    }
    return fail(error.message || 'Failed to create the facility profile.');
  }
  return { data, error: null };
}

export { LOT_SELECT, OFFER_SELECT };
