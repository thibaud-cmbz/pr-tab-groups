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
 * @property {string} repository "owner/repo", used to sort tabs by repository.
 */

const PULL_REQUEST_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/;

/**
 * @param {string} value
 * @returns {{ owner: string, repo: string } | null} Null unless a github.com pull request URL.
 */
function parsePullRequestUrl(value) {
  try {
    const url = new URL(value);
    const match = url.origin === ALLOWED_ORIGIN ? PULL_REQUEST_PATH.exec(url.pathname) : null;
    return match ? { owner: match[1], repo: match[2] } : null;
  } catch {
    return null;
  }
}

/**
 * Converts search results to tabs in display order: grouped by repository
 * (alphabetical, case-insensitive), keeping the API order within a repository.
 * Duplicates and anything that is not a github.com pull request URL are dropped.
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
    const parsed = typeof url === 'string' ? parsePullRequestUrl(url) : null;
    if (!parsed || seen.has(url)) continue;
    seen.add(url);

    tabs.push({
      url,
      title: `${parsed.repo}#${item.number} · ${String(item.title ?? '').trim()}`,
      repository: `${parsed.owner}/${parsed.repo}`,
    });
  }

  // Array.prototype.sort is stable: the API order is kept within a repository.
  return tabs.sort((a, b) =>
    a.repository.localeCompare(b.repository, 'en', { sensitivity: 'base' }),
  );
}
