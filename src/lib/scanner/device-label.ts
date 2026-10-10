const STORAGE_KEY = "gtp-scanner-device-label";

export function deviceLabel() {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const label = `Web scanner ${crypto.randomUUID().slice(0, 8)}`;
  window.localStorage.setItem(STORAGE_KEY, label);
  return label;
}
