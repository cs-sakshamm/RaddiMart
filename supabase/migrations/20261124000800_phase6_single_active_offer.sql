-- A lot may have many historical offers (withdrawn or declined), but only one
-- offer may occupy its active lifecycle: waiting, accepted, handed over or
-- completed. This closes the gap left by the Phase 5 live-offer index.

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_active_offer_per_lot
  ON transactions(lot_id)
  WHERE status IN (
    'OFFERED_TO_RECYCLER',
    'ACCEPTED_BY_RECYCLER',
    'HANDOVER_CONFIRMED',
    'COMPLETED'
  );

COMMENT ON INDEX idx_transactions_one_active_offer_per_lot IS
  'One active offer per lot; declined and withdrawn offers remain as history.';
