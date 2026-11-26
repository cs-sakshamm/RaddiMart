import { NavLink, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';

const ROLE_LINKS = {
  consumer: [
    { to: '/dashboard/consumer', label: 'Dashboard' },
    { to: '/dashboard/create-listing', label: 'New listing' },
  ],
  collector: [
    { to: '/dashboard/collector', label: 'Dashboard' },
    { to: '/collector/marketplace', label: 'Marketplace' },
    { to: '/collector/pickups', label: 'Pickups' },
  ],
  aggregator: [
    { to: '/dashboard/aggregator', label: 'Dashboard' },
    { to: '/aggregator/inventory', label: 'Inventory' },
    { to: '/aggregator/offers', label: 'Offers' },
  ],
  recycler: [
    { to: '/dashboard/recycler', label: 'Dashboard' },
    { to: '/recycler/offers', label: 'Offers' },
    { to: '/recycler/facility', label: 'Facility' },
  ],
};

const ROLE_LABELS = {
  consumer: 'Consumer',
  collector: 'Local collector',
  aggregator: 'Aggregator',
  recycler: 'Recycler',
};

// One shared top bar for every signed-in screen. Role checks here only shape
// the links; the database RLS policies remain the security boundary.
export function DashboardNav({ role }) {
  const navigate = useNavigate();
  const links = ROLE_LINKS[role] || [];

  return (
    <div className="dashboard-topbar">
      <div className="dashboard-brand">
        <BrandMark className="dashboard-logo" alt="RADDIMART" />
        {role && <span className="dashboard-role">{ROLE_LABELS[role] || role}</span>}
      </div>
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `dashboard-nav-link${isActive ? ' is-active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
        <NavLink
          to="/profile"
          className={({ isActive }) => `dashboard-nav-link${isActive ? ' is-active' : ''}`}
        >
          Profile
        </NavLink>
        <button
          type="button"
          className="dashboard-nav-link dashboard-nav-signout"
          onClick={() => navigate('/signout')}
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}

export default DashboardNav;
