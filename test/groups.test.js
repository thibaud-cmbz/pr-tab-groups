import { describe, expect, it } from 'vitest';
import { isUrlOpen, normalizeUrl, planGroups, selectManagedTabIds } from '../src/lib/groups.js';

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

describe('selectManagedTabIds', () => {
  it('keeps only tabs marked with a known group kind', () => {
    expect(
      selectManagedTabIds([
        { tabId: 1, marker: 'mine' },
        { tabId: 2, marker: undefined },
        { tabId: 3, marker: 'review' },
        { tabId: 4, marker: 'something-else' },
      ]),
    ).toEqual([1, 3]);
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
