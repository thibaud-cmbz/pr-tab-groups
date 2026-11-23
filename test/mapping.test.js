import { describe, expect, it } from 'vitest';
import { toPullRequestTabs } from '../src/lib/mapping.js';

/** @param {Partial<import('../src/lib/github.js').SearchItem>} overrides */
function item(overrides) {
  return {
    html_url: 'https://github.com/acme/api/pull/12',
    title: 'Fix login',
    number: 12,
    repository_url: 'https://api.github.com/repos/acme/api',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toPullRequestTabs', () => {
  it('maps items to tabs with a readable title', () => {
    expect(toPullRequestTabs([item({ title: '  Fix login ' })])).toEqual([
      { url: 'https://github.com/acme/api/pull/12', title: 'api#12 · Fix login' },
    ]);
  });

  it('keeps the API order and removes duplicates', () => {
    const a = item({ html_url: 'https://github.com/acme/api/pull/1', number: 1 });
    const b = item({ html_url: 'https://github.com/acme/api/pull/2', number: 2 });
    expect(toPullRequestTabs([b, a, b]).map((t) => t.url)).toEqual([b.html_url, a.html_url]);
  });

  it('drops anything that is not a github.com pull request', () => {
    const items = [
      item({ html_url: 'https://github.com/acme/api/issues/3' }),
      item({ html_url: 'https://evil.example/acme/api/pull/3' }),
      item({ html_url: 'javascript:alert(1)' }),
      item({ html_url: /** @type {any} */ (undefined) }),
    ];
    expect(toPullRequestTabs(items)).toEqual([]);
  });

  it('tolerates a missing repository URL', () => {
    const [tab] = toPullRequestTabs([item({ repository_url: /** @type {any} */ (undefined) })]);
    expect(tab.title).toBe('#12 · Fix login');
  });
});
