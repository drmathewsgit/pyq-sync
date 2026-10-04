# PYQ Sync

A personal RemNote plugin that syncs the owner's PYQ Google Sheet into the existing Anatomy PYQ folder with one button.

Source repository: https://github.com/drmathewsgit/pyq-sync
Version: 1.1.1

## Install and connect

1. Submit the built plugin ZIP through RemNote Settings → Plugins → Build → Upload plugin. Keep the ZIP compressed. RemNote reviews JavaScript plugins, including unlisted plugins; a correctly packaged ZIP does not guarantee approval.
2. After RemNote permits installation, open the existing knowledge base containing Anatomy PYQ.
3. Open PYQ Sync in the sidebar, or use the “Open PYQ Sync” command.
4. Import the separately supplied “PYQ Sync connection - PRIVATE.json” once on this device.
5. Click “Sync PYQ now” and keep the panel open until it finishes.

Disable the older localhost installation before switching to the hosted build. Both use the same plugin ID. Run only one installation/device at a time.

This upload build connects directly to Google Apps Script and does not require Codex or the Mac helper running. The existing localhost installation is an alternative personal installation while review is pending.

## What sync does

- Reads the fixed PYQ sheet's 11 anatomy tabs and L load lecture ordering.
- Creates cards only for questions with usable answers; blank answers, formulas, AI errors and REVIEW responses wait in Google Sheets.
- Preserves numbered answer lines, region grouping and lecture/question order.
- Updates existing mapped cards in place, retaining their identity and practice history.
- Keeps conflicting manual edits and removed questions for review; it does not delete cards.
- Writes verified card links to the existing Remnotes column and uses whole-row developer metadata for persistent question identity.

This is a manual, one-way content sync when the user presses Sync. It does not generate answers or schedule background synchronization. Google Sheets supplies the question and answer text; RemNote card IDs are written back to Google Sheets.

## Privacy and external services

The plugin sends authenticated requests to the owner's fixed Google Apps Script deployment at script.google.com; ContentService responses redirect to script.googleusercontent.com. The connector reads the fixed Google Sheet and writes card links to that sheet. Google receives the connector key and source/card-ID mappings. Questions and answers are read from Google into RemNote. There is no analytics, advertising, external AI service, or third-party proxy.

The connection key is not included in the source repository or plugin ZIP. It is imported separately and stored per-device using RemNote's local plugin storage. Do not publish private connection files, credentials or sheet snapshots. The manifest requests ReadCreateModify only for descendants of the existing Anatomy PYQ root; no delete permission is requested. The Apps Script source includes the deployed secret's SHA-256 verifier, not the secret.

This is a personal plugin tied to the owner's sheet and RemNote folder IDs. It is not a general-purpose importer for unrelated knowledge bases.

## Build

Use Node.js 20 or newer and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
cd upload-dist
zip -r ../pyq-sync-1.1.1.zip README.md manifest.json index.html index.js index-sandbox.js pyq_popup.js pyq_popup-sandbox.js App.css snippet.css
```

README.md and manifest.json must be at the ZIP root, alongside the compiled JavaScript. Do not upload the source archive through RemNote's Upload plugin button. `pnpm build:local` builds the optional localhost variant. `server.mjs` serves that variant with a private local `.connection.json` and fixed-sheet connector; that file is deliberately excluded.

The upload build checks that the manifest repository URL has a valid GitHub repository shape. For a fork, set PYQ_PUBLIC_REPO_URL to the fork's real public repository URL.

## Checks and current status

Automated tests cover connector authorization, whole-row tracking, repeat synchronization, duplicate prevention, conflict preservation, and connection validation. A browser test verified Google accepts the cross-origin simple POST transport and rejects an invalid key. The live Google connector's row-metadata fix is deployed. Hosted RemNote installation and end-to-end hosted sync still require RemNote review and live verification.

[RemNote submission requirements](https://plugins.remnote.com/advanced/submitting_plugins) · [Unlisted plugins](https://plugins.remnote.com/advanced/unlisted_plugins)
