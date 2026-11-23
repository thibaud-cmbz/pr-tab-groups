import { describe, expect, it } from 'vitest';
import { buildSearchQueries } from '../src/lib/queries.js';

describe('buildSearchQueries', () => {
  it('filters both queries by organization when requested', () => {
    expect(buildSearchQueries({ org: 'decider', reviewOrgOnly: true }, 'octocat')).toEqual({
      mine: 'is:pr is:open archived:false author:octocat org:decider',
      review: 'is:pr is:open archived:false review-requested:octocat org:decider',
    });
  });

  it('does not filter reviews by organization when disabled', () => {
    const { mine, review } = buildSearchQueries(
      { org: 'decider', reviewOrgOnly: false },
      'octocat',
    );
    expect(mine).toContain('org:decider');
    expect(review).toBe('is:pr is:open archived:false review-requested:octocat');
  });

  it('omits the organization qualifier when no organization is set', () => {
    const { mine, review } = buildSearchQueries({ org: '', reviewOrgOnly: true }, 'octocat');
    expect(mine).toBe('is:pr is:open archived:false author:octocat');
    expect(review).not.toContain('org:');
  });

  it('requires a login', () => {
    expect(() => buildSearchQueries({ org: '', reviewOrgOnly: false }, '')).toThrow();
  });
});
