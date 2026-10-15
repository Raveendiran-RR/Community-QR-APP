/**
 * Community QR Check-in App — Config Module
 * All user-configurable settings, persisted to localStorage.
 * NEVER store sensitive secrets here in production — use Vercel env vars.
 */

const DEFAULT_CONFIG = {
  // Google Sheets & Apps Script
  sheetId: "",
  sheetTab: "Registrations",
  scriptUrl: "",

  // Column mapping (0-indexed) in Registrations sheet
  cols: {
    name: 0,
    email: 1,
    phone: 2,
    uuid: 3,
    status: 4,
    time: 5,
  },

  // Auth
  adminPin: "9999",          // Admin PIN (4-digit numpad)

  // UI / Branding
  eventName: "Community Meetup Check-in",
  logoDataUrl: null,
  logoOpacity: 8,            // 0–100 (percent)
  logoSize: 280,             // px
  logoPosition: "center",    // "center" | "top-left" | "top-right"
  accentColor: "#00C896",

  // Inactivity timeout
  inactivityMs: 120000,      // 2 minutes
  inactivityWarnMs: 30000,   // show warning 30s before logout
};

const Config = (() => {
  const STORAGE_KEY = "mqr_config";

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Object.assign({}, DEFAULT_CONFIG, saved);
    } catch {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function save(partial) {
    const current = load();
    const updated = Object.assign(current, partial);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Config save failed:", e);
    }
    return updated;
  }

  function get(key) {
    return load()[key];
  }

  function getAll() {
    return load();
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { load, save, get, getAll, reset };
})();
