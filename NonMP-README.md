# AnaBodhi 1.0 — direct Mac installation (NonMP)

This is the direct-install package for **RemNote Desktop on macOS 11 or later**, including Apple Silicon and Intel Macs. It contains the compiled plugin and a native Mac helper. No Node.js, coding tools, Google sign-in, API key or connection file is needed. The Google Sheet is already configured.

## Install

1. Download and extract **AnaBodhi-1.0-NonMP-Mac.zip**.
2. Drag **AnaBodhi NonMP.app** to Applications, then open it. A **AnaBodhi** item appears in the Mac menu bar. Keep this app running while using the plugin.
3. Open RemNote Desktop → Settings → Plugins → Build → **Develop from localhost**.
4. Enter **http://localhost:27183**. Allow the requested access to the AnaBodhi collection and knowledge-base identity.
5. Close Settings. Open **AnaBodhi** and press **Sync**. Region and lecture documents are created automatically.

Disable the old **PYQ Sync 1.1.4** plugin if it is still installed. Its saved Anatomy PYQ folder is specific to the old personal setup; this package does not use that folder ID. This package creates its own AnaBodhi collection. It does not migrate the older plugin's card links or review history.

This ZIP is not for the **Upload plugin** button. Upload plugin submits a package for marketplace review. Use Develop from localhost for this package.

## First opening on macOS

This locally built app is not Apple-notarized. macOS may ask you to approve it. If blocked, inspect the message and use the system's normal **Privacy & Security → Open Anyway** option only if you trust this package. No script disables Gatekeeper or changes your security settings. If your Mac is managed by an institution, its administrator may need to approve the app.

## One-way sync

Google Sheets is the master. Add new questions and edit answers in the sheet. Sync updates the corresponding RemNote cards in place, preserving their review history. A card trashed in RemNote is recreated when its completed source question still exists; that new card starts fresh review history. Deleted sheet questions and extra flashcards created inside AnaBodhi move to RemNote Trash after a complete, consistent source check. Documents and plain notes are not treated as extra flashcards. Other collections are untouched.

Unfinished, blank or error answers wait in Sheets; existing completed cards are retained. Keep the Sync panel open until it finishes. Use Sync on one device/window at a time and let RemNote's account sync finish before switching devices.

## Each time you use it

Open **AnaBodhi NonMP.app** before RemNote. After a restart, open it again. Use **AnaBodhi → Quit helper** to stop it. The helper listens only on your own Mac, at port 27183; it does not access your notes or hold a private connection key. RemNote's plugin reads the fixed hosted class feed directly.

This direct package cannot run on iPhone, iPad, Android, Windows or Linux. Your imported cards can still be studied on other devices through your RemNote account. For syncing inside the mobile app, use the marketplace package once approved and tested. Do not enable the local and marketplace installations simultaneously.

[Source repository](https://github.com/drmathewsgit/pyq-sync)
[RemNote direct development installation](https://plugins.remnote.com/getting-started/quick_start_guide)
[RemNote marketplace/unlisted review requirements](https://plugins.remnote.com/advanced/unlisted_plugins)
