import DashboardNav from './DashboardNav';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { fetchCollectorListings, fetchOwnProfile } from '../lib/listingsApi';
import { formatDate, formatWeight, summariseCollectorListings } from '../lib/listings';
import { materialImage } from '../lib/materials';

export default function DashboardCollector() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');

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

      if (profileResult.data.profile.active_role !== 'collector') {
        setState('ready');
        return;
      }

      const listingsResult = await fetchCollectorListings(supabase, profileResult.data.user.id);
      if (!active) return;
      if (listingsResult.error) {
        setState('error');
        setError(listingsResult.error);
        return;
      }
      setListings(listingsResult.data);
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase, reloadKey]);

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={'collector'} />
          <h1>Collector dashboard</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setError('');
                setState('loading');
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/signin')}>Go to sign in</button>
          </div>
        </main>
      </div>
    );
  }

  if (profile?.active_role !== 'collector') {
    return (
      <div className="dashboard-page" aria-label="Collector dashboard">
        <header className="dashboard-header">
          <DashboardNav role={'collector'} />
          <h1>Collector dashboard</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Collector access required</h2>
            <p>
              The collector marketplace is available to approved local collectors only. Your current
              role is <strong>{profile?.active_role || 'consumer'}</strong>.
            </p>
            <p>
              If you collect scrap in your area, you can request collector access. An administrator
              reviews every request.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
                Request collector access
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/dashboard/consumer')}>
                Back to consumer dashboard
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const summary = summariseCollectorListings(listings, profile.id);

  return (
    <div className="dashboard-page" aria-label="Collector dashboard">
      <header className="dashboard-header">
        <DashboardNav role={'collector'} />
        <h1>Collector dashboard</h1>
        <p>{profile.full_name ? `Welcome, ${profile.full_name}` : 'Welcome back'}</p>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-section" aria-labelledby="collector-summary">
          <h2 id="collector-summary">Overview</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{summary.availableCount}</div>
              <div className="summary-label">Available listings</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.pendingRequestCount}</div>
              <div className="summary-label">Pickup requests</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.acceptedCount}</div>
              <div className="summary-label">Accepted pickups</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.completedCount}</div>
              <div className="summary-label">Completed collections</div>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => navigate('/collector/marketplace')}>
              Browse marketplace
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/collector/pickups')}>
              Manage pickups
            </button>
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="available-heading">
          <h2 id="available-heading">Available Scrap Listings</h2>
          {summary.available.length === 0 ? (
            <p className="empty-state">
              No listings are available in the marketplace right now. New consumer listings
              appear here as soon as they are posted.
            </p>
          ) : (
            <ul className="listing-list">
              {summary.available.slice(0, 3).map((listing) => {
                const image = materialImage(listing.category?.name);
                return (
                <li key={listing.id} className="listing-card">
                  <img
                    className="listing-thumb"
                    src={image.src}
                    alt={image.alt}
                    width="88"
                    height="88"
                    loading="lazy"
                  />
                  <div className="listing-info">
                    <strong>{listing.category?.name || 'Uncategorised'}</strong>
                    <span className="listing-sub">
                      {listing.subcategory?.name || 'No subcategory'}
                    </span>
                    <span className="listing-sub">
                      {formatWeight(listing.approximate_weight)}, {listing.condition || 'condition not set'}
                    </span>
                    <span className="listing-sub">Zone: {listing.pickup_zone || 'not specified'}</span>
                    <span className="listing-sub">Listed {formatDate(listing.created_at)}</span>
                  </div>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => navigate(`/listing/${listing.id}`)}
                  >
                    Review
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="accepted-heading">
          <h2 id="accepted-heading">Your Accepted Pickups</h2>
          {summary.accepted.length === 0 ? (
            <p className="empty-state">You have no accepted pickups in progress.</p>
          ) : (
            <ul className="listing-list">
              {summary.accepted.map((listing) => (
                <li key={listing.id} className="listing-card">
                  <div className="listing-info">
                    <strong>{listing.category?.name || 'Uncategorised'}</strong>
                    <span className="listing-sub">
                      {formatWeight(listing.approximate_weight)}, {listing.condition || 'condition not set'}
                    </span>
                    <span className="listing-sub">
                      Preferred pickup: {formatDate(listing.preferred_pickup_time)}
                    </span>
                  </div>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => navigate(`/listing/${listing.id}`)}
                  >
                    Open pickup
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Recent Activity</h2>
          {summary.recentActivity.length === 0 ? (
            <p className="empty-state">No collection activity yet.</p>
          ) : (
            <ul className="activity-list">
              {summary.recentActivity.map((listing) => (
                <li key={listing.id} className="activity-item">
                  <span>{formatDate(listing.updated_at)}</span>
                  <span>
                    {listing.category?.name || 'Listing'} —{' '}
                    {listing.status === 'COLLECTED' ? 'Collected' : 'Accepted'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
