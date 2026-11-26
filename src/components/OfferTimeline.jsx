import { formatDateTime } from '../lib/listings';
import { offerStatusLabel } from '../lib/lots';

export default function OfferTimeline({ events = [] }) {
  if (!events.length) {
    return <p className="empty-state">No status history recorded yet.</p>;
  }

  return (
    <ol className="status-timeline">
      {events.map((event) => (
        <li key={event.id} className="status-timeline-item">
          <strong>{offerStatusLabel(event.to_status)}</strong>
          <span className="listing-sub">{formatDateTime(event.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}
