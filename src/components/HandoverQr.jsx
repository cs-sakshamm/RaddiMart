import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// The QR encodes the public verification URL. The token is an opaque UUID; the
// public RPC returns no addresses, contacts, rates or payment information.
export default function HandoverQr({ token, caption = 'Scan to open the handover record' }) {
  const [src, setSrc] = useState('');
  const path = token ? `/verify/${token}` : '';

  useEffect(() => {
    let active = true;
    if (!path) return undefined;
    const url = `${window.location.origin}${path}`;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#0b5944', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setSrc(dataUrl);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!token) return null;

  return (
    <div className="handover-qr">
      {src ? (
        <img src={src} alt="QR code for this handover verification page" width="220" height="220" />
      ) : (
        <div className="handover-qr-placeholder" aria-hidden="true" />
      )}
      <p className="hint">{caption}</p>
      <a className="btn btn-secondary btn-small" href={path}>
        Open verification page
      </a>
    </div>
  );
}
