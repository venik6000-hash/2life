/**
 * Module-level relay: LoginScreen sets the password right before login;
 * MessengerContext consumes it once on mount (first login after page load).
 * On page refresh, consumePendingPassword() returns null and the Messenger
 * shows an "unlock" prompt asking the user for their password.
 */
let _pendingPassword = null;

export const setPendingPassword = (pw) => { _pendingPassword = pw; };
export const clearPendingPassword = () => { _pendingPassword = null; };

export const consumePendingPassword = () => {
  const p = _pendingPassword;
  _pendingPassword = null;
  return p;
};
