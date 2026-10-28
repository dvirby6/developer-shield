# Developer Shield

A local-first security desktop app for developers. Developer Shield scans code
for leaked credentials, reports pre-commit protection status, and redacts
secrets before code is pasted into an AI assistant.

The UI ships as a Tauri desktop window (Windows/macOS/Linux) and also runs in the
browser during development. No code, secret, or telemetry leaves the machine.

## MVP features

- **Dark developer dashboard** — live shield status, pre-commit hook state,
  last scan time, and a feed of recently scanned files.
- **Local secret scanner** — regex rules for OpenAI (`sk-proj-…`), GitHub
  (`ghp_…`, `github_pat_…`), AWS access/secret keys, Stripe, Slack, Google,
  JWTs, PEM private keys, and generic hard-coded credentials.
- **Native folder scanning (desktop)** — **Run scan** opens the OS folder picker,
  walks the selected project recursively, honours `.gitignore`, skips
  `node_modules`/build output/binaries, and streams findings into the Scans
  table. Nothing outside the picked folder is read.
- **Pre-commit guardrail** — installs a `.git/hooks/pre-commit` script that
  blocks staged secrets, preserving any existing hook as a `.bak` file.
- **AI sanitizer** — replaces findings with stable `[REDACTED_ID]` tokens and
  keeps an in-memory de-anonymisation map so responses can be restored locally.
- **Interactive playground** — paste code, sanitize it, inspect the temporary
  mapping, and simulate restoration.
- **Screen-fit workspace** — fixed viewport shell with no page scroll. Only the
  scans table and sanitizer code panes scroll internally. The sidebar collapses
  automatically below 1280px, the details panel becomes a drawer below 1280px,
  and the sanitizer switches to Input/Output/Mapping tabs on narrow windows.

## Commands

```bash
npm install
npm run dev          # start Vite on http://localhost:1420
npm run desktop      # launch the Tauri desktop app (starts Vite automatically)
npm run build        # TypeScript project build + production bundle
npm run lint         # ESLint
npm run preview      # preview the production bundle
npm run desktop:build # build a desktop binary/installer
```

## Project layout

```text
src/
  App.tsx                  desktop shell, workspace views, scan orchestration
  components/              topbar, sidebar, scans table, sanitizer, drawers
  data/demo.ts             fake workspace fixtures (all credentials are fake)
  data/navigation.ts       workspace view definitions
  hooks/useMediaQuery.ts   native window-width subscriptions
  services/desktop.ts      native folder picker + runtime fs-scope bridge
  utils/scanner.ts         secret patterns, entropy scoring, recursive scan
  utils/gitignore.ts       .gitignore matcher used by the folder walker
  utils/preCommit.ts       Git hook inspection and installation
  utils/preCommitScript.ts generated pre-commit shell script
  utils/sanitizer.ts       redaction, mapping, restoration
  utils/time.ts            relative time formatting
src-tauri/
  tauri.conf.json          window, CSP, bundle, and dev/build configuration
  capabilities/default.json command permissions; fs scope granted at runtime
  src/                     Tauri Rust entry point and plugins
```

## Desktop permissions

`src-tauri/capabilities/default.json` grants command access only — no static
filesystem paths are pre-authorized:

- **Folder picker** — `dialog:allow-open` opens the native directory chooser.
- **Runtime filesystem scope** — the `allow_directory` command validates the
  picked folder and adds it to the fs plugin's runtime scope. Directory
  listing, file reads, `stat`/`exists`, and the two hook-write commands
  (`writeTextFile`, `mkdir`) are limited to folders the user selected.
- **Linked worktrees** — when `.git` is a pointer file, the git directory
  outside the workspace is granted explicitly before the hook is written.
- `mark_executable` — sets `0755` on Unix and refuses any filename other than
  `pre-commit`.

`plugins.fs.requireLiteralLeadingDot` is disabled so the runtime scope can
reach dotfiles (`.env`, `.gitignore`, `.git/`) on macOS and Linux, where the
default would hide them.

The window CSP allows only local assets and IPC; the dev CSP additionally allows
the Vite HMR socket. No remote origins are permitted.

## Security notes

- The scanner is heuristic. A clean result is not a guarantee that a file is
  secret-free; review findings before committing.
- The sanitizer mapping lives in memory for the current session only and is
  discarded on refresh.
- The dashboard shows demo fixtures until a folder is picked; after that every
  row comes from the local scan of the selected project.
