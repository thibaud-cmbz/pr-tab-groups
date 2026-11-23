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
      {
        url: 'https://github.com/acme/api/pull/12',
        title: 'api#12 · Fix login',
        repository: 'acme/api',
      },
    ]);
  });

  it('keeps the API order within a repository and removes duplicates', () => {
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

  it('sorts by repository, case-insensitively, keeping the API order within one', () => {
    const at = (/** @type {string} */ repo, /** @type {number} */ n) =>
      item({ html_url: `https://github.com/${repo}/pull/${n}`, number: n });
    const tabs = toPullRequestTabs([
      at('acme/web', 1),
      at('acme/API', 2),
      at('acme/web', 3),
      at('acme/api-gateway', 4),
      at('acme/API', 5),
    ]);
    expect(tabs.map((t) => t.url.replace('https://github.com/', ''))).toEqual([
      'acme/API/pull/2',
      'acme/API/pull/5',
      'acme/api-gateway/pull/4',
      'acme/web/pull/1',
      'acme/web/pull/3',
    ]);
  });

  it('keeps repositories with the same name in different owners apart', () => {
    const tabs = toPullRequestTabs([
      item({ html_url: 'https://github.com/zeta/api/pull/1', number: 1 }),
      item({ html_url: 'https://github.com/acme/api/pull/2', number: 2 }),
      item({ html_url: 'https://github.com/zeta/api/pull/3', number: 3 }),
    ]);
    expect(tabs.map((t) => [t.repository, t.title.split(' ')[0]])).toEqual([
      ['acme/api', 'api#2'],
      ['zeta/api', 'api#1'],
      ['zeta/api', 'api#3'],
    ]);
  });
});
