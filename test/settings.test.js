import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  isValidGitHubLogin,
  isValidHttpUrl,
  normalizeSettings,
  validateSettings,
} from '../src/lib/settings.js';

describe('normalizeSettings', () => {
  it('returns defaults for missing or invalid input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('trims strings and drops unknown keys', () => {
    const result = normalizeSettings({ token: '  abc ', org: ' acme ', extra: 1 });
    expect(result.token).toBe('abc');
    expect(result.org).toBe('acme');
    expect(result).not.toHaveProperty('extra');
  });

  it('keeps an explicitly empty organization', () => {
    expect(normalizeSettings({ org: '' }).org).toBe('');
  });

  it('clamps the startup delay', () => {
    expect(normalizeSettings({ startupDelaySeconds: -4 }).startupDelaySeconds).toBe(0);
    expect(normalizeSettings({ startupDelaySeconds: 999 }).startupDelaySeconds).toBe(30);
    expect(normalizeSettings({ startupDelaySeconds: '12' }).startupDelaySeconds).toBe(12);
    expect(normalizeSettings({ startupDelaySeconds: 'x' }).startupDelaySeconds).toBe(5);
  });

  it('keeps 0 as "disabled" and enforces a minimum refresh interval', () => {
    expect(normalizeSettings({ refreshIntervalMinutes: 0 }).refreshIntervalMinutes).toBe(0);
    expect(normalizeSettings({ refreshIntervalMinutes: 1 }).refreshIntervalMinutes).toBe(5);
    expect(normalizeSettings({ refreshIntervalMinutes: 60 }).refreshIntervalMinutes).toBe(60);
    expect(normalizeSettings({ refreshIntervalMinutes: 1e6 }).refreshIntervalMinutes).toBe(1440);
  });

  it('ignores non-boolean flags', () => {
    expect(normalizeSettings({ pinTab: 'no', reviewOrgOnly: 0 })).toMatchObject({
      pinTab: true,
      reviewOrgOnly: true,
    });
    expect(normalizeSettings({ pinTab: false }).pinTab).toBe(false);
  });
});

describe('validators', () => {
  it.each([
    ['decider', true],
    ['my-org', true],
    ['a', true],
    ['-org', false],
    ['org-', false],
    ['my--org', false],
    ['org name', false],
    ['x'.repeat(40), false],
  ])('isValidGitHubLogin(%j) === %s', (value, expected) => {
    expect(isValidGitHubLogin(value)).toBe(expected);
  });

  it.each([
    ['https://example.com/dashboard', true],
    ['http://localhost:8080', true],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['not a url', false],
  ])('isValidHttpUrl(%j) === %s', (value, expected) => {
    expect(isValidHttpUrl(value)).toBe(expected);
  });

  it('reports invalid organization and URL', () => {
    const settings = normalizeSettings({ org: 'bad org', pinnedUrl: 'ftp://x' });
    expect(validateSettings(settings)).toEqual(['optionsErrorOrg', 'optionsErrorPinnedUrl']);
  });

  it('accepts empty organization and URL', () => {
    expect(validateSettings(normalizeSettings({ org: '', pinnedUrl: '' }))).toEqual([]);
  });
});
