# AnaBodhi

One shared Anatomy question bank by Sunil Mathew. **The same plugin is used by the teacher and every student. Google Sheets is the master.**

[Master Google Sheet](https://docs.google.com/spreadsheets/d/1Do_rqCkcn2Picm09r9z0EQ6lTbCJ9yESr6MfBxlBw20/edit) · [Public source](https://github.com/drmathewsgit/pyq-sync)

## Use

1. Install **AnaBodhi** in RemNote after marketplace approval.
2. Open **AnaBodhi** from the sidebar or RemNote command search.
3. Press **Sync**.

The plugin creates its own question-bank document, regional documents and lecture documents automatically. No separate computer program, Node.js, personal link, API key, connection file, Google login or Codex is required. It needs an internet connection to receive updates. Once imported, cards are stored in your RemNote knowledge base.

## What Sync does

- Reads the fixed shared Google Sheet. It never uploads your cards or edits the sheet's learning content.
- Places completed question–answer pairs under **AnaBodhi → Region → Lecture**. Lecture titles retain AN competency codes; lecture and question order follow the sheet.
- Accepts typed answers and completed AI answers equally. Blank, pending, review and error answers are skipped; existing completed cards remain until a valid replacement is available.
- Recreates cards trashed in RemNote when their completed source question still exists in Google Sheets. Trash is not counted as an active copy. Recreated cards start fresh review history; ordinary updates keep existing history.
- Updates the same card when the sheet's question, answer or lecture changes. The plugin does not reset its review history.
- Replaces direct edits to synced question/answer text with the sheet's version on the next sync. Put corrections in the master sheet. Additional child notes remain during updates.
- Removes extra locally created flashcards inside the AnaBodhi collection after two complete, consistent reads of the master sheet. Create new questions in Google Sheets. Plain notes and lecture documents are not classified as extra flashcards; notes outside the collection are never scanned.
- Moves a synced card, including its child notes, to RemNote Trash when its question row is physically deleted and a second complete source read confirms that deletion.
- Handles inserted rows and repeat syncs without creating duplicates. Invalid headers, ambiguous identities or incomplete reads stop safely or report the affected item.

Use Sync on **one device/window at a time**. Keep the Sync panel open until it finishes. Then select **Close** at the top right, or press **Escape**, to return to your notes. Closing the panel does not delete your cards or quit the Mac helper. Let RemNote's account sync complete before switching devices. Progress and card mappings belong to each user's knowledge base; students do not share their review history.

## Desktop and mobile

This hosted package has mobile support enabled and a responsive panel. It uses RemNote's API and browser networking, with no local server or desktop-only helper. The same package is intended for supported desktop, web and mobile RemNote clients after approval. Actual mobile installation and syncing still require testing in the approved app; mobile enablement alone is not a compatibility certification.

## Release status and submission

Version **1.0** is prepared for marketplace review, not yet approved. The ZIP is a submission artifact: the publisher uploads it through **Settings → Plugins → Build → Upload plugin**. Students install the approved plugin through RemNote; they do not set up the source code or upload their own copy. RemNote's review decision and publication timing are outside this plugin's control.

The older personal **PYQ Sync** development plugin is a separate installation. This package starts from the current Google Sheet and does not migrate old plugin data or review history. The sheet decides the synced content; the plugin never edits the sheet's questions or answers.

## Privacy and permissions

The plugin retrieves public anatomy learning content from a fixed Google Apps Script service maintained by the teacher. It sends no RemNote card IDs, notes, answers, credentials or review history to that service. Google may receive ordinary request metadata. The service assigns stable invisible question identities in the source sheet; the public reader does not expose the teacher's private RemNote card links or provide a content-writing endpoint.

Requested permissions: read/create/modify/delete within the plugin's own **smAnatPyqBank** Powerup and descendants, plus the current knowledge-base identity. This enables automatic setup and limits card edits to the plugin's collection. Do not tag unrelated notes with this Powerup. The plugin does not request access to every note in your account.

The teacher maintains the shared Google Sheet and hosted feed once for the whole class. No student-side service setup is needed. Service outages or Google quotas can temporarily delay syncing; existing imported cards remain in RemNote.

## Downloads

- [Marketplace submission ZIP](https://github.com/drmathewsgit/pyq-sync/raw/refs/heads/main/AnaBodhi-1.0-RemNote-upload.zip) — publisher submission for review.
- [Direct Mac package](https://github.com/drmathewsgit/pyq-sync/raw/refs/heads/main/AnaBodhi-1.0-NonMP-Mac.zip) — download, open the included helper app, and follow [NonMP installation instructions](NonMP-README.md).

## Developer build

The current source is the root-level `qbank-*` files. Run `pnpm install`, `pnpm test`, and `pnpm build` to produce `dist`. Package the contents of `dist` at the ZIP root for marketplace review. On a Mac with Apple command-line developer tools, `python3 build-nonmp-mac.py` builds the optional universal direct-install helper. Students do not need these tools. Legacy `src/`, `upload-src/`, `server.mjs`, and `build-upload.mjs` files are not used by AnaBodhi.
