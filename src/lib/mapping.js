// @ts-check
/**
 * Maps GitHub Search API items to the tabs to open. Pure module.
 */

/** Only pull request pages on github.com are ever opened. */
const ALLOWED_ORIGIN = 'https://github.com';

/**
 * @typedef {object} PullRequestTab
 * @property {string} url
 * @property {string} title Title shown on the unloaded (discarded) tab.
 */

/**
 * @param {string} repositoryUrl e.g. https://api.github.com/repos/owner/repo
 * @returns {string} Repository name, or "" when it cannot be determined.
 */
function repositoryName(repositoryUrl) {
  const segments = String(repositoryUrl ?? '').split('/');
  return segments.at(-1) ?? '';
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isPullRequestUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ALLOWED_ORIGIN && /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Converts search results to tabs, keeping the API order, dropping duplicates
 * and anything that is not a github.com pull request URL.
 *
 * @param {ReadonlyArray<import('./github.js').SearchItem>} items
 * @returns {PullRequestTab[]}
 */
export function toPullRequestTabs(items) {
  const seen = new Set();
  /** @type {PullRequestTab[]} */
  const tabs = [];

  for (const item of items) {
    const url = item?.html_url;
    if (typeof url !== 'string' || !isPullRequestUrl(url) || seen.has(url)) continue;
    seen.add(url);

    const repo = repositoryName(item.repository_url);
    const prefix = repo ? `${repo}#${item.number}` : `#${item.number}`;
    tabs.push({ url, title: `${prefix} · ${String(item.title ?? '').trim()}` });
  }
  return tabs;
}
