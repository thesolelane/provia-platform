// client/src/utils/toast.js
// Fire a custom DOM event — any component with a listener will show the toast.
// Usage: import { showToast } from '../utils/toast'; showToast('Saved!', 'success');

export function showToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('pb-toast', { detail: { message, type } }));
}
