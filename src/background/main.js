// @ts-check
/**
 * Background entry point (event page). Listeners are registered synchronously
 * at top level so Firefox can wake the page for them.
 */
import { describeError, MissingTokenError } from '../lib/errors.js';
import { createGitHubClient } from '../lib/github.js';
import { createBadge } from './badge.js';
import { loadSettings, refresh } from './refresh.js';

const badge = createBadge(browser);

/** @type {Promise<{ ok: boolean, message?: string }> | null} */
let inFlight = null;

/**
 * @param {number} epochMs
 * @returns {string}
 */
function formatTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString(browser.i18n.getUILanguage(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function runRefresh() {
  await badge.loading();
  try {
    await refresh({ browser, createClient: (token) => createGitHubClient({ token }) });
    await badge.success();
    return { ok: true };
  } catch (error) {
    const { key, substitutions } = describeError(error, formatTime);
    const message = browser.i18n.getMessage(key, substitutions);
    await badge.error(message);
    if (error instanceof MissingTokenError) {
      await browser.runtime.openOptionsPage();
    } else {
      // Errors never carry the token: it only lives in request headers.
      console.error('Pull request refresh failed:', error);
    }
    return { ok: false, message };
  }
}

/** Runs a refresh, or joins the one already running. */
function requestRefresh() {
  inFlight ??= runRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

browser.runtime.onStartup.addListener(async () => {
  const { startupDelaySeconds } = await loadSettings(browser);
  setTimeout(requestRefresh, startupDelaySeconds * 1000);
});

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') void browser.runtime.openOptionsPage();
});

browser.action.onClicked.addListener(() => {
  void requestRefresh();
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || message?.type !== 'refresh') return undefined;
  return requestRefresh();
});
