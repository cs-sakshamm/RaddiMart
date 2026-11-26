const LOGO_URL = '/assets/raddimart-logo/raddimart-truck-logo.png';

export function BrandMark({ className = '' }) {
  return (
    <img
      className={className}
      src={LOGO_URL}
      alt="RADDIMART"
      width="1774"
      height="887"
      decoding="async"
    />
  );
}
