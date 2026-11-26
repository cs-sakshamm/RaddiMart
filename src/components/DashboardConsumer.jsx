import DashboardNav from './DashboardNav';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { fetchConsumerListings, fetchOwnProfile } from '../lib/listingsApi';
import { formatDate, formatWeight, statusLabel } from '../lib/listings';
import { materialImage } from '../lib/materials';

export default function DashboardConsumer() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [reloadKey, setReloadKey] = useState(0);

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
      const user = profileResult.data.user;
      setProfile(profileResult.data.profile);

      const listingsResult = await fetchConsumerListings(supabase, user.id);
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

  const openListings = listings.filter((l) => l.status === 'LISTED' || l.status === 'PICKUP_REQUESTED');
  const activePickups = listings.filter((l) => l.status === 'ACCEPTED');
  const completed = listings.filter((l) => l.status === 'COLLECTED');

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
          <DashboardNav role={'consumer'} />
          <h1>Consumer dashboard</h1>
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

  return (
    <div className="dashboard-page" aria-label="Consumer dashboard">
      <header className="dashboard-header">
        <DashboardNav role={'consumer'} />
        <h1>Consumer dashboard</h1>
        <p>{profile?.full_name ? `Welcome, ${profile.full_name}` : 'Welcome back'}</p>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-section" aria-labelledby="summary-heading">
          <h2 id="summary-heading">Summary</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{openListings.length}</div>
              <div className="summary-label">Open listings</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{activePickups.length}</div>
              <div className="summary-label">Accepted pickups</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{completed.length}</div>
              <div className="summary-label">Collected</div>
            </div>
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="listings-heading">
          <h2 id="listings-heading">My Listings</h2>
          {listings.length === 0 ? (
            <div className="empty-state">
              <p>You have no scrap listings yet. Start with what you want collected and where.</p>
              <div className="form-actions">
                <button className="btn btn-primary btn-small" onClick={() => navigate('/dashboard/create-listing')}>
                  Create your first listing
                </button>
              </div>
            </div>
          ) : (
            <ul className="listing-list">
              {listings.map((listing) => {
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
                  <span className={`status-pill status-${listing.status.toLowerCase()}`}>
                    {statusLabel(listing.status)}
                  </span>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => navigate(`/listing/${listing.id}`)}
                  >
                    View details
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Recent Activity</h2>
          {listings.length === 0 ? (
            <p className="empty-state">No activity yet.</p>
          ) : (
            <ul className="activity-list">
              {listings.slice(0, 5).map((listing) => (
                <li key={listing.id} className="activity-item">
                  <span>{formatDate(listing.updated_at)}</span>
                  <span>
                    {listing.category?.name || 'Listing'} — {statusLabel(listing.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Create New Listing</h2>
          <p>List scrap you want collected. Collectors can then accept your pickup.</p>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => navigate('/dashboard/create-listing')}>
              Create listing
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/role-request')}>
              Request another role
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
