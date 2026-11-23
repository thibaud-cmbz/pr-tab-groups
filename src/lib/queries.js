// @ts-check
/**
 * Builders for GitHub search queries. Pure module.
 * Syntax: https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
 */

/** Qualifiers shared by every query: open pull requests in non-archived repositories. */
const BASE_QUALIFIERS = ['is:pr', 'is:open', 'archived:false'];

/**
 * @typedef {object} SearchQueries
 * @property {string} mine Pull requests authored by the user.
 * @property {string} review Pull requests where the user's review is requested
 *   (directly or through one of their teams).
 */

/**
 * @param {{ org: string, reviewOrgOnly: boolean }} options
 * @param {string} login Login of the authenticated user.
 * @returns {SearchQueries}
 */
export function buildSearchQueries({ org, reviewOrgOnly }, login) {
  if (!login) throw new Error('login is required');
  const orgQualifier = org ? [`org:${org}`] : [];

  return {
    mine: [...BASE_QUALIFIERS, `author:${login}`, ...orgQualifier].join(' '),
    review: [
      ...BASE_QUALIFIERS,
      `review-requested:${login}`,
      ...(reviewOrgOnly ? orgQualifier : []),
    ].join(' '),
  };
}
