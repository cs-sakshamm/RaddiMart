import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { readOwnProfile } from '../lib/profileApi';
import DashboardNav from './DashboardNav';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState(() =>
    getSupabaseClient() ? 'loading' : 'error',
  ); // loading | ready | error
  const [error, setError] = useState(() =>
    getSupabaseClient() ? '' : 'Profile is unavailable because the application is not configured.',
  );
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
      // Same lookup as the dashboards, so a genuinely missing profile heals
      // itself and a refused read is reported as an access problem.
      const { profile: data, error: profileError } = await readOwnProfile(supabase, session.user.id);
      if (!active) return;
      if (profileError) {
        setState('error');
        setError(profileError.message);
        return;
      }
      setProfile(data);
      setFullName(data.full_name || '');
      setPhone(data.phone || '');
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [navigate, reloadKey]);

  const handleSave = async (event) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase || !profile) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', profile.id);
      if (updateError) {
        setError('Could not save your profile. Please try again.');
        return;
      }
      setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() });
      setSuccess('Profile updated.');
      setEditing(false);
    } catch {
      setError('Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="dashboard-page" aria-busy="true">
        <p className="page-loading">Loading your profile…</p>
      </div>
    );
  }

  // A load failure is not an empty profile. Keep the user in the app, explain
  // what happened, and offer a retry instead of showing placeholder details
  // with an Edit action that cannot save anything.
  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile?.active_role} />
          <h1>My profile</h1>
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

  return (
    <div className="dashboard-page" aria-label="Profile page">
      <header className="dashboard-header">
        <DashboardNav role={profile?.active_role} />
        <h1>My profile</h1>
        <p>Your account details and current role.</p>
      </header>

      <main className="dashboard-main">
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-notice" role="status">{success}</p>}

        <section className="dashboard-section profile-section">
          {!editing ? (
            <>
              <dl className="detail-list">
                <dt>Name</dt>
                <dd>{profile?.full_name || 'Not set'}</dd>
                <dt>Email</dt>
                <dd>{profile?.email || 'Managed by your sign-in account'}</dd>
                <dt>Phone</dt>
                <dd>{profile?.phone || 'Not set'}</dd>
                <dt>Role</dt>
                <dd>
                  <span className="status-pill">{profile?.active_role || 'consumer'}</span>
                </dd>
                {profile?.is_admin && (
                  <>
                    <dt>Administrator</dt>
                    <dd>Yes</dd>
                  </>
                )}
              </dl>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => { setEditing(true); setSuccess(''); }}>
                  Edit profile
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/role-request')}>
                  Request another role
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="listing-form">
              <div className="form-group">
                <label htmlFor="profile-name">Full name</label>
                <input
                  id="profile-name"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="profile-phone">Phone number (optional)</label>
                <input
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="Your phone number"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditing(false);
                    setFullName(profile?.full_name || '');
                    setPhone(profile?.phone || '');
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
