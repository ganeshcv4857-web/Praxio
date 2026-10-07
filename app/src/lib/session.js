// Session-expiry signal: the data layer reports invalid/expired JWTs here and the app
// signs the user out cleanly with an explanatory message.
const listeners = new Set();
let notified = false;

export function onSessionExpired(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifySessionExpired() {
  if (notified) return;
  notified = true;
  for (const fn of listeners) fn();
}

/** Reset after a fresh sign-in. */
export function resetSessionExpired() {
  notified = false;
}
