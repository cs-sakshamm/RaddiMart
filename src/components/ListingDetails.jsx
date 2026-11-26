import DashboardNav from './DashboardNav';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import {
  cancelListing,
  claimListing,
  completeListing,
  fetchCatalogue,
  fetchListing,
  fetchListingAddress,
  fetchOwnProfile,
  listingPhotoUrl,
  releaseListing,
  requestPickup,
  updateListing,
  updateListingAddress,
} from '../lib/listingsApi';
import {
  calculateIndicativePrice,
  canCollectorClaim,
  canCollectorComplete,
  canCollectorRelease,
  canConsumerCancel,
  canConsumerEdit,
  canConsumerRequestPickup,
  formatAmount,
  formatDateTime,
  formatWeight,
  statusLabel,
} from '../lib/listings';

const CONDITIONS = ['New', 'Used', 'Refurbished', 'For Parts'];

// Module-level loader: keeps state updates out of the synchronous effect body.
async function loadListingView(supabase, listingId) {
  const profileResult = await fetchOwnProfile(supabase);
  if (profileResult.error) return { error: profileResult.error };

  const listingResult = await fetchListing(supabase, listingId);
  if (listingResult.error) return { error: listingResult.error };

  const addressResult = await fetchListingAddress(supabase, listingId);
  const catalogue = await fetchCatalogue(supabase);

  return {
    profile: profileResult.data.profile,
    listing: listingResult.data,
    address: addressResult.data?.address || null,
    rate: catalogue.error
      ? undefined
      : catalogue.data.rateByCategory[listingResult.data.category_id],
    error: null,
  };
}

export default function ListingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [listing, setListing] = useState(null);
  const [address, setAddress] = useState(null);
  const [rate, setRate] = useState(undefined);
  const [status, setStatus] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [actionMessage, setActionMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editWeight, setEditWeight] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const applyView = useCallback((view) => {
    if (view.error) {
      setError(view.error);
      setStatus('error');
      return;
    }
    const loaded = view.listing;
    setProfile(view.profile);
    setListing(loaded);
    setAddress(view.address);
    setRate(view.rate);
    setEditWeight(loaded.approximate_weight ?? '');
    setEditCondition(loaded.condition || '');
    setEditZone(loaded.pickup_zone || '');
    setEditTime(
      loaded.preferred_pickup_time
        ? new Date(loaded.preferred_pickup_time).toISOString().slice(0, 16)
        : '',
    );
    setEditAddress(view.address || '');
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    loadListingView(supabase, id).then((view) => {
      if (active) applyView(view);
    });
    return () => {
      active = false;
    };
  }, [supabase, id, applyView]);

  const refresh = () => loadListingView(supabase, id).then(applyView);

  useEffect(() => {
    if (!supabase || !listing?.photo_path) {
      return undefined;
    }
    let active = true;
    listingPhotoUrl(supabase, listing.photo_path).then((url) => {
      if (active) setPhotoUrl(url || '');
    });
    return () => {
      active = false;
    };
  }, [supabase, listing?.photo_path]);

  const indicative = useMemo(
    () => calculateIndicativePrice(listing?.approximate_weight, rate),
    [listing?.approximate_weight, rate],
  );

  const run = async (action) => {
    setBusy(true);
    setActionMessage('');
    try {
      const result = await action();
      if (result?.error) {
        setActionMessage(result.error);
        return;
      }
      setActionMessage('Saved.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = () =>
    run(async () => claimListing(supabase, id, profile.id));

  const handleComplete = () =>
    run(async () => completeListing(supabase, id, profile.id, actualWeight));

  const handleRelease = () =>
    run(async () => releaseListing(supabase, id, profile.id));

  const handleRequestPickup = () =>
    run(async () => requestPickup(supabase, id));

  const handleCancel = () =>
    run(async () => cancelListing(supabase, id));

  const handleSaveEdit = async () => {
    setBusy(true);
    setActionMessage('');
    try {
      const updated = await updateListing(supabase, id, {
        approximate_weight: Number.parseFloat(editWeight),
        condition: editCondition,
        pickup_zone: editZone || null,
        preferred_pickup_time: editTime ? new Date(editTime).toISOString() : null,
      });
      if (updated.error) {
        setActionMessage(updated.error);
        return;
      }
      if (editAddress && editAddress !== address) {
        const addressResult = await updateListingAddress(supabase, id, editAddress);
        if (addressResult.error) {
          setActionMessage(addressResult.error);
          return;
        }
      }
      setEditing(false);
      setActionMessage('Saved.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading listing…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Listing</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Go back</button>
        </main>
      </div>
    );
  }

  const isConsumer = listing.consumer_id === profile.id;
  const isAssignedCollector = listing.collector_id === profile.id;
  const canClaim = canCollectorClaim(listing, profile.id) && profile.active_role === 'collector';
  return (
    <div className="dashboard-page" aria-label="Listing details">
      <header className="dashboard-header">
        <DashboardNav role={profile?.active_role || 'consumer'} />
        <h1>{listing.category?.name || 'Scrap listing'}</h1>
        <p>
          Status: <strong>{statusLabel(listing.status)}</strong>
        </p>
      </header>

      <main className="dashboard-main">
        {actionMessage && (
          <p className={actionMessage === 'Saved.' ? 'form-notice' : 'form-error'} role="status">
            {actionMessage}
          </p>
        )}

        <section className="dashboard-section">
          <h2>Material</h2>
          <dl className="detail-list">
            <dt>Category</dt>
            <dd>{listing.category?.name || 'Not set'}</dd>
            <dt>Subcategory</dt>
            <dd>{listing.subcategory?.name || 'Not specified'}</dd>
            <dt>Estimated weight</dt>
            <dd>{formatWeight(listing.approximate_weight)}</dd>
            {listing.actual_weight ? (
              <>
                <dt>Actual weight</dt>
                <dd>{formatWeight(listing.actual_weight)}</dd>
              </>
            ) : null}
            <dt>Condition</dt>
            <dd>{listing.condition || 'Not specified'}</dd>
            <dt>Indicative price</dt>
            <dd>
              {indicative === null ? 'No active rate available' : formatAmount(indicative)}
              <span className="hint price-hint">
                Indicative only. The final value may change after weighing and inspection.
              </span>
            </dd>
          </dl>
          {listing.photo_path && photoUrl && (
            <img className="listing-photo" src={photoUrl} alt="Scrap photo provided by the consumer" />
          )}
        </section>

        <section className="dashboard-section">
          <h2>Pickup</h2>
          <dl className="detail-list">
            <dt>Zone</dt>
            <dd>{listing.pickup_zone || 'Not specified'}</dd>
            <dt>Preferred pickup time</dt>
            <dd>{formatDateTime(listing.preferred_pickup_time)}</dd>
            <dt>Full address</dt>
            <dd>
              {address
                ? address
                : 'The full address is shared once a collector accepts this pickup.'}
            </dd>
            <dt>Listed on</dt>
            <dd>{formatDateTime(listing.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(listing.updated_at)}</dd>
          </dl>
        </section>

        {isConsumer && (
          <section className="dashboard-section">
            <h2>Manage listing</h2>
            {editing ? (
              <form
                className="listing-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEdit();
                }}
              >
                <div className="form-group">
                  <label htmlFor="edit-weight">Estimated Weight (kg)</label>
                  <input
                    id="edit-weight"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-condition">Condition</label>
                  <select
                    id="edit-condition"
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    required
                  >
                    <option value="">Select condition</option>
                    {CONDITIONS.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit-address">Pickup Address</label>
                  <input
                    id="edit-address"
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-zone">Pickup Zone/Area</label>
                  <input
                    id="edit-zone"
                    type="text"
                    value={editZone}
                    onChange={(e) => setEditZone(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-time">Preferred Pickup Time</label>
                  <input
                    id="edit-time"
                    type="datetime-local"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>Save changes</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditing(false)}
                    disabled={busy}
                  >
                    Discard
                  </button>
                </div>
              </form>
            ) : (
              <div className="form-actions">
                {canConsumerRequestPickup(listing) && (
                  <button className="btn btn-primary" onClick={handleRequestPickup} disabled={busy}>
                    Request pickup
                  </button>
                )}
                {canConsumerEdit(listing) && (
                  <button className="btn btn-secondary" onClick={() => setEditing(true)} disabled={busy}>
                    Edit listing
                  </button>
                )}
                {canConsumerCancel(listing) && (
                  <button className="btn btn-secondary" onClick={handleCancel} disabled={busy}>
                    Cancel listing
                  </button>
                )}
                {!canConsumerEdit(listing) && (
                  <p className="hint">
                    This listing can no longer be edited or cancelled
                    {listing.collector_id ? ' because a collector has accepted the pickup.' : '.'}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {isAssignedCollector && (
          <section className="dashboard-section">
            <h2>Pickup actions</h2>
            {listing.status === 'ACCEPTED' && (
              <>
                <div className="form-group">
                  <label htmlFor="actual-weight">Actual Weight Collected (kg, optional)</label>
                  <input
                    id="actual-weight"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={actualWeight}
                    onChange={(e) => setActualWeight(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary" onClick={handleComplete} disabled={busy}>
                    Mark as collected
                  </button>
                  {canCollectorRelease(listing, profile.id) && (
                    <button className="btn btn-secondary" onClick={handleRelease} disabled={busy}>
                      Release pickup
                    </button>
                  )}
                </div>
                <p className="hint">
                  Mark the pickup as collected only after the material has actually been collected.
                </p>
              </>
            )}
            {listing.status === 'COLLECTED' && (
              <p>
                This pickup was completed on {formatDateTime(listing.updated_at)}.
              </p>
            )}
            {!canCollectorComplete(listing, profile.id) && listing.status !== 'COLLECTED' && (
              <p className="hint">No actions are available for this pickup status.</p>
            )}
          </section>
        )}

        {!isConsumer && !isAssignedCollector && (
          <section className="dashboard-section">
            <h2>Accept this pickup</h2>
            {canClaim ? (
              <>
                <p>
                  Accepting assigns this pickup to you and reveals the consumer's full pickup
                  address so you can arrange collection.
                </p>
                <button className="btn btn-primary" onClick={handleClaim} disabled={busy}>
                  Accept pickup
                </button>
              </>
            ) : (
              <p className="hint">
                This listing is not available to accept. It may already be assigned to another
                collector or no longer open.
              </p>
            )}
          </section>
        )}

        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(isConsumer ? '/dashboard/consumer' : '/collector/marketplace')}
          >
            Back
          </button>
        </div>
      </main>
    </div>
  );
}
