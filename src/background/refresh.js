// @ts-check
/**
 * Refresh orchestration: the only module combining settings, GitHub and the
 * tab APIs. Dependencies are injected so it can run against a mock browser.
 */
import { MissingTokenError } from '../lib/errors.js';
import { isUrlOpen, MANAGED_TAB_KEY, planGroups, reconcileGroups } from '../lib/groups.js';
import { toPullRequestTabs } from '../lib/mapping.js';
import { buildSearchQueries } from '../lib/queries.js';
import { normalizeSettings, SETTINGS_KEY } from '../lib/settings.js';

/**
 * @typedef {object} RefreshDeps
 * @property {typeof browser} browser
 * @property {(token: string) => import('../lib/github.js').GitHubClient} createClient
 */

/**
 * @typedef {object} RefreshResult
 * @property {number} mine Number of authored pull requests.
 * @property {number} review Number of pull requests awaiting review.
 */

/**
 * @param {typeof browser} api
 * @returns {Promise<import('../lib/settings.js').Settings>}
 */
export async function loadSettings(api) {
  const stored = await api.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

/**
 * Opens the fixed page unless a tab already shows it.
 *
 * @param {typeof browser} api
 * @param {import('../lib/settings.js').Settings} settings
 * @param {number | undefined} windowId
 */
async function ensureFixedPage(api, { pinnedUrl, pinTab }, windowId) {
  if (!pinnedUrl) return;
  const tabs = await api.tabs.query({});
  if (isUrlOpen(tabs, pinnedUrl)) return;
  await api.tabs.create({ url: pinnedUrl, pinned: pinTab, active: false, windowId });
}

/**
 * Reads the managed marker of every open tab.
 *
 * @param {typeof browser} api
 * @returns {Promise<import('../lib/groups.js').TabCandidate[]>}
 */
async function readCandidates(api) {
  const tabs = await api.tabs.query({});
  return Promise.all(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map(async (tab) => {
        const tabId = /** @type {number} */ (tab.id);
        // A tab closed meanwhile rejects: treat it as unmanaged.
        const marker = await api.sessions.getTabValue(tabId, MANAGED_TAB_KEY).catch(() => {});
        return { tabId, url: tab.url, marker };
      }),
  );
}

/**
 * Creates the missing tabs of a group and (re)groups all of them.
 * Grouping moves reused tabs out of their previous group, which Firefox
 * deletes once empty.
 *
 * @param {typeof browser} api
 * @param {import('../lib/groups.js').GroupSync} group
 * @param {number | undefined} windowId
 */
async function syncGroup(api, { kind, titleKey, color, tabs }, windowId) {
  /** @type {number[]} */
  const tabIds = [];
  for (const { pr, tabId } of tabs) {
    if (tabId !== undefined) {
      tabIds.push(tabId);
      continue;
    }
    // Discarded tabs are not loaded until activated; they cannot be active.
    const created = await api.tabs.create({
      url: pr.url,
      title: pr.title,
      discarded: true,
      active: false,
      windowId,
    });
    tabIds.push(/** @type {number} */ (created.id));
  }

  // Reused tabs may come from the other group: always (re)write the marker.
  await Promise.all(tabIds.map((id) => api.sessions.setTabValue(id, MANAGED_TAB_KEY, kind)));

  const groupId = await api.tabs.group({
    tabIds,
    createProperties: windowId === undefined ? undefined : { windowId },
  });
  await api.tabGroups.update(groupId, {
    title: api.i18n.getMessage(titleKey, [String(tabs.length)]),
    color,
    collapsed: true,
  });
}

/**
 * Opens the fixed page, fetches pull requests and synchronizes the managed groups.
 * GitHub is queried before any tab is touched, so a failure leaves tabs as they were.
 *
 * @param {RefreshDeps} deps
 * @returns {Promise<RefreshResult>}
 * @throws {MissingTokenError | import('../lib/errors.js').GitHubError}
 */
export async function refresh({ browser: api, createClient }) {
  const settings = await loadSettings(api);
  const window = await api.windows.getLastFocused({ windowTypes: ['normal'] });

  await ensureFixedPage(api, settings, window.id);

  if (!settings.token) throw new MissingTokenError();
  const client = createClient(settings.token);
  const login = await client.getLogin();
  const queries = buildSearchQueries(settings, login);
  const [mine, review] = await Promise.all([
    client.searchIssues(queries.mine),
    client.searchIssues(queries.review),
  ]);

  const plans = planGroups({ mine: toPullRequestTabs(mine), review: toPullRequestTabs(review) });
  const { groups, closeTabIds } = reconcileGroups(await readCandidates(api), plans);

  for (const group of groups) await syncGroup(api, group, window.id);
  // Close last, so a window never loses its last tab in the middle of a refresh.
  if (closeTabIds.length > 0) await api.tabs.remove(closeTabIds);

  const count = (/** @type {string} */ kind) =>
    groups.find((g) => g.kind === kind)?.tabs.length ?? 0;
  return { mine: count('mine'), review: count('review') };
}
