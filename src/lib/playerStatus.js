/** "Done for today" is only meaningful while the player is still out or injured. */
export function showDoneForToday(player) {
  return !!(player?.doneForToday && (player.out || player.injured));
}

function withoutDoneFlag(player) {
  return { ...player, doneForToday: false };
}

/** Drop a back-half return mark. returnQuarter is left for the caller to reset. */
export function withoutReturnAt(player) {
  if (!player?.returnAt && player?.returnHalf == null) return player;
  const next = { ...player };
  delete next.returnAt;
  delete next.returnHalf;
  return next;
}

/** Roster Inj toggle. Clears a stale done-for-today mark because availability changed. */
export function toggleRosterInjured(player) {
  return withoutDoneFlag(withoutReturnAt({ ...player, injured: !player.injured, out: false }));
}

/** Roster Out toggle. Clears a stale done-for-today mark because availability changed. */
export function toggleRosterOut(player) {
  return withoutDoneFlag(withoutReturnAt({ ...player, out: !player.out, injured: false }));
}

/** Mark injured. Extra fields (quarter, mid-game) are applied, then the done flag is cleared. */
export function markInjured(player, extra = {}) {
  return withoutDoneFlag(withoutReturnAt({ ...player, injured: true, out: false, ...extra }));
}

/** Mark out. Extra fields are applied, then the done flag is cleared. */
export function markOut(player, extra = {}) {
  return withoutDoneFlag(withoutReturnAt({ ...player, out: true, injured: false, ...extra }));
}

/**
 * Any status write that changes out or injured drops doneForToday.
 * A write that leaves availability alone keeps the flag.
 */
export function settleAvailability(previous, next) {
  if (!previous || !next) return next;
  const changed = Boolean(previous.out) !== Boolean(next.out)
    || Boolean(previous.injured) !== Boolean(next.injured);
  if (!changed) return next;
  return withoutDoneFlag(withoutReturnAt(next));
}
