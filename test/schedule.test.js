import { describe, expect, it, vi } from 'vitest';
import { REFRESH_ALARM, syncPeriodicRefresh } from '../src/background/schedule.js';

/**
 * @param {object} settings
 * @param {{ periodInMinutes?: number }} [existing]
 */
function createApi(settings, existing) {
  const api = {
    storage: { local: { get: vi.fn(async () => ({ settings })) } },
    alarms: {
      get: vi.fn(async () => (existing ? { name: REFRESH_ALARM, ...existing } : undefined)),
      create: vi.fn(),
      clear: vi.fn(async () => true),
    },
  };
  return { api, browser: /** @type {typeof globalThis.browser} */ (/** @type {unknown} */ (api)) };
}

describe('syncPeriodicRefresh', () => {
  it('creates the alarm when enabled', async () => {
    const { api, browser } = createApi({ refreshIntervalMinutes: 15 });
    await syncPeriodicRefresh(browser);
    expect(api.alarms.create).toHaveBeenCalledWith(REFRESH_ALARM, {
      delayInMinutes: 15,
      periodInMinutes: 15,
    });
  });

  it('keeps an alarm that already has the right period', async () => {
    const { api, browser } = createApi({ refreshIntervalMinutes: 15 }, { periodInMinutes: 15 });
    await syncPeriodicRefresh(browser);
    expect(api.alarms.create).not.toHaveBeenCalled();
  });

  it('replaces an alarm whose period changed', async () => {
    const { api, browser } = createApi({ refreshIntervalMinutes: 30 }, { periodInMinutes: 15 });
    await syncPeriodicRefresh(browser);
    expect(api.alarms.create).toHaveBeenCalledWith(REFRESH_ALARM, expect.any(Object));
  });

  it('clears the alarm when disabled', async () => {
    const { api, browser } = createApi({ refreshIntervalMinutes: 0 }, { periodInMinutes: 15 });
    await syncPeriodicRefresh(browser);
    expect(api.alarms.clear).toHaveBeenCalledWith(REFRESH_ALARM);
    expect(api.alarms.create).not.toHaveBeenCalled();
  });
});
