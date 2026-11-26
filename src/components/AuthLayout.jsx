import { BrandMark } from './BrandMark';
import { Link } from 'react-router-dom';

// The shared frame for every signed-out screen: the approved RADDIMART logo,
// one photographic panel that shows the actual material chain, and the form.
export default function AuthLayout({ title, subtitle, children, image = '/images/materials/collection.jpg', imageAlt }) {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-label="About RADDIMART">
          <BrandMark className="auth-aside-logo" alt="RADDIMART" />
          <div className="auth-aside-copy">
            <h2>Every scrap handover, on the record.</h2>
            <p>
              RADDIMART connects households, local collectors, aggregators and recyclers in one
              traceable chain, from the first listing to the confirmed handover.
            </p>
          </div>
          <img
            className="auth-aside-image"
            src={image}
            alt={
              imageAlt ||
              'A collector sorting cardboard, cables and recyclable material at a neighbourhood collection point'
            }
            width="1392"
            height="752"
            decoding="async"
          />
        </aside>

        <div className="auth-panel">
          <div className="auth-container">
            <BrandMark className="auth-logo auth-logo-compact" alt="RADDIMART" />
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            {children}
            <Link to="/" className="auth-back">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
