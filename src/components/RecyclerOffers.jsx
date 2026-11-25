import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '../lib/lots';
import { fetchOwnFacility, fetchRecyclerOffers } from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

const STATUS_FILTERS = [
  ['all', 'All offers'],
  ['OFFERED_TO_RECYCLER', 'Awaiting your response'],
  ['ACCEPTED_BY_RECYCLER', 'Accepted'],
  ['HANDOVER_CONFIRMED', 'Awaiting receipt confirmation'],
  ['COMPLETED', 'Completed'],
  ['REJECTED_BY_RECYCLER', 'Declined'],
  ['WITHDRAWN', 'Withdrawn'],
];

export default function RecyclerOffers() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [facility, setFacility] = useState(null);
  const [offers, setOffers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');

  const load = useCallback(async () => {
    const result = await fetchRecyclerOffers(supabase);
    if (result.error) {
      setState('error');
      setError(result.error);
      return;
    }
    setOffers(result.data);
    setState('ready');
  }, [supabase]);

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
      const facilityResult = await fetchOwnFacility(supabase, profileResult.data.user.id);
      if (!active) return;
      if (!facilityResult.error) setFacility(facilityResult.data);
      await load();
    })();
    return () => {
      active = false;
    };
  }, [supabase, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return offers.filter((offer) => {
      if (statusFilter !== 'all' && offer.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = [
        offer.lot?.lot_code,
        offer.lot?.category?.name,
        offer.lot?.subcategory?.name,
        offer.lot?.pickup_zone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [offers, statusFilter, search]);

  const summary = summariseOffers(offers);

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading incoming offers…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="recycler" />
          <h1>Incoming Offers</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/recycler')}>
            Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  if (profile && profile.active_role !== 'recycler') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile.active_role} />
          <h1>Incoming Offers</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Recycler access required</h2>
            <p>Incoming offers are available to approved recycler accounts only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request recycler access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Recycler incoming offers">
      <header className="dashboard-header">
        <DashboardNav role="recycler" />
        <h1>Incoming Offers</h1>
        <p>Review the material, then accept or decline each offer for your facility.</p>
      </header>

      <main className="dashboard-main">
        {!facility && (
          <p className="form-notice" role="status">
            Create your facility profile before responding to offers.{' '}
            <button className="text-button" onClick={() => navigate('/recycler/facility')}>
              Create facility profile
            </button>
          </p>
        )}

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
          <h2>Filter offers</h2>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="recycler-offer-status">Status</label>
              <select
                id="recycler-offer-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_FILTERS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="recycler-offer-search">Search</label>
              <input
                id="recycler-offer-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Lot code, material or zone"
              />
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Offers</h2>
          {filtered.length === 0 ? (
            <p className="empty-state">
              No offers match this view. New offers from aggregators will appear here.
            </p>
          ) : (
            <ul className="listing-list">
              {filtered.map((offer) => {
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
                    <div className="listing-actions">
                      <button
                        className={`btn btn-small ${offer.status === 'OFFERED_TO_RECYCLER' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => navigate(`/recycler/offers/${offer.id}`)}
                      >
                        {offer.status === 'OFFERED_TO_RECYCLER' ? 'Respond' : 'View offer'}
                      </button>
                    </div>
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
