// @ts-check
/**
 * Optional periodic refresh, driven by the `alarms` API.
 */
import { loadSettings } from './refresh.js';

export const REFRESH_ALARM = 'periodic-refresh';

/**
 * Creates, updates or clears the periodic refresh alarm to match the settings.
 * An alarm that already has the right period is left alone so its schedule
 * is not reset. Firefox does not keep alarms across restarts, so this must
 * also run at startup.
 *
 * @param {typeof browser} api
 */
export async function syncPeriodicRefresh(api) {
  const { refreshIntervalMinutes: period } = await loadSettings(api);
  const existing = await api.alarms.get(REFRESH_ALARM);

  if (period === 0) {
    if (existing) await api.alarms.clear(REFRESH_ALARM);
    return;
  }
  if (existing?.periodInMinutes === period) return;
  api.alarms.create(REFRESH_ALARM, { delayInMinutes: period, periodInMinutes: period });
}
