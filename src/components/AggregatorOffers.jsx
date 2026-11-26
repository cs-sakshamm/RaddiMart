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
import { fetchAggregatorOffers, withdrawOffer } from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

export default function AggregatorOffers() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [offers, setOffers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const load = useCallback(async () => {
    const result = await fetchAggregatorOffers(supabase);
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
      if (profileResult.data.profile.active_role === 'aggregator') {
        await load();
      } else {
        setState('ready');
      }
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
        offer.recycler?.facility_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [offers, statusFilter, search]);

  const summary = summariseOffers(offers);

  const handleWithdraw = async (offerId) => {
    setBusyId(offerId);
    setActionError('');
    setMessage('');
    try {
      const result = await withdrawOffer(supabase, offerId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setConfirmingId(null);
      setMessage('Offer withdrawn. It remains in the lot history.');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading offers…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="aggregator" />
          <h1>Recycler Offers</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/aggregator')}>
            Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  if (profile && profile.active_role !== 'aggregator') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile.active_role} />
          <h1>Recycler Offers</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Aggregator access required</h2>
            <p>Offers to recyclers are available to approved aggregators only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request aggregator access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Recycler offers">
      <header className="dashboard-header">
        <DashboardNav role="aggregator" />
        <h1>Recycler Offers</h1>
        <p>Offers you have sent from your inventory. Withdrawing keeps the record for history.</p>
      </header>

      <main className="dashboard-main">
        {message && <p className="form-notice" role="status">{message}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section">
          <h2>Overview</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{summary.liveCount}</div>
              <div className="summary-label">Awaiting recycler</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.acceptedCount + summary.handoverCount}</div>
              <div className="summary-label">Accepted or awaiting receipt</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.completedCount}</div>
              <div className="summary-label">Completed handovers</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.totalCount}</div>
              <div className="summary-label">Offers in history</div>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Filter offers</h2>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="offer-status">Status</label>
              <select
                id="offer-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All offers</option>
                <option value="OFFERED_TO_RECYCLER">Awaiting recycler</option>
                <option value="ACCEPTED_BY_RECYCLER">Accepted by recycler</option>
                <option value="HANDOVER_CONFIRMED">Awaiting receipt confirmation</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED_BY_RECYCLER">Declined by recycler</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="offer-search">Search</label>
              <input
                id="offer-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Lot code, category or facility"
              />
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Offers</h2>
          {filtered.length === 0 ? (
            <p className="empty-state">
              No offers match this view. Open a lot in your inventory to send an offer to a recycler.
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
                        {offer.recycler?.facility_name || 'Recycler'}
                        {offer.recycler?.location ? `, ${offer.recycler.location}` : ''}
                      </span>
                      <span className="listing-sub">
                        {formatAmount(offer.offered_rate)}/kg for {formatWeight(saleableWeight(offer.lot))}
                      </span>
                      <span className="listing-sub">
                        Estimated {formatAmount(calculateOfferValue(offer.offered_rate, saleableWeight(offer.lot)))}
                      </span>
                      <span className="listing-sub">Sent {formatDateTime(offer.created_at)}</span>
                    </div>
                    <span className={`status-pill status-${offer.status.toLowerCase()}`}>
                      {offerStatusLabel(offer.status)}
                    </span>
                    <div className="listing-actions">
                      {confirmingId === offer.id ? (
                        <>
                          <button
                            className="btn btn-primary btn-small"
                            onClick={() => handleWithdraw(offer.id)}
                            disabled={busyId === offer.id}
                          >
                            {busyId === offer.id ? 'Withdrawing…' : 'Confirm withdraw'}
                          </button>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => setConfirmingId(null)}
                            disabled={busyId === offer.id}
                          >
                            Keep offer
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={`btn btn-small ${offer.status === 'ACCEPTED_BY_RECYCLER' || offer.status === 'HANDOVER_CONFIRMED' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => navigate(`/aggregator/offers/${offer.id}`)}
                          >
                            {offer.status === 'ACCEPTED_BY_RECYCLER'
                              ? 'Record handover'
                              : offer.status === 'HANDOVER_CONFIRMED'
                                ? 'View handover'
                                : 'Offer details'}
                          </button>
                          {offer.status === 'OFFERED_TO_RECYCLER' && (
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => setConfirmingId(offer.id)}
                            >
                              Withdraw
                            </button>
                          )}
                        </>
                      )}
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
