// @ts-check
/**
 * Toolbar button state: badge and tooltip.
 */

const LOADING_COLOR = '#6b7280';
const ERROR_COLOR = '#d92d20';

/**
 * @param {typeof browser} api
 */
export function createBadge(api) {
  const { action, i18n } = api;
  return {
    async loading() {
      await action.setBadgeBackgroundColor({ color: LOADING_COLOR });
      await action.setBadgeText({ text: '…' });
      await action.setTitle({ title: i18n.getMessage('actionTitleLoading') });
    },

    async success() {
      await action.setBadgeText({ text: '' });
      await action.setTitle({ title: i18n.getMessage('actionTitle') });
    },

    /** @param {string} message Localized, user-facing message. */
    async error(message) {
      await action.setBadgeBackgroundColor({ color: ERROR_COLOR });
      await action.setBadgeText({ text: '!' });
      await action.setTitle({ title: i18n.getMessage('actionTitleError', [message]) });
    },
  };
}
