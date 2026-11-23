# PR Tab Groups

A Firefox extension that opens your GitHub pull requests in collapsed tab groups when the browser starts.

- **My PRs (n)**: open pull requests you authored in an organization.
- **To review (n)**: open pull requests where your review is requested, directly or through one of your teams.
- An optional **fixed page** (a dashboard, a board…), opened and pinned at startup if it is not already open.

<!-- Screenshots: add them to docs/screenshots/ and reference them here. -->

| Tab groups                            | Options                                |
| ------------------------------------- | -------------------------------------- |
| _TODO: `docs/screenshots/groups.png`_ | _TODO: `docs/screenshots/options.png`_ |

## Features

- Runs at browser startup, after a configurable delay. The toolbar button refreshes on demand.
- Each group's title includes its count (`My PRs (4)`). Each group has its own color and starts collapsed. Empty groups are not created.
- Within each group, tabs are sorted by repository (alphabetically), then by most recent update. Each tab title starts with its repository and number, for example `api#12 · Fix login`.
- Tabs are created **unloaded**: a page loads only when you open it, so startup stays fast even with 30 pull requests.
- **Idempotent**:
  - Every tab the extension creates carries a marker stored with the session (`sessions.setTabValue`), which survives session restore. Group titles and IDs are never used to identify managed tabs.
  - On refresh, a tab whose pull request is still listed is kept as is, including the page you are reading. A tab whose pull request is gone is closed, and new ones are added. Tabs you opened yourself are never touched.
- The toolbar badge shows `…` while loading and `!` on error. The tooltip explains the error: invalid token, missing permissions, SAML SSO, rate limit with its reset time, timeout, network.
- Optional periodic refresh (every N minutes).
- English and French user interface.

## Requirements

Firefox **140 or later** on desktop. The extension uses `tabs.group()` and the `tabGroups` API. Firefox for Android does not support tab groups.

## Installation

Firefox only installs signed extensions permanently. The extension reacts to browser startup, so it has to be installed permanently to be useful.

1. Sign the extension as an unlisted add-on (see [Signing](#signing-with-addonsmozillaorg)). You get an `.xpi` file in `web-ext-artifacts/`.
2. In Firefox, open `about:addons`, click the gear icon, choose **Install Add-on From File…**, then select the `.xpi`.
3. The options page opens: paste a token (see below), check the organization, then click **Save and run**.

To try it without signing, load `src/manifest.json` from `about:debugging#/runtime/this-firefox` (**Load Temporary Add-on**), or run `npm start`. Temporary add-ons are removed when Firefox closes.

## Creating a GitHub token

The token stays in the extension's local storage. It is sent only to `https://api.github.com`, and it is never logged or displayed. Read-only access is enough.

### Fine-grained token (recommended)

1. Open [Settings → Developer settings → Fine-grained tokens → Generate new token](https://github.com/settings/personal-access-tokens/new).
2. **Resource owner**: the organization (for example `decider`). The organization may require an admin to approve the token.
3. **Repository access**: _All repositories_, or the repositories you work on.
4. **Repository permissions**: **Pull requests: Read-only**. GitHub adds **Metadata: Read-only** automatically.

A fine-grained token only covers one resource owner. Review requests from other organizations are not visible with it. Use a classic token if you need several organizations.

### Classic token

1. Open [Settings → Developer settings → Tokens (classic) → Generate new token](https://github.com/settings/tokens/new?scopes=repo&description=PR%20Tab%20Groups).
2. Scope: **`repo`**. Classic tokens have no read-only scope for private repositories. If you only need public repositories, select no scope at all.
3. If the organization enforces SAML single sign-on, click **Configure SSO**, then **Authorize** next to the organization.

## Options

| Option                      | Default   | Description                                                            |
| --------------------------- | --------- | ---------------------------------------------------------------------- |
| Personal access token       | —         | Required. Leave the field empty to keep the saved token.               |
| Organization                | `decider` | Filters your pull requests. Leave empty to include every organization. |
| Limit review requests to it | on        | Applies the organization filter to review requests too.                |
| Fixed page                  | empty     | URL opened at startup unless already open. Leave empty to disable.     |
| Pin the fixed page          | on        | Opens the fixed page as a pinned tab.                                  |
| Startup delay               | 5 s       | Wait before loading (0–30 s), for example to let the network come up.  |
| Refresh automatically every | 0         | Minutes between automatic refreshes. 0 disables it, the minimum is 5.  |

The searches are equivalent to these GitHub queries:

```text
is:pr is:open archived:false author:<you> org:<organization>
is:pr is:open archived:false review-requested:<you> [org:<organization>]
```

## Permissions

| Permission  | Why                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `storage`   | Stores the settings and the token locally (`storage.local`).                                                                |
| `tabs`      | Reads tab URLs to know whether the fixed page is already open, and whether a managed tab still shows a listed pull request. |
| `tabGroups` | Sets each group's title, color and collapsed state.                                                                         |
| `sessions`  | Marks the tabs the extension creates, so they are recognized after a browser restart.                                       |
| `alarms`    | Schedules the optional periodic refresh.                                                                                    |

**No host permission.** The GitHub REST API allows cross-origin requests from any origin ([CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)), so the extension does not need access to `api.github.com` or to any web page.

The extension uses the default Content Security Policy and declares no data collection (`data_collection_permissions: none`). Your token goes only to GitHub, which you authorized.

## Signing with addons.mozilla.org

1. Create API credentials at <https://addons.mozilla.org/developers/addon/api/key/>.
2. Export them as environment variables. Never commit them: `.env` files are git-ignored.

   ```sh
   export WEB_EXT_API_KEY="user:12345:67"
   export WEB_EXT_API_SECRET="..."
   ```

3. Sign the extension as an unlisted add-on:

   ```sh
   npm run sign
   ```

   The signed `.xpi` is written to `web-ext-artifacts/`.

The extension ID is `pr-tab-groups@thibaud` (`browser_specific_settings.gecko.id` in `src/manifest.json`). Choose your final ID before the first signing: AMO ties an ID to its first uploader. Every new upload also needs a higher `version` in `src/manifest.json`.

## Development

Requires Node.js 22 (`nvm use`).

```sh
npm install
npm start          # launch Firefox with the extension, reloads on change
npm run start:clean  # same, with a fresh development profile
npm test           # unit tests (Vitest)
npm run lint       # ESLint + Prettier check + web-ext lint
npm run typecheck  # JSDoc type checking with tsc
npm run format     # Prettier + ESLint autofix
npm run build      # package to web-ext-artifacts/
```

`npm start` runs Firefox with a development profile stored in `.web-ext-profile/` (git-ignored), so the token and settings survive between runs. This also keeps it working with the Ubuntu **snap** of Firefox: the snap has a private `/tmp` and cannot read the temporary profile web-ext creates there by default ("Your Firefox profile cannot be loaded"). Delete the folder, or run `npm run start:clean`, to start over.

There is no build step. The extension is plain JavaScript loaded as native ES modules from `src/`. Types are JSDoc annotations checked by `tsc --noEmit` (`// @ts-check`).

### Layout

```text
src/
  manifest.json
  background/
    main.js        event listeners: startup, toolbar, alarms, messages
    refresh.js     orchestration (browser APIs and GitHub client are injected)
    schedule.js    periodic refresh alarm
    badge.js       toolbar badge and tooltip
  lib/             pure logic, no browser.* or network calls
    settings.js    defaults, normalization, validation
    queries.js     GitHub search queries
    github.js      REST client: login, paginated search, errors, timeout
    errors.js      error classification and user-facing messages
    mapping.js     search results to tabs
    groups.js      group planning and reconciliation of managed tabs
  options/         options page
  _locales/        en, fr
test/              Vitest unit tests and a minimal in-memory browser mock
```

### Testing the startup behavior

`npm start` loads the extension as a temporary add-on, and `runtime.onStartup` does not fire for a temporary add-on. To test a real startup:

- install the signed `.xpi`, open a few pull requests, restart Firefox, then check that the groups are replaced and not duplicated;
- or use Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false`, and install the unsigned package from `npm run build`.

### Releasing

1. Bump `version` in both `src/manifest.json` and `package.json`.
2. Update `CHANGELOG.md`.
3. Tag the commit with `vX.Y.Z`. The release workflow checks the versions, runs the checks, builds the package and attaches it to a GitHub release.

## License

[MIT](LICENSE) © Thibaud
