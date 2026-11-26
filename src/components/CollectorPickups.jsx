import DashboardNav from './DashboardNav';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { claimListing, fetchCollectorListings, fetchOwnProfile } from '../lib/listingsApi';
import { formatDateTime, formatWeight, statusLabel } from '../lib/listings';
import { materialImage } from '../lib/materials';

export default function CollectorPickups() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    async (userId) => {
      const listingsResult = await fetchCollectorListings(supabase, userId);
      if (listingsResult.error) {
        setState('error');
        setError(listingsResult.error);
        return;
      }
      setListings(listingsResult.data);
      setState('ready');
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const profileResult = await fetchOwnProfile(supabase);
      if (!active) return;
      if (profileResult.error) {
        setState('error');
        setError(profileResult.error);
        return;
      }
      setProfile(profileResult.data.profile);
      if (profileResult.data.profile.active_role === 'collector') {
        await load(profileResult.data.user.id);
      } else {
        setState('ready');
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, load]);

  const handleAccept = async (listingId) => {
    setBusyId(listingId);
    setActionError('');
    try {
      const { error: claimError } = await claimListing(supabase, listingId, profile.id);
      if (claimError) {
        setActionError(claimError);
      }
      await load(profile.id);
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading pickups…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={'collector'} />
          <h1>Pickup management</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/collector')}>
            Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  if (profile && profile.active_role !== 'collector') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={'collector'} />
          <h1>Pickup management</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Collector access required</h2>
            <p>Pickup management is available to approved local collectors only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request collector access
            </button>
          </section>
        </main>
      </div>
    );
  }

  const pending = listings.filter((l) => l.status === 'PICKUP_REQUESTED' && !l.collector_id);
  const accepted = listings.filter((l) => l.status === 'ACCEPTED' && l.collector_id === profile?.id);
  const completed = listings.filter((l) => l.status === 'COLLECTED' && l.collector_id === profile?.id);

  const renderPending = (listing) => {
    const image = materialImage(listing.category?.name);
    return (
    <li key={listing.id} className="listing-card">
      <img className="listing-thumb" src={image.src} alt={image.alt} width="88" height="88" loading="lazy" />
      <div className="listing-info">
        <strong>{listing.category?.name || 'Uncategorised'}</strong>
        <span className="listing-sub">
          {listing.subcategory?.name || 'No subcategory'}
        </span>
        <span className="listing-sub">
          {formatWeight(listing.approximate_weight)}, {listing.condition || 'condition not set'}
        </span>
        <span className="listing-sub">Zone: {listing.pickup_zone || 'not specified'}</span>
        <span className="listing-sub">Requested {formatDateTime(listing.created_at)}</span>
        <span className="listing-sub">
          Preferred pickup: {formatDateTime(listing.preferred_pickup_time)}
        </span>
      </div>
      <div className="listing-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={() => handleAccept(listing.id)}
          disabled={busyId === listing.id}
        >
          {busyId === listing.id ? 'Accepting…' : 'Accept pickup'}
        </button>
        <button
          className="btn btn-secondary btn-small"
          onClick={() => navigate(`/listing/${listing.id}`)}
        >
          Details
        </button>
      </div>
    </li>
    );
  };

  const renderAssigned = (listing) => {
    const image = materialImage(listing.category?.name);
    return (
    <li key={listing.id} className="listing-card">
      <img className="listing-thumb" src={image.src} alt={image.alt} width="88" height="88" loading="lazy" />
      <div className="listing-info">
        <strong>{listing.category?.name || 'Uncategorised'}</strong>
        <span className="listing-sub">
          {listing.subcategory?.name || 'No subcategory'}
        </span>
        <span className="listing-sub">
          {formatWeight(listing.approximate_weight)}, {listing.condition || 'condition not set'}
        </span>
        <span className="listing-sub">Zone: {listing.pickup_zone || 'not specified'}</span>
        <span className="listing-sub">
          Preferred pickup: {formatDateTime(listing.preferred_pickup_time)}
        </span>
        <span className="listing-sub">
          Accepted, last updated {formatDateTime(listing.updated_at)}
        </span>
        {listing.actual_weight ? (
          <span className="listing-sub">Recorded actual weight {formatWeight(listing.actual_weight)}</span>
        ) : null}
      </div>
      <span className={`status-pill status-${listing.status.toLowerCase()}`}>
        {statusLabel(listing.status)}
      </span>
      <button
        className="btn btn-secondary btn-small"
        onClick={() => navigate(`/listing/${listing.id}`)}
      >
        Open pickup
      </button>
    </li>
    );
  };

  return (
    <div className="dashboard-page" aria-label="Collector pickup management">
      <header className="dashboard-header">
        <DashboardNav role={'collector'} />
        <h1>Pickup management</h1>
        <p>Accept open pickup requests and record collections after they happen.</p>
      </header>

      <main className="dashboard-main">
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section" aria-labelledby="pending-heading">
          <h2 id="pending-heading">Pending pickup requests</h2>
          {pending.length === 0 ? (
            <p className="empty-state">No pending pickup requests right now.</p>
          ) : (
            <ul className="listing-list">{pending.map(renderPending)}</ul>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="accepted-pickups-heading">
          <h2 id="accepted-pickups-heading">Accepted pickups</h2>
          {accepted.length === 0 ? (
            <p className="empty-state">You have no accepted pickups in progress.</p>
          ) : (
            <ul className="listing-list">{accepted.map(renderAssigned)}</ul>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="completed-heading">
          <h2 id="completed-heading">Completed collections</h2>
          {completed.length === 0 ? (
            <p className="empty-state">No completed collections yet.</p>
          ) : (
            <ul className="listing-list">{completed.map(renderAssigned)}</ul>
          )}
        </section>

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/collector')}>
            Back to dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
