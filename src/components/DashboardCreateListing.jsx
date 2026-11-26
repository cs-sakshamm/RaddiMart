import DashboardNav from './DashboardNav';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { createListing, fetchCatalogue, getSessionUser } from '../lib/listingsApi';
import { calculateIndicativePrice, formatAmount } from '../lib/listings';

const CONDITIONS = ['New', 'Used', 'Refurbished', 'For Parts'];

export default function DashboardCreateListing() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [catalogue, setCatalogue] = useState({ categories: [], rateByCategory: {} });
  const [catalogueState, setCatalogueState] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [catalogueError, setCatalogueError] = useState(supabase ? '' : 'Supabase is not configured.');

  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [weight, setWeight] = useState('');
  const [condition, setCondition] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupZone, setPickupZone] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data, error: loadError } = await fetchCatalogue(supabase);
      if (!active) return;
      if (loadError) {
        setCatalogueState('error');
        setCatalogueError(loadError);
        return;
      }
      setCatalogue(data);
      setCatalogueState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const selectedCategory = useMemo(
    () => catalogue.categories.find((c) => c.id === categoryId) || null,
    [catalogue.categories, categoryId],
  );

  const activeRate = categoryId ? catalogue.rateByCategory[categoryId] : undefined;
  const indicativePrice = calculateIndicativePrice(weight, activeRate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!categoryId || !condition || !pickupAddress.trim()) {
      setError('Please choose a material category and condition, and enter the pickup address.');
      return;
    }
    if (!(Number.parseFloat(weight) > 0)) {
      setError('Enter the estimated weight in kilograms.');
      return;
    }
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await getSessionUser(supabase);
      if (!user) {
        setError('Please sign in again to create a listing.');
        return;
      }

      const { data, error: createError } = await createListing(supabase, {
        userId: user.id,
        categoryId,
        subcategoryId,
        approximateWeight: weight,
        condition,
        address: pickupAddress.trim(),
        pickupZone: pickupZone.trim(),
        preferredPickupTime: preferredTime ? new Date(preferredTime).toISOString() : null,
        photo,
      });

      if (createError) {
        setError(createError);
        return;
      }
      if (data.warning) setNotice(data.warning);
      navigate(`/listing/${data.id}`, { replace: true });
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-page" aria-label="Create scrap listing page">
      <header className="dashboard-header">
        <DashboardNav role={'consumer'} />
        <h1>Create scrap listing</h1>
        <p>Tell collectors what you have and where it can be collected.</p>
      </header>

      <main className="dashboard-main">
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}

        {catalogueState === 'loading' && <p>Loading the material catalogue…</p>}

        {catalogueState === 'error' && (
          <p className="form-error" role="alert">
            {catalogueError} You cannot create a listing until the catalogue is available.
          </p>
        )}

        {catalogueState === 'ready' && catalogue.categories.length === 0 && (
          <p className="empty-state">
            No material categories have been configured yet. Please contact an administrator.
          </p>
        )}

        {catalogueState === 'ready' && catalogue.categories.length > 0 && (
          <form onSubmit={handleSubmit} className="listing-form">
            <div className="form-group">
              <label htmlFor="category">Material category</label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId('');
                }}
                disabled={submitting}
                required
              >
                <option value="">Select a category</option>
                {catalogue.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="subcategory">Subcategory (optional)</label>
              <select
                id="subcategory"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                disabled={submitting || !selectedCategory || selectedCategory.subcategories.length === 0}
              >
                <option value="">Select subcategory</option>
                {(selectedCategory?.subcategories || []).map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="weight">Estimated weight (kg)</label>
              <input
                id="weight"
                type="number"
                min="0.1"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="condition">Condition</label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                required
              >
                <option value="">Select condition</option>
                {CONDITIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="address">Pickup address</label>
              <input
                id="address"
                type="text"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                required
              />
              <p className="hint">
                Shared only with the collector who accepts your pickup.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="zone">Pickup zone or area (optional)</label>
              <input
                id="zone"
                type="text"
                value={pickupZone}
                onChange={(e) => setPickupZone(e.target.value)}
                placeholder="e.g. Pune West"
              />
              <p className="hint">Shown to collectors while your listing is on the marketplace.</p>
            </div>

            <div className="form-group">
              <label htmlFor="preferred-time">Preferred pickup date and time (optional)</label>
              <input
                id="preferred-time"
                type="datetime-local"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
              />
            </div>

            <div className="price-panel" aria-live="polite">
              <strong>Indicative price</strong>
              {indicativePrice === null ? (
                <p>
                  {activeRate === undefined
                    ? 'No active rate is configured for this category.'
                    : 'Enter an estimated weight to see the indicative price.'}
                </p>
              ) : (
                <p>
                  {formatAmount(indicativePrice)} for {Number.parseFloat(weight)} kg at{' '}
                  {formatAmount(activeRate)}/kg
                </p>
              )}
              <p className="hint">
                Indicative only. The final value is agreed after weighing and inspection by the
                collector and is not a guaranteed payment.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="photo">Scrap photo (optional)</label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files ? e.target.files[0] : null)}
              />
              <p className="hint">JPG, PNG or WebP, up to 5MB.</p>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create listing'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/dashboard/consumer')}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
