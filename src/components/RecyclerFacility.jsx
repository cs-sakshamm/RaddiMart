import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardNav from './DashboardNav';
import { getSupabaseClient } from '../lib/supabase';
import { fetchCatalogue, fetchOwnProfile } from '../lib/listingsApi';
import { verificationLabel } from '../lib/lots';
import { fetchOwnFacility, saveOwnFacility } from '../lib/lotsApi';

export default function RecyclerFacility() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [facility, setFacility] = useState(null);
  const [categories, setCategories] = useState([]);
  const [facilityName, setFacilityName] = useState('');
  const [location, setLocation] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [accepted, setAccepted] = useState([]);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

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
      const [facilityResult, catalogueResult] = await Promise.all([
        fetchOwnFacility(supabase, profileResult.data.user.id),
        fetchCatalogue(supabase),
      ]);
      if (!active) return;
      if (facilityResult.error) {
        setState('error');
        setError(facilityResult.error);
        return;
      }
      if (!catalogueResult.error) setCategories(catalogueResult.data.categories);
      const existing = facilityResult.data;
      setFacility(existing);
      if (existing) {
        setFacilityName(existing.facility_name || '');
        setLocation(existing.location || '');
        setContactEmail(existing.contact_email || '');
        setAccepted(existing.accepted_categories || []);
      }
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const toggleCategory = (name) => {
    setAccepted((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setActionError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await saveOwnFacility(supabase, {
        userId: profile.id,
        existingId: facility?.id,
        facilityName,
        location,
        contactEmail,
        acceptedCategories: accepted,
      });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setMessage(facility ? 'Facility profile updated.' : 'Facility profile created. Verification stays pending until an administrator records it.');
      const refreshed = await fetchOwnFacility(supabase, profile.id);
      if (!refreshed.error) setFacility(refreshed.data);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p>Loading facility profile…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="recycler" />
          <h1>Facility profile</h1>
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

  if (profile?.active_role !== 'recycler') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role || 'consumer'} />
          <h1>Facility profile</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Recycler access required</h2>
            <p>A facility profile is available to approved recycler accounts only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request recycler access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Recycler facility profile">
      <header className="dashboard-header">
        <DashboardNav role="recycler" />
        <h1>Facility profile</h1>
        <p>Aggregators use this profile to choose where material offers are sent.</p>
      </header>

      <main className="dashboard-main">
        {message && <p className="form-notice" role="status">{message}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section">
          <h2>Verification status</h2>
          <p>
            <span className={`status-pill status-${facility?.verification_status || 'pending'}`}>
              {verificationLabel(facility?.verification_status)}
            </span>
          </p>
          <p className="hint">
            Verification is recorded by an administrator. RADDIMART does not describe a facility as
            legally authorized unless that status has actually been verified.
          </p>
        </section>

        <section className="dashboard-section">
          <h2>{facility ? 'Update facility details' : 'Create your facility'}</h2>
          <form className="listing-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="facility-name">Facility name</label>
              <input
                id="facility-name"
                type="text"
                value={facilityName}
                onChange={(event) => setFacilityName(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="facility-location">Location</label>
              <input
                id="facility-location"
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City or operating area"
              />
            </div>

            <div className="form-group">
              <label htmlFor="facility-email">Contact email</label>
              <input
                id="facility-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>

            <fieldset className="form-group checkbox-fieldset">
              <legend>Accepted material categories</legend>
              <div className="checkbox-grid">
                {categories.map((category) => (
                  <label key={category.id} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={accepted.includes(category.name)}
                      onChange={() => toggleCategory(category.name)}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : facility ? 'Save facility' : 'Create facility'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/dashboard/recycler')}
                disabled={busy}
              >
                Back to dashboard
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
