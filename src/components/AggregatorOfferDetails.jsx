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
  canRecordHandover,
  canRecordPayment,
  formatLotCode,
  offerStatusLabel,
  paymentStatusLabel,
  saleableWeight,
  validateHandover,
} from '../lib/lots';
import {
  fetchHandoverForOffer,
  fetchOffer,
  fetchTransactionEvents,
  markOfferPaid,
  recordHandover,
} from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AggregatorOfferDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [offer, setOffer] = useState(null);
  const [handover, setHandover] = useState(null);
  const [events, setEvents] = useState([]);
  const [receivedWeight, setReceivedWeight] = useState('');
  const [handoverAt, setHandoverAt] = useState(localDateTimeValue());
  const [notes, setNotes] = useState('');
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // handover | payment

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
      if (profileResult.data.profile.active_role !== 'aggregator') {
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
  const canHandover = offer && profile
    ? canRecordHandover(offer, profile.id, profile.active_role)
    : false;
  const canPay = offer && profile ? canRecordPayment(offer, profile.active_role) : false;

  const handleHandoverSubmit = (event) => {
    event.preventDefault();
    setActionError('');
    setMessage('');
    const validation = validateHandover({ receivedWeight, handoverDate: handoverAt });
    if (validation) {
      setActionError(validation);
      return;
    }
    setPendingAction('handover');
  };

  const handleRecordHandover = async () => {
    setBusy(true);
    setActionError('');
    try {
      const result = await recordHandover(supabase, {
        offerId: offer.id,
        receivedWeight,
        handoverAt,
        notes,
      });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setPendingAction(null);
      setMessage('Handover recorded. The recycler must confirm receipt to complete the record.');
      setReceivedWeight('');
      setNotes('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handlePayment = async () => {
    setBusy(true);
    setActionError('');
    try {
      const result = await markOfferPaid(supabase, offer.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setPendingAction(null);
      setMessage('Payment recorded. This is a manual status, not a payment gateway transaction.');
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
          <DashboardNav role="aggregator" />
          <h1>Offer</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/aggregator/offers')}>
            Back to offers
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
          <h1>Offer</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Aggregator access required</h2>
            <p>Offers are available to the approved aggregator that owns the lot.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request aggregator access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Aggregator offer details">
      <header className="dashboard-header">
        <DashboardNav role="aggregator" />
        <p className="lot-code">{formatLotCode(offer.lot?.lot_code)}</p>
        <h1>{offer.lot?.category?.name || 'Material offer'}</h1>
        <p className="offer-origin">
          <span>To {offer.recycler?.facility_name || 'a recycler facility'}</span>
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
                  <dt>Recycler facility</dt>
                  <dd>
                    {offer.recycler?.facility_name || 'Recycler'}
                    {offer.recycler?.location ? `, ${offer.recycler.location}` : ''}
                  </dd>
                  <dt>Category</dt>
                  <dd>{offer.lot?.category?.name || 'Not set'}</dd>
                  <dt>Subcategory</dt>
                  <dd>{offer.lot?.subcategory?.name || 'Not specified'}</dd>
                  <dt>Collected weight</dt>
                  <dd>{formatWeight(saleableWeight(offer.lot))}</dd>
                  <dt>Offer rate</dt>
                  <dd>{formatAmount(offer.offered_rate)}/kg</dd>
                  <dt>Estimated value</dt>
                  <dd>{formatAmount(estimated)}</dd>
                  <dt>Payment</dt>
                  <dd>{paymentStatusLabel(offer.payment_status)}</dd>
                  <dt>Sent</dt>
                  <dd>{formatDateTime(offer.created_at)}</dd>
                </dl>
              </div>
              <p className="hint">
                The final value is calculated from the separate received weight recorded at
                handover. It never changes the original collection weight.
              </p>
            </section>

            {handover && (
              <section className="dashboard-section">
                <h2>Handover record</h2>
                <dl className="detail-list">
                  <dt>Handover date</dt>
                  <dd>{formatDateTime(handover.handover_timestamp)}</dd>
                  <dt>Final received weight</dt>
                  <dd>{formatWeight(handover.received_weight)}</dd>
                  <dt>Final value</dt>
                  <dd>{formatAmount(offer.final_value)}</dd>
                  <dt>Recycler confirmation</dt>
                  <dd>
                    {handover.recycler_confirmation
                      ? `Confirmed ${formatDateTime(handover.recycler_confirmed_at)}`
                      : 'Awaiting recycler confirmation'}
                  </dd>
                  {handover.notes && (
                    <>
                      <dt>Handover notes</dt>
                      <dd>{handover.notes}</dd>
                    </>
                  )}
                </dl>
                {offer.status === 'COMPLETED' && handover.qr_token && (
                  <HandoverQr token={handover.qr_token} />
                )}
              </section>
            )}

            <section className="dashboard-section">
              <h2>Offer history</h2>
              <OfferTimeline events={events} />
            </section>
          </div>

          <aside className="offer-action-panel" aria-label="Handover and payment actions">
            <h2>Next action</h2>

            {offer.status === 'OFFERED_TO_RECYCLER' && (
              <div className="action-note">
                <strong>Awaiting recycler response</strong>
                <p>The recycler can accept or decline this offer.</p>
              </div>
            )}

            {offer.status === 'REJECTED_BY_RECYCLER' && (
              <div className="action-note">
                <strong>Offer declined</strong>
                <p>The lot remains in your inventory. You can send a new offer from the lot.</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate(`/aggregator/inventory/${offer.lot_id}`)}
                >
                  Open lot
                </button>
              </div>
            )}

            {offer.status === 'WITHDRAWN' && (
              <div className="action-note">
                <strong>Offer withdrawn</strong>
                <p>This offer is retained for history only.</p>
              </div>
            )}

            {offer.status === 'ACCEPTED_BY_RECYCLER' && canHandover && (
              <>
                <p>
                  Record the handover date and the final weight received by the recycler. This is a
                  separate fact from the collection weight.
                </p>
                <form className="listing-form handover-form" onSubmit={handleHandoverSubmit}>
                  <div className="form-group">
                    <label htmlFor="received-weight">Final received weight (kg)</label>
                    <input
                      id="received-weight"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={receivedWeight}
                      onChange={(event) => setReceivedWeight(event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="handover-at">Handover date and time</label>
                    <input
                      id="handover-at"
                      type="datetime-local"
                      value={handoverAt}
                      max={localDateTimeValue()}
                      onChange={(event) => setHandoverAt(event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group handover-notes">
                    <label htmlFor="handover-notes">Handover notes (optional)</label>
                    <textarea
                      id="handover-notes"
                      rows="2"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Vehicle, condition or other handover detail"
                    />
                  </div>
                  {pendingAction === 'handover' ? (
                    <div className="confirm-panel handover-confirm">
                      <p>
                        Record {formatWeight(receivedWeight)} received on{' '}
                        {formatDateTime(handoverAt)}? The recycler will be asked to confirm receipt.
                      </p>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleRecordHandover}
                          disabled={busy}
                        >
                          {busy ? 'Recording…' : 'Confirm handover'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setPendingAction(null)}
                          disabled={busy}
                        >
                          Keep editing
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary">
                        Review handover
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}

            {offer.status === 'HANDOVER_CONFIRMED' && (
              <div className="action-note">
                <strong>Awaiting recycler confirmation</strong>
                <p>
                  The recycler must confirm receipt of {formatWeight(handover?.received_weight)}.
                  The QR record is available after that.
                </p>
              </div>
            )}

            {offer.status === 'COMPLETED' && (
              <div className="action-note">
                <strong>Handover complete</strong>
                <p>Both parties have recorded this custody transfer.</p>
              </div>
            )}

            <div className="payment-panel">
              <h3>Payment</h3>
              <p className={`status-pill status-${offer.payment_status.toLowerCase()}`}>
                {paymentStatusLabel(offer.payment_status)}
              </p>
              <p className="hint">
                Payment is recorded separately and is never inferred from acceptance or handover.
              </p>
              {canPay && pendingAction === 'payment' ? (
                <div className="confirm-panel">
                  <p>Record this offer as paid? This does not process a payment.</p>
                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={handlePayment} disabled={busy}>
                      {busy ? 'Recording…' : 'Confirm payment'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setPendingAction(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canPay ? (
                <button className="btn btn-secondary" onClick={() => setPendingAction('payment')}>
                  Mark as paid
                </button>
              ) : (
                <p className="hint">
                  {offer.payment_status === 'PAID'
                    ? 'Payment has been recorded by the aggregator.'
                    : 'Payment can be recorded after the recycler accepts this offer.'}
                </p>
              )}
            </div>

            <button className="btn btn-secondary" onClick={() => navigate('/aggregator/offers')}>
              Back to offers
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
