// @ts-check
/**
 * Options page. Every text comes from `browser.i18n` and is inserted with
 * `textContent`; the saved token is never written back into the page.
 */
import { normalizeSettings, SETTINGS_KEY, validateSettings } from '../lib/settings.js';

const { i18n, runtime, storage } = browser;

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
function element(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return /** @type {T} */ (el);
}

const form = /** @type {HTMLFormElement} */ (element('options-form'));
const tokenInput = /** @type {HTMLInputElement} */ (element('token'));
const orgInput = /** @type {HTMLInputElement} */ (element('org'));
const reviewOrgOnlyInput = /** @type {HTMLInputElement} */ (element('reviewOrgOnly'));
const pinnedUrlInput = /** @type {HTMLInputElement} */ (element('pinnedUrl'));
const pinTabInput = /** @type {HTMLInputElement} */ (element('pinTab'));
const startupDelayInput = /** @type {HTMLInputElement} */ (element('startupDelaySeconds'));
const refreshIntervalInput = /** @type {HTMLInputElement} */ (element('refreshIntervalMinutes'));
const forgetTokenButton = /** @type {HTMLButtonElement} */ (element('forget-token'));
const saveAndRunButton = /** @type {HTMLButtonElement} */ (element('save-and-run'));
const errorsList = /** @type {HTMLUListElement} */ (element('errors'));
const statusText = /** @type {HTMLParagraphElement} */ (element('status'));

/** Token currently stored; kept in memory only to preserve it when the field is left empty. */
let storedToken = '';

function localize() {
  document.documentElement.lang = i18n.getUILanguage();
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const text = i18n.getMessage(/** @type {HTMLElement} */ (el).dataset.i18n ?? '');
    if (text) el.textContent = text;
  }
}

function updateTokenField() {
  tokenInput.value = '';
  tokenInput.placeholder = i18n.getMessage(
    storedToken ? 'optionsTokenSaved' : 'optionsTokenPlaceholder',
  );
  forgetTokenButton.disabled = !storedToken;
}

/**
 * @param {string} message
 * @param {'ok' | 'error' | ''} [kind]
 */
function setStatus(message, kind = '') {
  statusText.textContent = message;
  statusText.className = `status ${kind}`.trim();
}

/** @param {string[]} keys i18n keys of validation errors. */
function showErrors(keys) {
  errorsList.replaceChildren(
    ...keys.map((key) => {
      const item = document.createElement('li');
      item.textContent = i18n.getMessage(key);
      return item;
    }),
  );
}

async function load() {
  const stored = await storage.local.get(SETTINGS_KEY);
  const settings = normalizeSettings(stored[SETTINGS_KEY]);
  storedToken = settings.token;
  orgInput.value = settings.org;
  reviewOrgOnlyInput.checked = settings.reviewOrgOnly;
  pinnedUrlInput.value = settings.pinnedUrl;
  pinTabInput.checked = settings.pinTab;
  startupDelayInput.value = String(settings.startupDelaySeconds);
  refreshIntervalInput.value = String(settings.refreshIntervalMinutes);
  updateTokenField();
}

/**
 * Validates and stores the form.
 * @returns {Promise<import('../lib/settings.js').Settings | null>} Saved settings, or null if invalid.
 */
async function save() {
  const settings = normalizeSettings({
    token: tokenInput.value.trim() || storedToken,
    org: orgInput.value,
    reviewOrgOnly: reviewOrgOnlyInput.checked,
    pinnedUrl: pinnedUrlInput.value,
    pinTab: pinTabInput.checked,
    startupDelaySeconds: startupDelayInput.value,
    refreshIntervalMinutes: refreshIntervalInput.value,
  });

  const errors = validateSettings(settings);
  showErrors(errors);
  if (errors.length > 0) {
    setStatus('');
    return null;
  }

  await storage.local.set({ [SETTINGS_KEY]: settings });
  storedToken = settings.token;
  updateTokenField();
  // Show the values as normalized (clamped) before saving.
  startupDelayInput.value = String(settings.startupDelaySeconds);
  refreshIntervalInput.value = String(settings.refreshIntervalMinutes);
  setStatus(i18n.getMessage('optionsSaved'), 'ok');
  return settings;
}

async function saveAndRun() {
  const settings = await save();
  if (!settings) return;
  if (!settings.token) {
    setStatus(i18n.getMessage('errorNoToken'), 'error');
    tokenInput.focus();
    return;
  }

  saveAndRunButton.disabled = true;
  setStatus(i18n.getMessage('optionsRunning'));
  try {
    /** @type {{ ok: boolean, message?: string }} */
    const result = await runtime.sendMessage({ type: 'refresh' });
    if (result.ok) setStatus(i18n.getMessage('optionsDone'), 'ok');
    else setStatus(result.message ?? i18n.getMessage('errorUnexpected'), 'error');
  } finally {
    saveAndRunButton.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void save();
});
saveAndRunButton.addEventListener('click', () => void saveAndRun());
forgetTokenButton.addEventListener('click', () => {
  storedToken = '';
  tokenInput.value = '';
  void save();
});

localize();
void load();
