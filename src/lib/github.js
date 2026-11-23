// @ts-check
/**
 * Minimal GitHub REST client. `fetch` is injected so the module stays testable;
 * it never logs or exposes the token.
 */
import { classifyHttpError, GitHubError } from './errors.js';

export const API_ORIGIN = 'https://api.github.com';
export const SEARCH_PAGE_SIZE = 100;
/** The Search API never returns more than 1000 results for a query. */
export const SEARCH_MAX_RESULTS = 1000;
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Subset of a Search API item used by the extension.
 * @typedef {object} SearchItem
 * @property {string} html_url
 * @property {string} title
 * @property {number} number
 * @property {string} repository_url
 * @property {string} updated_at
 */

/**
 * @typedef {object} GitHubClient
 * @property {() => Promise<string>} getLogin Login of the token owner.
 * @property {(query: string) => Promise<SearchItem[]>} searchIssues All results of a search.
 */

/**
 * Extracts the `rel="next"` URL from a `Link` header.
 *
 * @param {string | null} header
 * @returns {string | null}
 */
export function parseNextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return null;
}

/**
 * @param {{ token: string, fetch?: typeof fetch, timeoutMs?: number, now?: () => number }} options
 * @returns {GitHubClient}
 */
export function createGitHubClient({
  token,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
}) {
  if (!token) throw new Error('token is required');

  /**
   * @param {string} url Absolute URL on the GitHub API origin.
   * @returns {Promise<{ body: any, headers: Headers }>}
   */
  async function request(url) {
    // Never send the token anywhere else, even if a Link header pointed elsewhere.
    if (new URL(url).origin !== API_ORIGIN) throw new GitHubError('invalidResponse');

    /** @type {Response} */
    let response;
    try {
      response = await fetchFn(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const kind = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
      throw new GitHubError(kind, { cause: error });
    }

    if (!response.ok) throw classifyHttpError(response.status, response.headers, now());

    try {
      return { body: await response.json(), headers: response.headers };
    } catch (error) {
      throw new GitHubError('invalidResponse', { status: response.status, cause: error });
    }
  }

  return {
    async getLogin() {
      const { body } = await request(`${API_ORIGIN}/user`);
      if (typeof body?.login !== 'string') throw new GitHubError('invalidResponse');
      return body.login;
    },

    async searchIssues(query) {
      const params = new URLSearchParams({
        q: query,
        per_page: String(SEARCH_PAGE_SIZE),
        sort: 'updated',
        order: 'desc',
      });
      /** @type {string | null} */
      let url = `${API_ORIGIN}/search/issues?${params}`;
      /** @type {SearchItem[]} */
      const items = [];

      while (url && items.length < SEARCH_MAX_RESULTS) {
        const { body, headers } = await request(url);
        if (!Array.isArray(body?.items)) throw new GitHubError('invalidResponse');
        items.push(...body.items);
        url = parseNextLink(headers.get('link'));
      }
      return items.slice(0, SEARCH_MAX_RESULTS);
    },
  };
}
