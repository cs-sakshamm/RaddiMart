import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { REQUESTABLE_ROLES } from '../config/brand';
import DashboardNav from './DashboardNav';

const ROLE_STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Not approved',
};

export default function RoleRequestPage() {
  const [selectedRole, setSelectedRole] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState('consumer');
  const [existingRequest, setExistingRequest] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(getSupabaseClient()));
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        navigate('/signin', { replace: true });
        return;
      }
      const [{ data: profile }, { data: request }] = await Promise.all([
        supabase.from('profiles').select('active_role, full_name').eq('id', session.user.id).single(),
        supabase
          .from('role_requests')
          .select('requested_role, status, created_at')
          .eq('user_id', session.user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!active) return;
      if (profile) {
        setRole(profile.active_role || 'consumer');
        setApplicantName((current) => current || profile.full_name || '');
      }
      if (request) setExistingRequest(request);
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleRequest = async (event) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Requests are unavailable because the application is not configured.');
      return;
    }
    if (!selectedRole) {
      setError('Choose the role you are requesting.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in again to submit a request.');
        return;
      }
      if (existingRequest) {
        setError('You already have a role request waiting for review.');
        return;
      }
      const { error: insertError } = await supabase.from('role_requests').insert({
        user_id: session.user.id,
        requested_role: selectedRole,
        applicant_name: applicantName || null,
        organization_name: organizationName || null,
        phone: phone || null,
        city_or_operating_area: city || null,
        description: description || null,
        status: 'pending',
      });
      if (insertError) {
        setError('Could not submit the request. Please try again.');
      } else {
        setExistingRequest({ requested_role: selectedRole, status: 'pending' });
      }
    } catch {
      setError('Could not submit the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleLabel =
    REQUESTABLE_ROLES.find((item) => item.value === existingRequest?.requested_role)?.label ||
    existingRequest?.requested_role ||
    '';

  return (
    <div className="dashboard-page" aria-label="Role request page">
      <header className="dashboard-header">
        <DashboardNav role={role} />
        <h1>Request another role</h1>
        <p>An administrator reviews every request before a role is added to your account.</p>
      </header>

      <main className="dashboard-main">
        {error && <p className="form-error" role="alert">{error}</p>}

        {existingRequest ? (
          <section className="dashboard-section">
            <h2>Request received</h2>
            <dl className="detail-list">
              <dt>Requested role</dt>
              <dd>{roleLabel}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`status-pill status-${existingRequest.status}`}>
                  {ROLE_STATUS_LABELS[existingRequest.status] || existingRequest.status}
                </span>
              </dd>
            </dl>
            <p className="hint">
              You will keep your current role until the request is approved. You can check back
              here at any time.
            </p>
            <div className="form-actions">
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/dashboard/${role}`)}
              >
                Back to dashboard
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="dashboard-section">
              <h2>Roles you can request</h2>
              <dl className="role-facts">
                <div>
                  <dt>Local Kabadiwala / collector</dt>
                  <dd>Discover pickup requests, collect materials and record actual weights.</dd>
                </div>
                <div>
                  <dt>Aggregator</dt>
                  <dd>Receive collected lots, manage inventory and send offers to recyclers.</dd>
                </div>
                <div>
                  <dt>Recycler</dt>
                  <dd>Publish a facility profile, respond to offers and confirm received material.</dd>
                </div>
              </dl>
            </section>

            <section className="dashboard-section">
              <h2>Your request</h2>
              {checking ? (
                <p className="page-loading">Checking for an existing request…</p>
              ) : (
                <form onSubmit={handleRequest} className="listing-form">
                  <div className="form-group">
                    <label htmlFor="requested-role">Role requested</label>
                    <select
                      id="requested-role"
                      value={selectedRole}
                      onChange={(event) => setSelectedRole(event.target.value)}
                      required
                    >
                      <option value="">Choose a role</option>
                      {REQUESTABLE_ROLES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="applicant-name">Your name</label>
                    <input
                      id="applicant-name"
                      type="text"
                      value={applicantName}
                      onChange={(event) => setApplicantName(event.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="organization-name">Business or organisation (optional)</label>
                    <input
                      id="organization-name"
                      type="text"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      placeholder="Business name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="applicant-phone">Phone number (optional)</label>
                    <input
                      id="applicant-phone"
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Your phone number"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="operating-area">City or operating area</label>
                    <input
                      id="operating-area"
                      type="text"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="City or operating area"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="request-description">What work do you do? (optional)</label>
                    <textarea
                      id="request-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="A short description of your operation"
                      rows={3}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Submitting…' : 'Submit request'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate(`/dashboard/${role}`)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
