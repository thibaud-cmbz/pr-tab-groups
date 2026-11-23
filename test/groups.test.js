import { describe, expect, it } from 'vitest';
import {
  isUrlOpen,
  normalizeUrl,
  planGroups,
  pullRequestKey,
  reconcileGroups,
} from '../src/lib/groups.js';

const tab = (/** @type {number} */ n) => ({
  url: `https://github.com/o/r/pull/${n}`,
  title: `#${n}`,
});

describe('planGroups', () => {
  it('creates one group per non-empty kind, in display order', () => {
    const plans = planGroups({ review: [tab(2)], mine: [tab(1), tab(3)] });
    expect(plans.map((p) => [p.kind, p.color, p.titleKey, p.tabs.length])).toEqual([
      ['mine', 'blue', 'groupMine', 2],
      ['review', 'orange', 'groupReview', 1],
    ]);
  });

  it('skips empty groups', () => {
    expect(planGroups({ mine: [], review: [tab(1)] }).map((p) => p.kind)).toEqual(['review']);
    expect(planGroups({ mine: [], review: [] })).toEqual([]);
  });
});

describe('pullRequestKey', () => {
  it.each([
    ['https://github.com/Acme/API/pull/12', 'acme/api#12'],
    ['https://github.com/acme/api/pull/12/files#diff', 'acme/api#12'],
    ['https://github.com/acme/api/pull/12?w=1', 'acme/api#12'],
    ['https://github.com/acme/api/pull/123', 'acme/api#123'],
    ['https://github.com/acme/api/issues/12', null],
    ['https://example.com/acme/api/pull/12', null],
    ['about:blank', null],
    ['nope', null],
  ])('pullRequestKey(%j) === %j', (url, expected) => {
    expect(pullRequestKey(url)).toBe(expected);
  });
});

describe('reconcileGroups', () => {
  const plans = planGroups({ mine: [tab(1), tab(2)], review: [tab(3)] });

  it('creates every tab when nothing is open', () => {
    const { groups, closeTabIds } = reconcileGroups([], plans);
    expect(closeTabIds).toEqual([]);
    expect(groups.map((g) => [g.kind, g.tabs.map((t) => t.tabId)])).toEqual([
      ['mine', [undefined, undefined]],
      ['review', [undefined]],
    ]);
  });

  it('reuses managed tabs still listed, including sub-pages and moved kinds', () => {
    const { groups, closeTabIds } = reconcileGroups(
      [
        { tabId: 10, url: 'https://github.com/o/r/pull/2/files', marker: 'mine' },
        { tabId: 11, url: 'https://github.com/o/r/pull/3', marker: 'mine' },
      ],
      plans,
    );
    expect(closeTabIds).toEqual([]);
    expect(groups[0].tabs.map((t) => t.tabId)).toEqual([undefined, 10]);
    expect(groups[1].tabs.map((t) => t.tabId)).toEqual([11]);
  });

  it('closes managed tabs that are stale or duplicated', () => {
    const { closeTabIds } = reconcileGroups(
      [
        { tabId: 10, url: 'https://github.com/o/r/pull/1', marker: 'mine' },
        { tabId: 11, url: 'https://github.com/o/r/pull/1', marker: 'mine' },
        { tabId: 12, url: 'https://github.com/o/r/pull/99', marker: 'review' },
      ],
      plans,
    );
    expect(closeTabIds).toEqual([11, 12]);
  });

  it('never touches unmarked tabs or tabs navigated away from pull requests', () => {
    const { groups, closeTabIds } = reconcileGroups(
      [
        { tabId: 20, url: 'https://github.com/o/r/pull/1', marker: undefined },
        { tabId: 21, url: 'https://github.com/o/r/pull/99', marker: 'unknown' },
        { tabId: 22, url: 'https://example.com/', marker: 'mine' },
        { tabId: 23, url: undefined, marker: 'mine' },
      ],
      plans,
    );
    expect(closeTabIds).toEqual([]);
    expect(groups.flatMap((g) => g.tabs).every((t) => t.tabId === undefined)).toBe(true);
  });

  it('closes every managed pull request tab when no group is planned', () => {
    const { groups, closeTabIds } = reconcileGroups(
      [{ tabId: 10, url: 'https://github.com/o/r/pull/1', marker: 'mine' }],
      [],
    );
    expect(groups).toEqual([]);
    expect(closeTabIds).toEqual([10]);
  });
});

describe('isUrlOpen', () => {
  const tabs = [{ url: 'https://example.com/dashboard/' }, { url: undefined }, {}];

  it('ignores trailing slashes and fragments', () => {
    expect(isUrlOpen(tabs, 'https://example.com/dashboard')).toBe(true);
    expect(isUrlOpen(tabs, 'https://example.com/dashboard#top')).toBe(true);
  });

  it('does not match other pages or query strings', () => {
    expect(isUrlOpen(tabs, 'https://example.com/other')).toBe(false);
    expect(isUrlOpen(tabs, 'https://example.com/dashboard?tab=2')).toBe(false);
  });

  it('handles invalid URLs', () => {
    expect(isUrlOpen(tabs, 'not a url')).toBe(false);
    expect(normalizeUrl('nope')).toBeNull();
  });
});
