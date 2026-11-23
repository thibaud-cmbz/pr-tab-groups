// @ts-check
/**
 * Tab group planning and identification of managed tabs. Pure module.
 */

/** @typedef {'mine' | 'review'} GroupKind */

/**
 * Key of the `sessions` tab value that marks tabs created by the extension.
 * Session values survive session restore, unlike tab and group IDs.
 */
export const MANAGED_TAB_KEY = 'managedGroup';

/**
 * @typedef {object} GroupDefinition
 * @property {GroupKind} kind
 * @property {string} titleKey i18n message taking the tab count as placeholder.
 * @property {browser.tabGroups.Color} color
 */

/** @type {ReadonlyArray<GroupDefinition>} Groups in display order. */
export const GROUP_DEFINITIONS = Object.freeze([
  { kind: 'mine', titleKey: 'groupMine', color: 'blue' },
  { kind: 'review', titleKey: 'groupReview', color: 'orange' },
]);

/**
 * @typedef {GroupDefinition & { tabs: import('./mapping.js').PullRequestTab[] }} GroupPlan
 */

/**
 * Builds the groups to create, skipping empty ones.
 *
 * @param {Record<GroupKind, import('./mapping.js').PullRequestTab[]>} tabsByKind
 * @returns {GroupPlan[]}
 */
export function planGroups(tabsByKind) {
  return GROUP_DEFINITIONS.filter(({ kind }) => tabsByKind[kind]?.length > 0).map((definition) => ({
    ...definition,
    tabs: tabsByKind[definition.kind],
  }));
}

/**
 * @param {unknown} value
 * @returns {value is GroupKind}
 */
export function isGroupKind(value) {
  return GROUP_DEFINITIONS.some(({ kind }) => kind === value);
}

/**
 * Identifies a pull request regardless of the sub-page (files, commits...).
 *
 * @param {string} value
 * @returns {string | null} "owner/repo#number" in lower case, or null for other pages.
 */
export function pullRequestKey(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com') return null;
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(url.pathname);
    return match ? `${match[1]}/${match[2]}#${match[3]}`.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} TabCandidate
 * @property {number} tabId
 * @property {string | undefined} url
 * @property {unknown} marker Value of the {@link MANAGED_TAB_KEY} session value.
 */

/**
 * @typedef {object} GroupSync
 * @property {GroupKind} kind
 * @property {string} titleKey
 * @property {browser.tabGroups.Color} color
 * @property {Array<{ pr: import('./mapping.js').PullRequestTab, tabId?: number }>} tabs
 *   Tabs in display order; `tabId` is set when an existing tab is reused.
 */

/**
 * @typedef {object} Reconciliation
 * @property {GroupSync[]} groups
 * @property {number[]} closeTabIds Managed tabs whose pull request is no longer listed.
 */

/**
 * Decides which managed tabs to reuse, which to close and which to create.
 *
 * - Only tabs carrying a managed marker are considered: tabs the user opened
 *   or moved into a group are never touched.
 * - A managed tab still showing a listed pull request is reused, so an open
 *   page is not reloaded; duplicates are closed.
 * - A managed tab showing a pull request that is no longer listed is closed.
 * - A managed tab the user navigated away from GitHub pull requests is left alone.
 *
 * @param {ReadonlyArray<TabCandidate>} candidates
 * @param {ReadonlyArray<GroupPlan>} plans
 * @returns {Reconciliation}
 */
export function reconcileGroups(candidates, plans) {
  const wanted = new Set(plans.flatMap((plan) => plan.tabs.map((pr) => pullRequestKey(pr.url))));
  /** @type {Map<string, number>} */
  const reused = new Map();
  /** @type {number[]} */
  const closeTabIds = [];

  for (const { tabId, url, marker } of candidates) {
    if (!isGroupKind(marker)) continue;
    const key = url ? pullRequestKey(url) : null;
    if (key === null) continue;
    if (wanted.has(key) && !reused.has(key)) reused.set(key, tabId);
    else closeTabIds.push(tabId);
  }

  const groups = plans.map(({ kind, titleKey, color, tabs }) => ({
    kind,
    titleKey,
    color,
    tabs: tabs.map((pr) => {
      const tabId = reused.get(/** @type {string} */ (pullRequestKey(pr.url)));
      return tabId === undefined ? { pr } : { pr, tabId };
    }),
  }));

  return { groups, closeTabIds };
}

/**
 * Normalizes a URL for "is this page already open?" comparisons:
 * ignores the fragment and a trailing slash.
 *
 * @param {string} value
 * @returns {string | null}
 */
export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * @param {ReadonlyArray<{ url?: string }>} tabs
 * @param {string} url
 * @returns {boolean}
 */
export function isUrlOpen(tabs, url) {
  const target = normalizeUrl(url);
  return target !== null && tabs.some((tab) => tab.url && normalizeUrl(tab.url) === target);
}
