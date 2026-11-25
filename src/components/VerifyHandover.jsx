import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { getSupabaseClient } from '../lib/supabase';
import { formatDateTime, formatWeight } from '../lib/listings';
import { fetchPublicHandover } from '../lib/lotsApi';

export default function VerifyHandover() {
  const { token } = useParams();
  const supabase = getSupabaseClient();

  const [record, setRecord] = useState(null);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Verification is not available right now.');

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    (async () => {
      if (!token) {
        if (active) setState('notfound');
        return;
      }
      const result = await fetchPublicHandover(supabase, token);
      if (!active) return;
      if (result.error) {
        setState('error');
        setError(result.error);
        return;
      }
      if (!result.data) {
        setState('notfound');
        return;
      }
      setRecord(result.data);
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase, token]);

  return (
    <div className="verify-page">
      <header className="verify-header">
        <Link to="/" className="verify-brand" aria-label="RADDIMART home">
          <BrandMark className="verify-logo" alt="RADDIMART" />
        </Link>
        <span className="verify-kind">Digital handover record</span>
      </header>

      <main className="verify-main">
        {state === 'loading' && (
          <section className="verify-card" aria-busy="true">
            <h1>Checking handover record</h1>
            <p>Looking up the reference in the RADDIMART handover register.</p>
          </section>
        )}

        {state === 'notfound' && (
          <section className="verify-card">
            <p className="verify-kicker">Not available</p>
            <h1>Handover record not found</h1>
            <p>
              This QR reference does not match a completed handover. A record becomes available
              only after the recycler confirms receipt.
            </p>
            <Link className="btn btn-secondary" to="/">
              Back to RADDIMART
            </Link>
          </section>
        )}

        {state === 'error' && (
          <section className="verify-card">
            <p className="verify-kicker">Temporary problem</p>
            <h1>Could not check this record</h1>
            <p role="alert">{error}</p>
            <Link className="btn btn-secondary" to="/">
              Back to RADDIMART
            </Link>
          </section>
        )}

        {state === 'ready' && record && (
          <article className="verify-card">
            <div className="verify-intro">
              <div>
                <p className="verify-kicker">Record verified</p>
                <h1>Material handover completed</h1>
                <p>
                  This is a read-only digital handover record for material transferred through
                  RADDIMART. It is not a regulatory certificate or an official certification.
                </p>
              </div>
              <span className="verify-mark" aria-hidden="true">✓</span>
            </div>

            <dl className="verify-facts">
              <div>
                <dt>Record reference</dt>
                <dd>{record.record_reference}</dd>
              </div>
              <div>
                <dt>Material</dt>
                <dd>
                  {record.category || 'Material'}
                  {record.subcategory ? `, ${record.subcategory}` : ''}
                </dd>
              </div>
              <div>
                <dt>Final received weight</dt>
                <dd>{formatWeight(record.received_weight)}</dd>
              </div>
              <div>
                <dt>Handover date</dt>
                <dd>{formatDateTime(record.handover_at)}</dd>
              </div>
              <div>
                <dt>Recycler facility</dt>
                <dd>{record.facility_name || 'Recycler facility'}</dd>
              </div>
              <div>
                <dt>Facility location</dt>
                <dd>{record.facility_location || 'Not specified'}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{formatDateTime(record.completed_at)}</dd>
              </div>
              <div>
                <dt>Lot reference</dt>
                <dd>{record.lot_reference}</dd>
              </div>
            </dl>

            <p className="verify-note">
              Privacy: this page deliberately does not show consumer addresses, personal contact
              details, commercial rates, payment amounts or account information.
            </p>

            <Link className="btn btn-secondary" to="/">
              Back to RADDIMART
            </Link>
          </article>
        )}
      </main>

      <footer className="verify-footer">
        <span>RADDIMART</span>
        <span>Material traceability, not a certification.</span>
      </footer>
    </div>
  );
}
