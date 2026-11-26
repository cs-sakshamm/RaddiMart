import DashboardNav from './DashboardNav';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import { fetchCatalogue, fetchMarketplaceListings, fetchOwnProfile, listingPhotoUrl } from '../lib/listingsApi';
import {
  calculateIndicativePrice,
  formatAmount,
  formatDate,
  formatDateTime,
  formatWeight,
  STATUS_LABELS,
} from '../lib/listings';
import { materialImage } from '../lib/materials';

const PAGE_SIZE = 9;

export default function CollectorMarketplace() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [catalogue, setCatalogue] = useState({ categories: [], rateByCategory: {} });
  const [filters, setFilters] = useState({ categoryId: '', subcategoryId: '', zone: '', status: '', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ listings: [], total: 0 });
  const [photoUrls, setPhotoUrls] = useState({});
  const [state, setState] = useState(supabase ? 'loading' : 'error'); // loading | ready | error
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');

  useEffect(() => {
    if (!supabase) return;
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
      const catalogueResult = await fetchCatalogue(supabase);
      if (!active) return;
      if (!catalogueResult.error) setCatalogue(catalogueResult.data);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Debounce free-text search so every keystroke is not a query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data, error: loadError } = await fetchMarketplaceListings(supabase, filters, {
        page,
        pageSize: PAGE_SIZE,
      });
      if (!active) return;
      if (loadError) {
        setState('error');
        setError(loadError);
        return;
      }
      setResult(data);
      setState('ready');
    })();
    return () => {
      active = false;
    };
  }, [supabase, filters, page]);

  useEffect(() => {
    if (!supabase) return undefined;
    const paths = [...new Set(result.listings.map((listing) => listing.photo_path).filter(Boolean))];
    if (paths.length === 0) {
      return undefined;
    }
    let active = true;
    Promise.all(
      paths.map(async (path) => [path, await listingPhotoUrl(supabase, path)]),
    ).then((entries) => {
      if (active) setPhotoUrls(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [supabase, result.listings]);

  const selectedCategory = useMemo(
    () => catalogue.categories.find((c) => c.id === filters.categoryId) || null,
    [catalogue.categories, filters.categoryId],
  );

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const updateFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'categoryId' ? { subcategoryId: '' } : {}),
    }));
    setPage(1);
  };

  if (profile && profile.active_role !== 'collector') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={'collector'} />
          <h1>Collector marketplace</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Collector access required</h2>
            <p>The marketplace is available to approved local collectors only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request collector access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Collector marketplace">
      <header className="dashboard-header">
        <DashboardNav role={'collector'} />
        <h1>Available scrap listings</h1>
        <p>Browse open consumer listings and accept the pickups you can cover.</p>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-section" aria-labelledby="filters-heading">
          <h2 id="filters-heading">Filter listings</h2>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="filter-category">Category</label>
              <select
                id="filter-category"
                value={filters.categoryId}
                onChange={(e) => updateFilter('categoryId', e.target.value)}
              >
                <option value="">All categories</option>
                {catalogue.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="filter-subcategory">Subcategory</label>
              <select
                id="filter-subcategory"
                value={filters.subcategoryId}
                onChange={(e) => updateFilter('subcategoryId', e.target.value)}
                disabled={!selectedCategory || selectedCategory.subcategories.length === 0}
              >
                <option value="">All subcategories</option>
                {(selectedCategory?.subcategories || []).map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="filter-zone">Pickup zone</label>
              <input
                id="filter-zone"
                type="text"
                value={filters.zone}
                onChange={(e) => updateFilter('zone', e.target.value)}
                placeholder="e.g. Pune West"
              />
            </div>

            <div className="form-group">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
              >
                <option value="">Any open status</option>
                <option value="LISTED">{STATUS_LABELS.LISTED}</option>
                <option value="PICKUP_REQUESTED">{STATUS_LABELS.PICKUP_REQUESTED}</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="filter-search">Search</label>
              <input
                id="filter-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Condition or zone"
              />
            </div>
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="results-heading">
          <h2 id="results-heading">Listings</h2>

          {state === 'loading' && <p aria-busy="true">Loading listings…</p>}

          {state === 'error' && <p className="form-error" role="alert">{error}</p>}

          {state === 'ready' && result.listings.length === 0 && (
            <p className="empty-state">
              No listings match these filters. Try clearing the filters or check back later.
            </p>
          )}

          {state === 'ready' && result.listings.length > 0 && (
            <>
              <p className="hint">
                {result.total} listing{result.total === 1 ? '' : 's'} available
              </p>
              <ul className="listing-list">
                {result.listings.map((listing) => {
                  const indicative = calculateIndicativePrice(
                    listing.approximate_weight,
                    catalogue.rateByCategory[listing.category_id],
                  );
                  const photoUrl = listing.photo_path ? photoUrls[listing.photo_path] : null;
                  const image = materialImage(listing.category?.name);
                  return (
                    <li key={listing.id} className="listing-card">
                      <img
                        className="listing-thumb"
                        src={photoUrl || image.src}
                        alt={photoUrl ? 'Scrap photo supplied with this listing' : image.alt}
                        width="88"
                        height="88"
                        loading="lazy"
                      />
                      <div className="listing-info">
                        <strong>{listing.category?.name || 'Uncategorised'}</strong>
                        <span className="listing-sub">
                          {listing.subcategory?.name || 'No subcategory'}
                        </span>
                        <span className="listing-sub">
                          {formatWeight(listing.approximate_weight)},{' '}
                          {listing.condition || 'condition not set'}
                        </span>
                        <span className="listing-sub">
                          Zone: {listing.pickup_zone || 'not specified'}
                        </span>
                        <span className="listing-sub">
                          Preferred pickup: {formatDateTime(listing.preferred_pickup_time)}
                        </span>
                        <span className="listing-sub">
                          Listed {formatDate(listing.created_at)}
                        </span>
                        <span className="listing-sub">
                          Indicative {indicative === null ? 'rate unavailable' : formatAmount(indicative)}
                        </span>
                      </div>
                      <span className={`status-pill status-${listing.status.toLowerCase()}`}>
                        {STATUS_LABELS[listing.status] || listing.status}
                      </span>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => navigate(`/listing/${listing.id}`)}
                      >
                        Review listing
                      </button>
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 && (
                <nav className="pagination" aria-label="Marketplace pagination">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/collector')}>
            Back to dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
