import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardNav from './DashboardNav';
import HandoverQr from './HandoverQr';
import OfferTimeline from './OfferTimeline';
import { getSupabaseClient } from '../lib/supabase';
import { fetchOwnProfile } from '../lib/listingsApi';
import { formatAmount, formatDateTime, formatWeight } from '../lib/listings';
import {
  calculateOfferValue,
  canConfirmHandover,
  canRecyclerRespond,
  formatLotCode,
  offerStatusLabel,
  paymentStatusLabel,
  saleableWeight,
} from '../lib/lots';
import {
  confirmHandover,
  fetchHandoverForOffer,
  fetchOffer,
  fetchTransactionEvents,
  respondToOffer,
} from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

export default function RecyclerOfferDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [offer, setOffer] = useState(null);
  const [handover, setHandover] = useState(null);
  const [events, setEvents] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // accept | reject | receipt

  const load = useCallback(async () => {
    const [offerResult, handoverResult, eventsResult] = await Promise.all([
      fetchOffer(supabase, id),
      fetchHandoverForOffer(supabase, id),
      fetchTransactionEvents(supabase, id),
    ]);
    if (offerResult.error) {
      setState('error');
      setError(offerResult.error);
      return;
    }
    if (handoverResult.error) {
      setState('error');
      setError(handoverResult.error);
      return;
    }
    setOffer(offerResult.data);
    setHandover(handoverResult.data);
    if (!eventsResult.error) setEvents(eventsResult.data);
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
      if (profileResult.data.profile.active_role !== 'recycler') {
        setState('ready');
        return;
      }
      await load();
    })();
    return () => {
      active = false;
    };
  }, [supabase, load]);

  const image = useMemo(() => materialImage(offer?.lot?.category?.name), [offer]);
  const estimated = offer
    ? calculateOfferValue(offer.offered_rate, saleableWeight(offer.lot))
    : null;
  const canRespond = offer && profile
    ? canRecyclerRespond(offer, offer.recycler_id, profile.active_role)
    : false;
  const canConfirm = offer && profile
    ? canConfirmHandover(handover, offer, offer.recycler_id, profile.active_role)
    : false;

  const handleResponse = async (response) => {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const result = await respondToOffer(supabase, offer.id, response);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setPendingAction(null);
      setMessage(
        response === 'ACCEPTED_BY_RECYCLER'
          ? 'Offer accepted. The aggregator will record the material handover.'
          : 'Offer declined. The aggregator can send a new offer for this lot.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReceipt = async () => {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const result = await confirmHandover(supabase, handover.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setPendingAction(null);
      setMessage('Receipt confirmed. The handover is now complete and the QR record is available.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading offer…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="recycler" />
          <h1>Offer</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/recycler/offers')}>
            Back to offers
          </button>
        </main>
      </div>
    );
  }

  if (profile?.active_role !== 'recycler') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Offer</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Recycler access required</h2>
            <p>Offers can only be reviewed by the recycler facility they were sent to.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request recycler access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Recycler offer details">
      <header className="dashboard-header">
        <DashboardNav role="recycler" />
        <p className="lot-code">{formatLotCode(offer.lot?.lot_code)}</p>
        <h1>{offer.lot?.category?.name || 'Material offer'}</h1>
        <p className="offer-origin">
          <span>From {offer.lot?.pickup_zone || 'the aggregator’s inventory'}</span>
          <span className={`status-pill status-${offer.status.toLowerCase()}`}>
            {offerStatusLabel(offer.status)}
          </span>
        </p>
      </header>

      <main className="dashboard-main">
        {message && <p className="form-notice" role="status">{message}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <div className="offer-detail-layout">
          <div className="offer-detail-main">
            <section className="dashboard-section">
              <h2>Material and offer</h2>
              <div className="offer-summary">
                <img
                  className="offer-image"
                  src={image.src}
                  alt={image.alt}
                  width="320"
                  height="240"
                  loading="lazy"
                />
                <dl className="detail-list">
                  <dt>Category</dt>
                  <dd>{offer.lot?.category?.name || 'Not set'}</dd>
                  <dt>Subcategory</dt>
                  <dd>{offer.lot?.subcategory?.name || 'Not specified'}</dd>
                  <dt>Weight basis</dt>
                  <dd>{formatWeight(saleableWeight(offer.lot))} recorded at collection</dd>
                  <dt>Condition</dt>
                  <dd>{offer.lot?.condition || 'Not specified'}</dd>
                  <dt>Pickup zone</dt>
                  <dd>{offer.lot?.pickup_zone || 'Not specified'}</dd>
                  <dt>Offer rate</dt>
                  <dd>{formatAmount(offer.offered_rate)}/kg</dd>
                  <dt>Estimated value</dt>
                  <dd>{formatAmount(estimated)}</dd>
                  <dt>Sent</dt>
                  <dd>{formatDateTime(offer.created_at)}</dd>
                </dl>
              </div>
              <p className="hint">
                The estimate uses the weight recorded at collection. The final value is based on
                the separate weight recorded at handover, and does not imply payment.
              </p>
            </section>

            <section className="dashboard-section">
              <h2>Offer history</h2>
              <OfferTimeline events={events} />
            </section>
          </div>

          <aside className="offer-action-panel" aria-label="Offer actions">
            <h2>Your response</h2>

            {offer.status === 'OFFERED_TO_RECYCLER' && canRespond && (
              <>
                <p>
                  Accepting reserves this material for your facility. Declining returns it to the
                  aggregator’s inventory for another offer.
                </p>
                {pendingAction === 'accept' && (
                  <div className="confirm-panel">
                    <p>Accept this offer at {formatAmount(offer.offered_rate)}/kg?</p>
                    <div className="form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => handleResponse('ACCEPTED_BY_RECYCLER')}
                        disabled={busy}
                      >
                        {busy ? 'Accepting…' : 'Confirm accept'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setPendingAction(null)}
                        disabled={busy}
                      >
                        Keep reviewing
                      </button>
                    </div>
                  </div>
                )}
                {pendingAction === 'reject' && (
                  <div className="confirm-panel">
                    <p>Decline this offer? This response is recorded and cannot be undone.</p>
                    <div className="form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => handleResponse('REJECTED_BY_RECYCLER')}
                        disabled={busy}
                      >
                        {busy ? 'Declining…' : 'Confirm decline'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setPendingAction(null)}
                        disabled={busy}
                      >
                        Keep reviewing
                      </button>
                    </div>
                  </div>
                )}
                {!pendingAction && (
                  <div className="action-stack">
                    <button className="btn btn-primary" onClick={() => setPendingAction('accept')}>
                      Accept offer
                    </button>
                    <button className="btn btn-secondary" onClick={() => setPendingAction('reject')}>
                      Decline offer
                    </button>
                  </div>
                )}
              </>
            )}

            {offer.status === 'ACCEPTED_BY_RECYCLER' && (
              <div className="action-note">
                <strong>Accepted. Awaiting handover.</strong>
                <p>
                  The aggregator records the handover date and final received weight. You will then
                  confirm receipt here.
                </p>
              </div>
            )}

            {offer.status === 'HANDOVER_CONFIRMED' && handover && canConfirm && (
              <>
                <div className="action-note">
                  <strong>Handover recorded</strong>
                  <p>
                    {formatWeight(handover.received_weight)} received on{' '}
                    {formatDateTime(handover.handover_timestamp)}.
                  </p>
                </div>
                {pendingAction === 'receipt' ? (
                  <div className="confirm-panel">
                    <p>Confirm that your facility received this material and weight?</p>
                    <div className="form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleConfirmReceipt}
                        disabled={busy}
                      >
                        {busy ? 'Confirming…' : 'Confirm receipt'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setPendingAction(null)}
                        disabled={busy}
                      >
                        Not yet
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={() => setPendingAction('receipt')}>
                    Confirm receipt
                  </button>
                )}
              </>
            )}

            {offer.status === 'COMPLETED' && handover && (
              <div className="action-note">
                <strong>Handover complete</strong>
                <p>Receipt confirmed on {formatDateTime(handover.recycler_confirmed_at)}.</p>
                <p className="hint">
                  Final received weight: {formatWeight(handover.received_weight)}. Original
                  collection records were not changed.
                </p>
              </div>
            )}

            {offer.status === 'REJECTED_BY_RECYCLER' && (
              <div className="action-note">
                <strong>Offer declined</strong>
                <p>The aggregator can send a new offer for this lot.</p>
              </div>
            )}

            {offer.status === 'WITHDRAWN' && (
              <div className="action-note">
                <strong>Offer withdrawn</strong>
                <p>The aggregator withdrew this offer before a response.</p>
              </div>
            )}

            {offer.status !== 'OFFERED_TO_RECYCLER' && offer.status !== 'REJECTED_BY_RECYCLER' && (
              <dl className="detail-list payment-facts">
                <dt>Payment</dt>
                <dd>{paymentStatusLabel(offer.payment_status)}</dd>
              </dl>
            )}

            {handover && (
              <div className="action-note">
                <strong>Handover record</strong>
                <p>Record {handover.id.slice(0, 8).toUpperCase()}</p>
                <p className="hint">
                  Final received weight: {formatWeight(handover.received_weight)}
                </p>
                {handover.notes && <p className="hint">{handover.notes}</p>}
              </div>
            )}

            {offer.status === 'COMPLETED' && handover?.qr_token && (
              <HandoverQr token={handover.qr_token} />
            )}

            <button
              className="btn btn-secondary"
              onClick={() => navigate('/recycler/offers')}
            >
              Back to offers
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
