import { useCallback, useEffect, useState } from 'react';
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
  summariseAggregatorLots,
  summariseOffers,
} from '../lib/lots';
import { claimLot, fetchAggregatorLots, fetchAggregatorOffers } from '../lib/lotsApi';

export default function DashboardAggregator() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [lots, setLots] = useState([]);
  const [offers, setOffers] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [lotsResult, offersResult] = await Promise.all([
      fetchAggregatorLots(supabase),
      fetchAggregatorOffers(supabase),
    ]);
    if (lotsResult.error || offersResult.error) {
      setState('error');
      setError(lotsResult.error || offersResult.error);
      return;
    }
    setLots(lotsResult.data);
    setOffers(offersResult.data);
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
  }, [supabase, load, reloadKey]);

  const handleClaim = async (lotId) => {
    setBusyId(lotId);
    setActionError('');
    try {
      const result = await claimLot(supabase, lotId, profile.id);
      if (result.error) setActionError(result.error);
      await load();
    } finally {
      setBusyId(null);
    }
  };

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
          <DashboardNav role="aggregator" />
          <h1>Aggregator dashboard</h1>
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

  if (profile?.active_role !== 'aggregator') {
    return (
      <div className="dashboard-page" aria-label="Aggregator dashboard">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Aggregator dashboard</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Aggregator access required</h2>
            <p>
              Inventory and recycler offers are available to approved aggregators only. Your current
              role is <strong>{profile?.active_role || 'consumer'}</strong>.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
                Request aggregator access
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

  const summary = summariseAggregatorLots(lots, profile.id);
  const offerSummary = summariseOffers(offers);

  return (
    <div className="dashboard-page" aria-label="Aggregator dashboard">
      <header className="dashboard-header">
        <DashboardNav role="aggregator" />
        <h1>Aggregator dashboard</h1>
        <p>{profile.full_name ? `Welcome, ${profile.full_name}` : 'Welcome back'}</p>
      </header>

      <main className="dashboard-main">
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section" aria-labelledby="aggregator-summary">
          <h2 id="aggregator-summary">Overview</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{summary.intakeCount}</div>
              <div className="summary-label">Lots awaiting intake</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.inventoryCount}</div>
              <div className="summary-label">Lots in my inventory</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{summary.inventoryWeight}</div>
              <div className="summary-label">Inventory weight (kg)</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{offerSummary.liveCount}</div>
              <div className="summary-label">Open recycler offers</div>
            </div>
            <div className="summary-card">
              <div className="summary-value">{offerSummary.acceptedCount + offerSummary.handoverCount}</div>
              <div className="summary-label">Awaiting handover or receipt</div>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => navigate('/aggregator/inventory')}>
              Manage inventory
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/aggregator/offers')}>
              View offers
            </button>
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="intake-heading">
          <h2 id="intake-heading">Lots Awaiting Intake</h2>
          <p className="hint">
            Collected lots with no aggregator yet. Receiving a lot assigns it to your inventory.
          </p>
          {summary.intake.length === 0 ? (
            <p className="empty-state">
              No unassigned lots right now. New collections appear here automatically.
            </p>
          ) : (
            <ul className="listing-list">
              {summary.intake.slice(0, 3).map((lot) => (
                <li key={lot.id} className="listing-card">
                  <div className="listing-info">
                    <span className="lot-code">{formatLotCode(lot.lot_code)}</span>
                    <strong>{lot.category?.name || 'Uncategorised'}</strong>
                    <span className="listing-sub">{lot.subcategory?.name || 'No subcategory'}</span>
                    <span className="listing-sub">
                      {formatWeight(saleableWeight(lot))}, {lot.condition || 'condition not set'}
                    </span>
                    <span className="listing-sub">Zone: {lot.pickup_zone || 'not specified'}</span>
                  </div>
                  <div className="listing-actions">
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => handleClaim(lot.id)}
                      disabled={busyId === lot.id}
                    >
                      {busyId === lot.id ? 'Receiving…' : 'Receive lot'}
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => navigate(`/aggregator/inventory/${lot.id}`)}
                    >
                      Details
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="inventory-heading">
          <h2 id="inventory-heading">My Inventory</h2>
          {summary.inventory.length === 0 ? (
            <p className="empty-state">
              Your inventory is empty. Receive a collected lot to start building it.
            </p>
          ) : (
            <ul className="listing-list">
              {summary.inventory.slice(0, 3).map((lot) => (
                <li key={lot.id} className="listing-card">
                  <div className="listing-info">
                    <span className="lot-code">{formatLotCode(lot.lot_code)}</span>
                    <strong>{lot.category?.name || 'Uncategorised'}</strong>
                    <span className="listing-sub">{lot.subcategory?.name || 'No subcategory'}</span>
                    <span className="listing-sub">{formatWeight(saleableWeight(lot))}</span>
                  </div>
                  <span className="status-pill status-in_aggregator_inventory">In inventory</span>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => navigate(`/aggregator/inventory/${lot.id}`)}
                  >
                    Open lot
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="offers-heading">
          <div className="section-heading-row">
            <h2 id="offers-heading">Recent Offers</h2>
            <button className="btn btn-secondary btn-small" onClick={() => navigate('/aggregator/offers')}>
              View all offers
            </button>
          </div>
          {offerSummary.totalCount === 0 ? (
            <p className="empty-state">
              No offers sent yet. Open a lot in your inventory to offer it to a recycler.
            </p>
          ) : (
            <ul className="activity-list">
              {offers.slice(0, 5).map((offer) => (
                <li key={offer.id} className="activity-item">
                  <span>
                    {formatLotCode(offer.lot?.lot_code)} to {offer.recycler?.facility_name || 'a recycler'}
                  </span>
                  <span>
                    {offerStatusLabel(offer.status)}
                    {offer.lot
                      ? `, ${formatAmount(calculateOfferValue(offer.offered_rate, saleableWeight(offer.lot)))}`
                      : ''}
                  </span>
                  <span>{formatDateTime(offer.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
