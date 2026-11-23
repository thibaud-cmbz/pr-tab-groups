// @ts-check
/**
 * User settings: defaults, normalization and validation. Pure module.
 */

/**
 * @typedef {object} Settings
 * @property {string} token GitHub personal access token.
 * @property {string} org GitHub organization used to filter pull requests ("" = no filter).
 * @property {string} pinnedUrl Page opened at startup if not already open ("" = disabled).
 * @property {boolean} pinTab Whether the fixed page is opened as a pinned tab.
 * @property {boolean} reviewOrgOnly Whether review requests are limited to `org`.
 * @property {number} startupDelaySeconds Delay before the startup refresh.
 * @property {number} refreshIntervalMinutes Periodic refresh interval (0 = disabled).
 */

/** Key under which settings are stored in `storage.local`. */
export const SETTINGS_KEY = 'settings';

export const MAX_STARTUP_DELAY_SECONDS = 30;
export const MIN_REFRESH_INTERVAL_MINUTES = 5;
export const MAX_REFRESH_INTERVAL_MINUTES = 24 * 60;

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  token: '',
  org: 'decider',
  pinnedUrl: '',
  pinTab: true,
  reviewOrgOnly: true,
  startupDelaySeconds: 5,
  refreshIntervalMinutes: 0,
});

// GitHub logins: alphanumeric or single hyphens, no leading/trailing hyphen, max 39 chars.
const GITHUB_LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidGitHubLogin(value) {
  return GITHUB_LOGIN_RE.test(value);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function toBoundedInt(value, fallback, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function toTrimmedString(value, fallback) {
  return typeof value === 'string' ? value.trim() : fallback;
}

/**
 * Merges stored values with defaults and coerces every field to a valid value.
 * Unknown keys are dropped.
 *
 * @param {unknown} raw Value read from storage (may be undefined or partial).
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  /** @type {Record<string, unknown>} */
  const input = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const d = DEFAULT_SETTINGS;

  const interval = toBoundedInt(
    input.refreshIntervalMinutes,
    d.refreshIntervalMinutes,
    0,
    MAX_REFRESH_INTERVAL_MINUTES,
  );

  return {
    token: toTrimmedString(input.token, d.token),
    org: toTrimmedString(input.org, d.org),
    pinnedUrl: toTrimmedString(input.pinnedUrl, d.pinnedUrl),
    pinTab: typeof input.pinTab === 'boolean' ? input.pinTab : d.pinTab,
    reviewOrgOnly: typeof input.reviewOrgOnly === 'boolean' ? input.reviewOrgOnly : d.reviewOrgOnly,
    startupDelaySeconds: toBoundedInt(
      input.startupDelaySeconds,
      d.startupDelaySeconds,
      0,
      MAX_STARTUP_DELAY_SECONDS,
    ),
    // 0 disables the periodic refresh; any other value is raised to the minimum.
    refreshIntervalMinutes: interval === 0 ? 0 : Math.max(MIN_REFRESH_INTERVAL_MINUTES, interval),
  };
}

/**
 * Returns the i18n keys of validation errors, empty when settings are valid.
 * The token is not validated here: GitHub is the only reliable judge.
 *
 * @param {Settings} settings
 * @returns {string[]}
 */
export function validateSettings(settings) {
  /** @type {string[]} */
  const errors = [];
  if (settings.org !== '' && !isValidGitHubLogin(settings.org)) {
    errors.push('optionsErrorOrg');
  }
  if (settings.pinnedUrl !== '' && !isValidHttpUrl(settings.pinnedUrl)) {
    errors.push('optionsErrorPinnedUrl');
  }
  return errors;
}
