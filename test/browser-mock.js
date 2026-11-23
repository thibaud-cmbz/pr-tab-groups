/**
 * Minimal in-memory model of the WebExtension APIs used by the extension:
 * tabs, tab groups, session values, storage, i18n and the toolbar action.
 */
import { vi } from 'vitest';

/**
 * @typedef {object} MockTab
 * @property {number} id
 * @property {number} windowId
 * @property {string} url
 * @property {number} groupId
 * @property {boolean} pinned
 * @property {boolean} discarded
 * @property {string} [title]
 */

/** @param {{ settings?: object, tabs?: Partial<MockTab>[] }} [initial] */
export function createBrowserMock({ settings = {}, tabs = [] } = {}) {
  let nextTabId = 100;
  let nextGroupId = 1;
  const WINDOW_ID = 1;

  /** @type {MockTab[]} */
  const state = tabs.map((tab, i) => ({
    id: i + 1,
    windowId: WINDOW_ID,
    url: 'about:blank',
    groupId: -1,
    pinned: false,
    discarded: false,
    ...tab,
  }));
  /** @type {Map<number, { title?: string, color?: string, collapsed?: boolean }>} */
  const groups = new Map();
  /** @type {Map<number, Record<string, unknown>>} */
  const sessionValues = new Map();
  /** @type {Record<string, unknown>} */
  const local = { settings };

  /** @param {number} id */
  const findTab = (id) => {
    const tab = state.find((t) => t.id === id);
    if (!tab) throw new Error(`Invalid tab ID: ${id}`);
    return tab;
  };

  // Firefox deletes a group as soon as it has no tab left.
  const pruneGroups = () => {
    for (const id of groups.keys()) {
      if (!state.some((t) => t.groupId === id)) groups.delete(id);
    }
  };

  const browser = {
    storage: {
      local: {
        get: vi.fn(async (/** @type {string} */ key) => ({ [key]: local[key] })),
        set: vi.fn(async (/** @type {Record<string, unknown>} */ items) => {
          Object.assign(local, items);
        }),
      },
    },
    windows: {
      getLastFocused: vi.fn(async () => ({ id: WINDOW_ID })),
    },
    tabs: {
      query: vi.fn(async () => state.map((t) => ({ ...t }))),
      create: vi.fn(async (/** @type {any} */ props) => {
        if (props.discarded && props.active) throw new Error('discarded tabs cannot be active');
        if (props.title && !props.discarded) throw new Error('title requires discarded');
        /** @type {MockTab} */
        const tab = {
          id: nextTabId++,
          windowId: props.windowId ?? WINDOW_ID,
          url: props.url,
          groupId: -1,
          pinned: Boolean(props.pinned),
          discarded: Boolean(props.discarded),
          title: props.title,
        };
        state.push(tab);
        return { ...tab };
      }),
      remove: vi.fn(async (/** @type {number[]} */ ids) => {
        for (const id of ids) state.splice(state.indexOf(findTab(id)), 1);
        pruneGroups();
      }),
      move: vi.fn(
        async (/** @type {number[]} */ ids, /** @type {{ index: number }} */ { index }) => {
          const moved = ids.map(findTab);
          for (const tab of moved) state.splice(state.indexOf(tab), 1);
          state.splice(index === -1 ? state.length : index, 0, ...moved);
          return moved.map((t) => ({ ...t }));
        },
      ),
      group: vi.fn(async (/** @type {{ tabIds: number[], groupId?: number }} */ options) => {
        const groupId = options.groupId ?? nextGroupId++;
        groups.set(groupId, groups.get(groupId) ?? {});
        for (const id of options.tabIds) {
          const tab = findTab(id);
          tab.groupId = groupId;
          tab.pinned = false;
        }
        pruneGroups();
        return groupId;
      }),
    },
    tabGroups: {
      update: vi.fn(async (/** @type {number} */ groupId, /** @type {object} */ props) => {
        const group = groups.get(groupId);
        if (!group) throw new Error(`Invalid group ID: ${groupId}`);
        Object.assign(group, props);
        return { id: groupId, ...group };
      }),
    },
    sessions: {
      getTabValue: vi.fn(async (/** @type {number} */ tabId, /** @type {string} */ key) => {
        findTab(tabId);
        return sessionValues.get(tabId)?.[key];
      }),
      setTabValue: vi.fn(
        async (
          /** @type {number} */ tabId,
          /** @type {string} */ key,
          /** @type {unknown} */ v,
        ) => {
          findTab(tabId);
          sessionValues.set(tabId, { ...sessionValues.get(tabId), [key]: v });
        },
      ),
    },
    i18n: {
      getMessage: vi.fn((/** @type {string} */ key, /** @type {string[]} */ subs = []) =>
        subs.length ? `${key}(${subs.join(',')})` : key,
      ),
      getUILanguage: () => 'en',
    },
    runtime: {
      openOptionsPage: vi.fn(async () => {}),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {}),
    },
  };

  return {
    /** Cast for code typed against the real `browser` namespace. */
    browser: /** @type {typeof globalThis.browser} */ (/** @type {unknown} */ (browser)),
    mock: browser,
    tabs: state,
    groups,
    /** Marks a tab as managed, as a previous session would have. */
    mark(/** @type {number} */ tabId, /** @type {string} */ kind) {
      sessionValues.set(tabId, { managedGroup: kind });
    },
    /** Tabs of a group, in order. */
    tabsInGroup(/** @type {number} */ groupId) {
      return state.filter((t) => t.groupId === groupId);
    },
  };
}
