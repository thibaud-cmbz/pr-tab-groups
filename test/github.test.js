import { describe, expect, it, vi } from 'vitest';
import { GitHubError } from '../src/lib/errors.js';
import { createGitHubClient, parseNextLink } from '../src/lib/github.js';

const TOKEN = 'ghp_secret';

/**
 * @param {unknown} body
 * @param {{ status?: number, headers?: Record<string, string> }} [init]
 */
function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** @param {number} count @param {number} offset */
function items(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    html_url: `https://github.com/o/r/pull/${offset + i}`,
    title: `PR ${offset + i}`,
    number: offset + i,
    repository_url: 'https://api.github.com/repos/o/r',
    updated_at: '2026-01-01T00:00:00Z',
  }));
}

describe('parseNextLink', () => {
  it('extracts the next URL', () => {
    const header =
      '<https://api.github.com/search/issues?q=x&page=2>; rel="next", ' +
      '<https://api.github.com/search/issues?q=x&page=5>; rel="last"';
    expect(parseNextLink(header)).toBe('https://api.github.com/search/issues?q=x&page=2');
  });

  it('returns null without a next link', () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
  });
});

describe('createGitHubClient', () => {
  it('sends the token and API headers', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ login: 'octocat' }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    await expect(client.getLogin()).resolves.toBe('octocat');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers.Accept).toBe('application/vnd.github+json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes the search query and follows pagination', async () => {
    const next = 'https://api.github.com/search/issues?q=x&page=2';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ items: items(100) }, { headers: { link: `<${next}>; rel="next"` } }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: items(30, 100) }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    const result = await client.searchIssues('is:pr author:octocat');

    expect(result).toHaveLength(130);
    const firstUrl = new URL(fetch.mock.calls[0][0]);
    expect(firstUrl.searchParams.get('q')).toBe('is:pr author:octocat');
    expect(firstUrl.searchParams.get('per_page')).toBe('100');
    expect(fetch.mock.calls[1][0]).toBe(next);
  });

  it('stops at the Search API limit of 1000 results', async () => {
    const link = { link: '<https://api.github.com/search/issues?page=n>; rel="next"' };
    const fetch = vi.fn(async () => jsonResponse({ items: items(100) }, { headers: link }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    expect(await client.searchIssues('q')).toHaveLength(1000);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('refuses to send the token to another origin', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { items: items(1) },
          { headers: { link: '<https://evil.example/steal>; rel="next"' } },
        ),
      );
    const client = createGitHubClient({ token: TOKEN, fetch });

    await expect(client.searchIssues('q')).rejects.toMatchObject({ kind: 'invalidResponse' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, {}, 'unauthorized'],
    [403, {}, 'forbidden'],
    [403, { 'x-github-sso': 'required; url=https://github.com/orgs/x/sso' }, 'ssoRequired'],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }, 'rateLimited'],
    [403, { 'retry-after': '60' }, 'rateLimited'],
    [429, {}, 'rateLimited'],
    [422, {}, 'invalidQuery'],
    [500, {}, 'http'],
  ])('maps HTTP %i %j to %s', async (status, headers, kind) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'x' }, { status, headers }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    await expect(client.getLogin()).rejects.toMatchObject({ kind, status });
  });

  it('computes the rate limit reset time', async () => {
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' };
    const fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 403, headers }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    await expect(client.getLogin()).rejects.toMatchObject({ resetAt: 1_700_000_000_000 });
  });

  it('uses retry-after for secondary rate limits', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 403, headers: { 'retry-after': '30' } }));
    const client = createGitHubClient({ token: TOKEN, fetch, now: () => 1000 });

    await expect(client.getLogin()).rejects.toMatchObject({ resetAt: 31_000 });
  });

  it('maps timeouts and network failures', async () => {
    const timeout = createGitHubClient({
      token: TOKEN,
      fetch: vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    });
    await expect(timeout.getLogin()).rejects.toMatchObject({ kind: 'timeout' });

    const offline = createGitHubClient({
      token: TOKEN,
      fetch: vi.fn().mockRejectedValue(new TypeError('NetworkError')),
    });
    await expect(offline.getLogin()).rejects.toMatchObject({ kind: 'network' });
  });

  it('aborts requests that exceed the timeout', async () => {
    /** @type {typeof globalThis.fetch} */
    const hangingFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const client = createGitHubClient({ token: TOKEN, fetch: hangingFetch, timeoutMs: 10 });

    await expect(client.getLogin()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('rejects malformed bodies', async () => {
    const client = createGitHubClient({
      token: TOKEN,
      fetch: vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
    });
    await expect(client.getLogin()).rejects.toBeInstanceOf(GitHubError);
  });

  it('never includes the token in error messages', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = createGitHubClient({ token: TOKEN, fetch });

    const error = await client.getLogin().catch((e) => e);
    expect(String(error.message)).not.toContain(TOKEN);
  });
});
