import { describe, expect, it, vi } from 'vitest';
import { refresh } from '../src/background/refresh.js';
import { GitHubError, MissingTokenError } from '../src/lib/errors.js';
import { createBrowserMock } from './browser-mock.js';

const pr = (/** @type {number} */ n) => `https://github.com/acme/api/pull/${n}`;

/** @param {Array<number | string>} prs PR numbers in acme/api, or "repo#number" */
const items = (prs) =>
  prs.map((value) => {
    const [repo, n] = typeof value === 'number' ? ['api', value] : value.split('#');
    return {
      html_url: `https://github.com/acme/${repo}/pull/${n}`,
      title: `PR ${n}`,
      number: Number(n),
      repository_url: `https://api.github.com/repos/acme/${repo}`,
      updated_at: '2026-01-01T00:00:00Z',
    };
  });

/** @param {{ mine?: Array<number | string>, review?: Array<number | string> }} results */
function fakeGitHub({ mine = [], review = [] } = {}) {
  const client = {
    getLogin: vi.fn(async () => 'octocat'),
    searchIssues: vi.fn(async (/** @type {string} */ q) =>
      items(q.includes('author:') ? mine : review),
    ),
  };
  return { client, createClient: vi.fn(() => client) };
}

const SETTINGS = { token: 't0ken', org: 'decider', pinnedUrl: 'https://example.com/board' };

describe('refresh', () => {
  it('opens the options flow when no token is configured, after the fixed page', async () => {
    const env = createBrowserMock({ settings: { pinnedUrl: 'https://example.com/board' } });
    const github = fakeGitHub();

    await expect(refresh({ browser: env.browser, ...github })).rejects.toBeInstanceOf(
      MissingTokenError,
    );
    expect(github.createClient).not.toHaveBeenCalled();
    expect(env.tabs.map((t) => t.url)).toEqual(['https://example.com/board']);
  });

  it('opens the fixed page pinned, only when it is not already open', async () => {
    const env = createBrowserMock({ settings: SETTINGS });
    await refresh({ browser: env.browser, ...fakeGitHub() });
    await refresh({ browser: env.browser, ...fakeGitHub() });

    const fixed = env.tabs.filter((t) => t.url === SETTINGS.pinnedUrl);
    expect(fixed).toHaveLength(1);
    expect(fixed[0]).toMatchObject({ pinned: true, discarded: false });
  });

  it('honours the pin option and an already open page', async () => {
    const unpinned = createBrowserMock({ settings: { ...SETTINGS, pinTab: false } });
    await refresh({ browser: unpinned.browser, ...fakeGitHub() });
    expect(unpinned.tabs[0].pinned).toBe(false);

    const open = createBrowserMock({
      settings: SETTINGS,
      tabs: [{ url: 'https://example.com/board/#top' }],
    });
    await refresh({ browser: open.browser, ...fakeGitHub() });
    expect(open.mock.tabs.create).not.toHaveBeenCalled();
  });

  it('creates collapsed, titled and colored groups of unloaded tabs', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    const result = await refresh({
      browser: env.browser,
      ...fakeGitHub({ mine: [1, 2], review: [3] }),
    });

    expect(result).toEqual({ mine: 2, review: 1 });
    expect([...env.groups.values()]).toEqual([
      { title: 'groupMine(2)', color: 'blue', collapsed: true },
      { title: 'groupReview(1)', color: 'orange', collapsed: true },
    ]);
    const [mineId, reviewId] = env.groups.keys();
    expect(env.tabsInGroup(mineId).map((t) => t.url)).toEqual([pr(1), pr(2)]);
    expect(env.tabsInGroup(reviewId).map((t) => t.url)).toEqual([pr(3)]);
    expect(env.tabs.every((t) => t.discarded && t.title?.startsWith('api#'))).toBe(true);
    expect(env.mock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ discarded: true, active: false, windowId: 1 }),
    );
  });

  it('orders tabs by repository inside a group, keeping reused tabs in place', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    await refresh({ browser: env.browser, ...fakeGitHub({ mine: ['web#1', 'api#2'] }) });
    const reusedId = env.tabs.find((t) => t.url.endsWith('/web/pull/1'))?.id;

    // A new PR in a repository sorted before "web" must end up before the reused tab.
    await refresh({
      browser: env.browser,
      ...fakeGitHub({ mine: ['web#1', 'api#2', 'core#3', 'api#4'] }),
    });

    const [groupId] = env.groups.keys();
    const titles = env.tabsInGroup(groupId).map((t) => t.title ?? t.url);
    expect(titles).toEqual(['api#2 · PR 2', 'api#4 · PR 4', 'core#3 · PR 3', 'web#1 · PR 1']);
    expect(env.tabsInGroup(groupId).at(-1)?.id).toBe(reusedId);
  });

  it('builds search queries from the token owner and settings', async () => {
    const env = createBrowserMock({ settings: { token: 't', org: 'acme', reviewOrgOnly: false } });
    const github = fakeGitHub();
    await refresh({ browser: env.browser, ...github });

    expect(github.createClient).toHaveBeenCalledWith('t');
    expect(github.client.searchIssues.mock.calls.map(([q]) => q)).toEqual([
      'is:pr is:open archived:false author:octocat org:acme',
      'is:pr is:open archived:false review-requested:octocat',
    ]);
  });

  it('does not create empty groups', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    await refresh({ browser: env.browser, ...fakeGitHub({ review: [3] }) });

    expect([...env.groups.values()].map((g) => g.title)).toEqual(['groupReview(1)']);
  });

  it('is idempotent: a second refresh reuses tabs and leaves no duplicate', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    const github = fakeGitHub({ mine: [1, 2], review: [3] });

    await refresh({ browser: env.browser, ...github });
    const firstIds = env.tabs.map((t) => t.id);
    await refresh({ browser: env.browser, ...github });

    expect(env.tabs.map((t) => t.id).sort()).toEqual(firstIds.sort());
    expect(env.groups.size).toBe(2);
  });

  it('replaces groups restored from a previous session', async () => {
    // Restored tabs keep their session markers but get new group IDs.
    const env = createBrowserMock({
      settings: { token: 't' },
      tabs: [
        { url: pr(1), groupId: 50, discarded: true },
        { url: pr(9), groupId: 50, discarded: true },
        { url: 'https://example.com/mine', groupId: 50 },
        { url: pr(3), groupId: 51, discarded: true },
      ],
    });
    env.groups.set(50, { title: 'groupMine(2)' });
    env.groups.set(51, { title: 'groupReview(1)' });
    env.mark(1, 'mine');
    env.mark(2, 'mine');
    env.mark(4, 'review');

    await refresh({ browser: env.browser, ...fakeGitHub({ mine: [1, 2], review: [3] }) });

    // PR 9 is gone: its tab is closed. PRs 1 and 3 reuse their tabs.
    expect(env.tabs.find((t) => t.url === pr(9))).toBeUndefined();
    const byUrl = Object.fromEntries(env.tabs.map((t) => [t.url, t]));
    expect(byUrl[pr(1)].id).toBe(1);
    expect(byUrl[pr(3)].id).toBe(4);
    // The user's own tab is kept in the old group, untouched.
    expect(byUrl['https://example.com/mine'].groupId).toBe(50);
    expect(env.groups.get(51)).toBeUndefined();
    expect(byUrl[pr(1)].groupId).toBe(byUrl[pr(2)].groupId);
  });

  it('removes managed tabs when a group becomes empty', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    await refresh({ browser: env.browser, ...fakeGitHub({ mine: [1], review: [3] }) });
    await refresh({ browser: env.browser, ...fakeGitHub({ mine: [1] }) });

    expect(env.tabs.map((t) => t.url)).toEqual([pr(1)]);
    expect([...env.groups.values()].map((g) => g.title)).toEqual(['groupMine(1)']);
  });

  it('leaves tabs untouched when GitHub fails', async () => {
    const env = createBrowserMock({ settings: { token: 't' } });
    await refresh({ browser: env.browser, ...fakeGitHub({ mine: [1] }) });
    const before = structuredClone(env.tabs);

    const failing = fakeGitHub();
    failing.client.searchIssues.mockRejectedValue(new GitHubError('unauthorized', { status: 401 }));
    await expect(refresh({ browser: env.browser, ...failing })).rejects.toMatchObject({
      kind: 'unauthorized',
    });

    expect(env.tabs).toEqual(before);
    expect(env.mock.tabs.remove).not.toHaveBeenCalled();
  });
});
