import { describe, expect, it } from 'vitest';
import { describeError, GitHubError, MissingTokenError } from '../src/lib/errors.js';

const formatTime = (/** @type {number} */ ms) => `t=${ms}`;

describe('describeError', () => {
  it.each([
    [new MissingTokenError(), 'errorNoToken', []],
    [new GitHubError('unauthorized'), 'errorUnauthorized', []],
    [new GitHubError('forbidden'), 'errorForbidden', []],
    [new GitHubError('ssoRequired'), 'errorSsoRequired', []],
    [new GitHubError('rateLimited'), 'errorRateLimited', []],
    [new GitHubError('rateLimited', { resetAt: 42 }), 'errorRateLimitedUntil', ['t=42']],
    [new GitHubError('invalidQuery'), 'errorInvalidQuery', []],
    [new GitHubError('timeout'), 'errorTimeout', []],
    [new GitHubError('network'), 'errorNetwork', []],
    [new GitHubError('invalidResponse'), 'errorInvalidResponse', []],
    [new GitHubError('http', { status: 502 }), 'errorHttp', ['502']],
    [new Error('boom'), 'errorUnexpected', []],
    ['not an error', 'errorUnexpected', []],
  ])('describes %o', (error, key, substitutions) => {
    expect(describeError(error, formatTime)).toEqual({ key, substitutions });
  });
});
