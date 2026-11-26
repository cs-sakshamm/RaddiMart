import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardNav from './DashboardNav';
import { getSupabaseClient } from '../lib/supabase';
import { fetchOwnProfile } from '../lib/listingsApi';
import { formatAmount, formatDateTime, formatWeight } from '../lib/listings';
import {
  calculateOfferValue,
  canClaimLot,
  canCreateOffer,
  formatLotCode,
  hasActiveOffer,
  offerStatusLabel,
  saleableWeight,
  validateOffer,
  verificationLabel,
} from '../lib/lots';
import {
  claimLot,
  createOffer,
  fetchLot,
  fetchOfferHistoryForLot,
  fetchRecyclerDirectory,
  withdrawOffer,
} from '../lib/lotsApi';

export default function AggregatorLotDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [lot, setLot] = useState(null);
  const [offers, setOffers] = useState([]);
  const [recyclers, setRecyclers] = useState([]);
  const [recyclerId, setRecyclerId] = useState('');
  const [rate, setRate] = useState('');
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const load = useCallback(async () => {
    const [lotResult, offersResult] = await Promise.all([
      fetchLot(supabase, id),
      fetchOfferHistoryForLot(supabase, id),
    ]);
    if (lotResult.error) {
      setState('error');
      setError(lotResult.error);
      return;
    }
    if (offersResult.error) {
      setState('error');
      setError(offersResult.error);
      return;
    }
    setLot(lotResult.data);
    setOffers(offersResult.data);
    setState('ready');
  }, [supabase, id]);

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
      if (profileResult.data.profile.active_role !== 'aggregator') {
        setState('ready');
        return;
      }
      const directoryResult = await fetchRecyclerDirectory(supabase);
      if (!active) return;
      if (!directoryResult.error) setRecyclers(directoryResult.data);
      await load();
    })();
    return () => {
      active = false;
    };
  }, [supabase, load]);

  const offerValue = useMemo(
    () => calculateOfferValue(rate, saleableWeight(lot)),
    [rate, lot],
  );
  const liveOffer = useMemo(
    () => (offers || []).find((offer) => offer.status === 'OFFERED_TO_RECYCLER') || null,
    [offers],
  );
  const canOffer = lot && profile
    ? canCreateOffer(lot, profile.id, profile.active_role, hasActiveOffer(offers))
    : false;
  const acceptedOffer = (offers || []).find((offer) =>
    ['ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED'].includes(offer.status),
  );
  const latestOffer = offers?.[0] || null;

  const handleClaim = async () => {
    setBusy(true);
    setActionError('');
    try {
      const result = await claimLot(supabase, lot.id, profile.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setMessage('Lot received into your inventory.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleOffer = async (event) => {
    event.preventDefault();
    setActionError('');
    setMessage('');
    const validation = validateOffer({ recyclerId, ratePerKg: rate });
    if (validation) {
      setActionError(validation);
      return;
    }
    setBusy(true);
    try {
      const result = await createOffer(supabase, { lotId: lot.id, recyclerId, offeredRate: rate });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setMessage('Offer sent to the recycler.');
      setRate('');
      setRecyclerId('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const result = await withdrawOffer(supabase, liveOffer.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setConfirmingWithdraw(false);
      setMessage('Offer withdrawn. The lot is available for a new offer.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading lot…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="aggregator" />
          <h1>Material lot</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/aggregator/inventory')}>
            Back to inventory
          </button>
        </main>
      </div>
    );
  }

  if (profile?.active_role !== 'aggregator') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Material lot</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Aggregator access required</h2>
            <p>Material lots are available to approved aggregators only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request aggregator access
            </button>
          </section>
        </main>
      </div>
    );
  }

  const intake = !lot.aggregator_id;
  const owned = lot.aggregator_id === profile.id;

  return (
    <div className="dashboard-page" aria-label="Material lot details">
      <header className="dashboard-header">
        <DashboardNav role="aggregator" />
        <p className="lot-code">{formatLotCode(lot.lot_code)}</p>
        <h1>{lot.category?.name || 'Material lot'}</h1>
        <p>{intake ? 'Awaiting aggregator intake' : 'In your inventory'}</p>
      </header>

      <main className="dashboard-main">
        {message && <p className="form-notice" role="status">{message}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section">
          <h2>Material</h2>
          <dl className="detail-list">
            <dt>Category</dt>
            <dd>{lot.category?.name || 'Not set'}</dd>
            <dt>Subcategory</dt>
            <dd>{lot.subcategory?.name || 'Not specified'}</dd>
            <dt>Weight used for offers</dt>
            <dd>
              {formatWeight(saleableWeight(lot))}
              {!lot.actual_weight ? ' (consumer estimate; no collected weight recorded)' : ' (recorded at collection)'}
            </dd>
            <dt>Condition</dt>
            <dd>{lot.condition || 'Not specified'}</dd>
            <dt>Pickup zone</dt>
            <dd>{lot.pickup_zone || 'Not specified'}</dd>
            <dt>Lot created</dt>
            <dd>{formatDateTime(lot.created_at)}</dd>
            <dt>Status</dt>
            <dd>{intake ? 'Awaiting intake' : 'In aggregator inventory'}</dd>
          </dl>
          <p className="hint">
            This lot keeps its source collection record for traceability. The consumer’s name, phone
            and street address are not copied into aggregator inventory.
          </p>
        </section>

        {intake && (
          <section className="dashboard-section">
            <h2>Receive this lot</h2>
            <p>
              Receiving the lot assigns it to your inventory. Only one aggregator can receive a lot,
              and the assignment is enforced by the database.
            </p>
            <button className="btn btn-primary" onClick={handleClaim} disabled={busy || !canClaimLot(lot, profile.id, profile.active_role)}>
              {busy ? 'Receiving…' : 'Receive lot'}
            </button>
          </section>
        )}

        {owned && acceptedOffer && (
          <section className="dashboard-section">
            <h2>Accepted offer</h2>
            <div className="price-panel">
              <strong>{offerStatusLabel(acceptedOffer.status)}</strong>
              <p>
                {acceptedOffer.recycler?.facility_name || 'Recycler'} at{' '}
                {formatAmount(acceptedOffer.offered_rate)}/kg
              </p>
              <p className="hint">
                This lot is committed to the accepted offer. Continue in the offer record to
                record handover, confirm receipt or review the QR verification.
              </p>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/aggregator/offers/${acceptedOffer.id}`)}
              >
                Open offer record
              </button>
            </div>
          </section>
        )}

        {owned && !acceptedOffer && (
          <section className="dashboard-section" aria-labelledby="offer-heading">
            <h2 id="offer-heading">Offer to a recycler</h2>
            {liveOffer ? (
              <>
                {latestOffer?.status === 'REJECTED_BY_RECYCLER' && (
                  <p className="form-notice" role="status">
                    The recycler declined the last offer. You can send a new offer for this lot.
                  </p>
                )}
                <div className="price-panel">
                  <strong>Open offer</strong>
                  <p>
                    {liveOffer.recycler?.facility_name || 'Recycler'} at {formatAmount(liveOffer.offered_rate)}/kg
                  </p>
                  <p>
                    Estimated value{' '}
                    {formatAmount(calculateOfferValue(liveOffer.offered_rate, saleableWeight(lot)))}
                  </p>
                  <p className="hint">
                    {verificationLabel(liveOffer.recycler?.verification_status)}. The final value is
                    confirmed after handover and does not imply payment.
                  </p>
                </div>
                {confirmingWithdraw ? (
                  <div className="confirm-panel">
                    <p>Withdraw this offer? It will stay in the lot history but the recycler can no longer act on it.</p>
                    <div className="form-actions">
                      <button className="btn btn-primary" onClick={handleWithdraw} disabled={busy}>
                        {busy ? 'Withdrawing…' : 'Confirm withdraw'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => setConfirmingWithdraw(false)} disabled={busy}>
                        Keep offer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="form-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => navigate(`/aggregator/offers/${liveOffer.id}`)}
                    >
                      Open offer record
                    </button>
                    <button className="btn btn-secondary" onClick={() => setConfirmingWithdraw(true)}>
                      Withdraw offer
                    </button>
                  </div>
                )}
              </>
            ) : recyclers.length === 0 ? (
              <p className="empty-state">
                No recycler facilities are registered yet. A recycler must create a facility profile
                before you can send an offer.
              </p>
            ) : (
              <form className="listing-form" onSubmit={handleOffer}>
                <div className="form-group">
                  <label htmlFor="offer-recycler">Recycler facility</label>
                  <select
                    id="offer-recycler"
                    value={recyclerId}
                    onChange={(event) => setRecyclerId(event.target.value)}
                    required
                  >
                    <option value="">Choose a recycler</option>
                    {recyclers.map((recycler) => (
                      <option key={recycler.id} value={recycler.id}>
                        {recycler.facility_name}
                        {recycler.location ? `, ${recycler.location}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="offer-rate">Buying rate (₹ per kg)</label>
                  <input
                    id="offer-rate"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    required
                  />
                </div>
                <div className="price-panel" aria-live="polite">
                  <strong>Estimated offer value</strong>
                  <p>
                    {offerValue === null
                      ? 'Choose a rate to see the estimated value.'
                      : `${formatAmount(offerValue)} at ${formatWeight(saleableWeight(lot))}`}
                  </p>
                  <p className="hint">
                    Estimated only. The final value is confirmed after handover and does not imply
                    payment.
                  </p>
                </div>
                {recyclerId && (
                  <p className="hint">
                    {verificationLabel(
                      recyclers.find((recycler) => recycler.id === recyclerId)?.verification_status,
                    )}
                  </p>
                )}
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy || !canOffer}>
                    {busy ? 'Sending…' : 'Send offer'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        <section className="dashboard-section">
          <h2>Offer history</h2>
          {offers.length === 0 ? (
            <p className="empty-state">No offers have been sent for this lot.</p>
          ) : (
            <ul className="activity-list">
              {offers.map((offer) => (
                <li key={offer.id} className="activity-item">
                  <span>{offer.recycler?.facility_name || 'Recycler'}</span>
                  <span>
                    {offerStatusLabel(offer.status)}, {formatAmount(offer.offered_rate)}/kg
                  </span>
                  <span>{formatDateTime(offer.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/aggregator/inventory')}>
            Back to inventory
          </button>
        </div>
      </main>
    </div>
  );
}
