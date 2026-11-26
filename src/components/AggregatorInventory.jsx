import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardNav from './DashboardNav';
import { getSupabaseClient } from '../lib/supabase';
import { fetchCatalogue, fetchOwnProfile } from '../lib/listingsApi';
import { formatWeight, paginate } from '../lib/listings';
import { filterLots, formatLotCode, isLotIntake, saleableWeight } from '../lib/lots';
import { claimLot, fetchAggregatorLots } from '../lib/lotsApi';
import { materialImage } from '../lib/materials';

const PAGE_SIZE = 9;

export default function AggregatorInventory() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState(null);
  const [lots, setLots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ scope: 'all', categoryId: '', search: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState(supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase is not configured.');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const lotsResult = await fetchAggregatorLots(supabase);
    if (lotsResult.error) {
      setState('error');
      setError(lotsResult.error);
      return;
    }
    setLots(lotsResult.data);
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
      if (profileResult.data.profile.active_role !== 'aggregator') {
        setState('ready');
        return;
      }
      const catalogueResult = await fetchCatalogue(supabase);
      if (active && !catalogueResult.error) setCategories(catalogueResult.data.categories);
      await load();
    })();
    return () => {
      active = false;
    };
  }, [supabase, load]);

  const filtered = useMemo(() => filterLots(lots, filters), [lots, filters]);
  const paged = paginate(filtered, page, PAGE_SIZE);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

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
        <p>Loading inventory…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role="aggregator" />
          <h1>Inventory</h1>
        </header>
        <main className="dashboard-main">
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard/aggregator')}>
            Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  if (profile && profile.active_role !== 'aggregator') {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <DashboardNav role={profile.active_role} />
          <h1>Inventory</h1>
        </header>
        <main className="dashboard-main">
          <section className="dashboard-section">
            <h2>Aggregator access required</h2>
            <p>Material inventory is available to approved aggregators only.</p>
            <button className="btn btn-primary" onClick={() => navigate('/role-request')}>
              Request aggregator access
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page" aria-label="Aggregator inventory">
      <header className="dashboard-header">
        <DashboardNav role="aggregator" />
        <h1>Inventory</h1>
        <p>Receive collected lots into your inventory and prepare offers for recyclers.</p>
      </header>

      <main className="dashboard-main">
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <section className="dashboard-section" aria-labelledby="lot-filters">
          <h2 id="lot-filters">Filter lots</h2>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="lot-scope">Inventory view</label>
              <select
                id="lot-scope"
                value={filters.scope}
                onChange={(event) => updateFilter('scope', event.target.value)}
              >
                <option value="all">All lots</option>
                <option value="intake">Awaiting intake</option>
                <option value="mine">My inventory</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="lot-category">Category</label>
              <select
                id="lot-category"
                value={filters.categoryId}
                onChange={(event) => updateFilter('categoryId', event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="lot-search">Search</label>
              <input
                id="lot-search"
                type="search"
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Lot code, zone or condition"
              />
            </div>
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="lot-results">
          <h2 id="lot-results">Lots</h2>
          <p className="hint">
            {filtered.length} lot{filtered.length === 1 ? '' : 's'} match this view
          </p>

          {paged.items.length === 0 ? (
            <p className="empty-state">
              No lots match these filters. Clear the filters or wait for a new collection.
            </p>
          ) : (
            <ul className="listing-list">
              {paged.items.map((lot) => {
                const intake = isLotIntake(lot);
                const image = materialImage(lot.category?.name);
                return (
                  <li key={lot.id} className="listing-card">
                    <img
                      className="listing-thumb"
                      src={image.src}
                      alt={image.alt}
                      width="88"
                      height="88"
                      loading="lazy"
                    />
                    <div className="listing-info">
                      <span className="lot-code">{formatLotCode(lot.lot_code)}</span>
                      <strong>{lot.category?.name || 'Uncategorised'}</strong>
                      <span className="listing-sub">{lot.subcategory?.name || 'No subcategory'}</span>
                      <span className="listing-sub">
                        {formatWeight(saleableWeight(lot))}, {lot.condition || 'condition not set'}
                      </span>
                      <span className="listing-sub">Zone: {lot.pickup_zone || 'not specified'}</span>
                    </div>
                    <span
                      className={`status-pill ${intake ? 'status-pickup_requested' : 'status-in_aggregator_inventory'}`}
                    >
                      {intake ? 'Awaiting intake' : 'In inventory'}
                    </span>
                    <div className="listing-actions">
                      {intake ? (
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => handleClaim(lot.id)}
                          disabled={busyId === lot.id}
                        >
                          {busyId === lot.id ? 'Receiving…' : 'Receive lot'}
                        </button>
                      ) : null}
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => navigate(`/aggregator/inventory/${lot.id}`)}
                      >
                        Open lot
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {paged.totalPages > 1 && (
            <nav className="pagination" aria-label="Inventory pagination">
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={paged.page <= 1}
              >
                Previous
              </button>
              <span>Page {paged.page} of {paged.totalPages}</span>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setPage((current) => Math.min(paged.totalPages, current + 1))}
                disabled={paged.page >= paged.totalPages}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}
