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
 * Returns the IDs of tabs carrying a managed marker. Tabs the user moved
 * into a managed group are not marked, so they are never closed.
 *
 * @param {ReadonlyArray<{ tabId: number, marker: unknown }>} entries
 * @returns {number[]}
 */
export function selectManagedTabIds(entries) {
  return entries.filter(({ marker }) => isGroupKind(marker)).map(({ tabId }) => tabId);
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
