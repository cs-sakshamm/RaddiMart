import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardNav from './DashboardNav';
import { getSupabaseClient } from '../lib/supabase';
import { fetchOwnProfile } from '../lib/listingsApi';
import { formatAmount, formatDateTime, formatWeight } from '../lib/listings';
import {
  calculateOfferValue,
  formatLotCode,
  offerStatusLabel,
  saleableWeight,
  summariseOffers,
  verificationLabel,
} from '../lib/lots';
import { fetchOwnFacility, fetchRecyclerOffers } from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

export default function DashboardRecycler() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [facility, setFacility] = useState(null);
  const [offers, setOffers] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');

  useEffect(() => {
    if (!supabase) return undefined;
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
      if (profileResult.data.profile.active_role !== 'recycler') {
        setState('ready');
        return;
      }
      const [facilityResult, offersResult] = await Promise.all([
        fetchOwnFacility(supabase, profileResult.data.user.id),
        fetchRecyclerOffers(supabase),
      ]);
      if (!active) return;
      if (facilityResult.error || offersResult.error) {
        setState('error');
        setError(facilityResult.error || offersResult.error);
        return;
      }
      setFacility(facilityResult.data);
      setOffers(offersResult.data);
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

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
          <DashboardNav role="recycler" />
          <h1>Recycler Dashboard</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/signin')}>Go to sign in</button>
        </main>
      </div>
    );
  }

  if (profile?.active_role !== 'recycler') {
    return (
      <div className="dashboard-page" aria-label="Recycler dashboard">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Recycler Dashboard</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Recycler access required</h2>
            <p>
              Facility profiles and material offers are available to approved recyclers only. Your
              current role is <strong>{profile?.active_role || 'consumer'}</strong>.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
                Request recycler access
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

  const summary = summariseOffers(offers);

  return (
    <div className="dashboard-page" aria-label="Recycler dashboard">
      <header className="dashboard-header">
        <DashboardNav role="recycler" />
        <h1>Recycler Dashboard</h1>
        <p>{profile.full_name ? `Welcome, ${profile.full_name}` : 'Welcome back'}</p>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-section">
          <h2>Overview</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{summary.liveCount}</div>
              <div className="summary-label">Awaiting your response</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.acceptedCount}</div>
              <div className="summary-label">Accepted, awaiting handover</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.handoverCount}</div>
              <div className="summary-label">Awaiting receipt confirmation</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.completedCount}</div>
              <div className="summary-label">Completed handovers</div>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Facility</h2>
          {facility ? (
            <>
              <dl className="detail-list">
                <dt>Facility name</dt>
                <dd>{facility.facility_name}</dd>
                <dt>Location</dt>
                <dd>{facility.location || 'Not specified'}</dd>
                <dt>Verification</dt>
                <dd>
                  <span className={`status-pill status-${facility.verification_status}`}>
                    {verificationLabel(facility.verification_status)}
                  </span>
                </dd>
              </dl>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => navigate('/recycler/facility')}>
                  Manage facility profile
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="empty-state">
                No facility profile yet. Aggregators cannot send offers until your facility exists.
              </p>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => navigate('/recycler/facility')}>
                  Create facility profile
                </button>
              </div>
            </>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="incoming-offers">
          <div className="section-heading-row">
            <h2 id="incoming-offers">Incoming Offers</h2>
            <button className="btn btn-secondary btn-small" onClick={() => navigate('/recycler/offers')}>
              View all offers
            </button>
          </div>
          <p className="hint">
            Offers addressed to your facility. Accept or decline an offer, then confirm receipt
            after the aggregator records the handover.
          </p>
          {offers.length === 0 ? (
            <p className="empty-state">
              No offers yet. Aggregators send offers from material already in their inventory.
            </p>
          ) : (
            <ul className="listing-list">
              {offers.slice(0, 3).map((offer) => {
                const image = materialImage(offer.lot?.category?.name);
                return (
                  <li key={offer.id} className="listing-card">
                    <img
                      className="listing-thumb"
                      src={image.src}
                      alt={image.alt}
                      width="96"
                      height="96"
                      loading="lazy"
                    />
                    <div className="listing-info">
                      <span className="lot-code">{formatLotCode(offer.lot?.lot_code)}</span>
                      <strong>{offer.lot?.category?.name || 'Material lot'}</strong>
                      <span className="listing-sub">
                        {offer.lot?.subcategory?.name || 'No subcategory'},{' '}
                        {formatWeight(saleableWeight(offer.lot))}
                      </span>
                      <span className="listing-sub">
                        {formatAmount(offer.offered_rate)}/kg, estimated{' '}
                        {formatAmount(calculateOfferValue(offer.offered_rate, saleableWeight(offer.lot)))}
                      </span>
                      <span className="listing-sub">Sent {formatDateTime(offer.created_at)}</span>
                    </div>
                    <span className={`status-pill status-${offer.status.toLowerCase()}`}>
                      {offerStatusLabel(offer.status)}
                    </span>
                    <button
                      className={`btn btn-small ${offer.status === 'OFFERED_TO_RECYCLER' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => navigate(`/recycler/offers/${offer.id}`)}
                    >
                      {offer.status === 'OFFERED_TO_RECYCLER' ? 'Respond' : 'View'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
