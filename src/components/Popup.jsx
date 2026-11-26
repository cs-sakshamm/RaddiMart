import { useState, useEffect, useRef } from 'react';

/* Problem & Solution popup component
   - Opens automatically on a fresh homepage visit/session
   - Does not reopen on internal route navigation or rerender
   - Closes via close button, Escape key or a backdrop click
   - Locks background scrolling while open
   - Uses a native modal dialog so focus is trapped and returned
*/

const POPUP_KEY = 'raddimart-popup-shown';

const popupContent = {
  problem: {
    heading: 'The problem',
    content:
      'The scrap collection and recycling ecosystem is fragmented. Consumers often lack transparent price information and convenient pickup coordination, while local collectors, aggregators and formal recyclers operate through disconnected networks. Material handovers can lack standardized records, making transactions difficult to track and limiting visibility into the recycling journey.',
  },
  solution: {
    heading: 'Our solution',
    content:
      'RADDIMART is a digital marketplace connecting consumers, local Kabadiwalas, large aggregators and formal recyclers. It enables structured scrap listings, indicative price discovery, pickup coordination, material-lot management, recycler offers and QR-verifiable digital handover records through one responsive website.',
  },
  impact: {
    heading: 'Expected impact',
    content:
      'A more connected and transparent recycling chain, improved visibility into material movement, better buyer discovery and stronger digital participation for informal scrap collectors.',
  },
};

function Popup() {
  const previouslyShown = sessionStorage.getItem(POPUP_KEY);
  const [open, setOpen] = useState(previouslyShown !== '1');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }
    document.body.style.overflow = 'hidden';
    sessionStorage.setItem(POPUP_KEY, '1');
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    document.body.style.overflow = '';
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="popup-dialog"
      aria-labelledby="popup-title"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClose={handleClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose();
      }}
    >
      <div className="popup-content">
        <button
          ref={closeRef}
          type="button"
          className="popup-close-btn"
          aria-label="Close problem and solution overview"
          onClick={handleClose}
        >
          Close
        </button>
        <h2 id="popup-title" className="popup-heading">
          WHY RADDIMART EXISTS?
        </h2>
        <div className="popup-sections">
          <section className="popup-section">
            <h3 className="popup-section-heading">{popupContent.problem.heading}</h3>
            <p className="popup-text">{popupContent.problem.content}</p>
          </section>
          <section className="popup-section">
            <h3 className="popup-section-heading">{popupContent.solution.heading}</h3>
            <p className="popup-text">{popupContent.solution.content}</p>
          </section>
          <section className="popup-section">
            <h3 className="popup-section-heading">{popupContent.impact.heading}</h3>
            <p className="popup-text">{popupContent.impact.content}</p>
          </section>
        </div>
      </div>
    </dialog>
  );
}

export default Popup;
