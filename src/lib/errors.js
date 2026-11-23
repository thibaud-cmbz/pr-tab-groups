// @ts-check
/**
 * Error model shared by the GitHub client and the UI. Pure module.
 */

/**
 * @typedef {'unauthorized' | 'forbidden' | 'ssoRequired' | 'rateLimited' | 'invalidQuery'
 *   | 'timeout' | 'network' | 'http' | 'invalidResponse'} GitHubErrorKind
 */

export class GitHubError extends Error {
  /**
   * @param {GitHubErrorKind} kind
   * @param {{ status?: number, resetAt?: number, cause?: unknown }} [details]
   */
  constructor(kind, { status, resetAt, cause } = {}) {
    super(`GitHub request failed: ${kind}${status ? ` (HTTP ${status})` : ''}`, { cause });
    this.name = 'GitHubError';
    /** @readonly */
    this.kind = kind;
    /** @readonly HTTP status, when the server answered. */
    this.status = status;
    /** @readonly Epoch milliseconds when the rate limit resets, when known. */
    this.resetAt = resetAt;
  }
}

/** Raised when no token is configured. */
export class MissingTokenError extends Error {
  constructor() {
    super('No GitHub token configured');
    this.name = 'MissingTokenError';
  }
}

/**
 * Classifies a non-2xx GitHub response.
 * See https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api
 *
 * @param {number} status
 * @param {{ get(name: string): string | null }} headers
 * @param {number} now Current epoch milliseconds.
 * @returns {GitHubError}
 */
export function classifyHttpError(status, headers, now) {
  if (status === 401) return new GitHubError('unauthorized', { status });

  if (status === 403 || status === 429) {
    // Primary rate limit: remaining quota is exhausted, reset is an epoch in seconds.
    if (headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(headers.get('x-ratelimit-reset'));
      return new GitHubError('rateLimited', {
        status,
        resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined,
      });
    }
    // Secondary rate limit: retry-after is a delay in seconds.
    const retryAfter = Number(headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return new GitHubError('rateLimited', { status, resetAt: now + retryAfter * 1000 });
    }
    if (status === 429) return new GitHubError('rateLimited', { status });
    // Organizations enforcing SAML SSO reject tokens that are not authorized for them.
    if (headers.get('x-github-sso')) return new GitHubError('ssoRequired', { status });
    return new GitHubError('forbidden', { status });
  }

  // The Search API answers 422 when a qualifier targets an unknown user or organization.
  if (status === 422) return new GitHubError('invalidQuery', { status });

  return new GitHubError('http', { status });
}

/**
 * @typedef {object} ErrorDescription
 * @property {string} key i18n message name.
 * @property {string[]} substitutions i18n placeholder values.
 */

/**
 * Maps any error to a user-facing i18n message. Never exposes raw error details,
 * which could contain request data.
 *
 * @param {unknown} error
 * @param {(epochMs: number) => string} formatTime Formats a reset time for display.
 * @returns {ErrorDescription}
 */
export function describeError(error, formatTime) {
  if (error instanceof MissingTokenError) return { key: 'errorNoToken', substitutions: [] };
  if (!(error instanceof GitHubError)) return { key: 'errorUnexpected', substitutions: [] };

  switch (error.kind) {
    case 'unauthorized':
      return { key: 'errorUnauthorized', substitutions: [] };
    case 'forbidden':
      return { key: 'errorForbidden', substitutions: [] };
    case 'ssoRequired':
      return { key: 'errorSsoRequired', substitutions: [] };
    case 'rateLimited':
      return error.resetAt
        ? { key: 'errorRateLimitedUntil', substitutions: [formatTime(error.resetAt)] }
        : { key: 'errorRateLimited', substitutions: [] };
    case 'invalidQuery':
      return { key: 'errorInvalidQuery', substitutions: [] };
    case 'timeout':
      return { key: 'errorTimeout', substitutions: [] };
    case 'network':
      return { key: 'errorNetwork', substitutions: [] };
    case 'invalidResponse':
      return { key: 'errorInvalidResponse', substitutions: [] };
    default:
      return { key: 'errorHttp', substitutions: [String(error.status ?? '?')] };
  }
}
