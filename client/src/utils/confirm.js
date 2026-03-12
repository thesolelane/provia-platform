// client/src/utils/confirm.js
// Returns a Promise<boolean> — resolves true if the user clicks Confirm.
// Usage: if (!await showConfirm('Delete this?')) return;

export function showConfirm(message) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('pb-confirm', { detail: { message, resolve } }));
  });
}
