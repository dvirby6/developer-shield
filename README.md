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
  App.tsx                  desktop shell, workspace views, scan simulation
  components/              topbar, sidebar, scans table, sanitizer, drawers
  data/demo.ts             fake workspace fixtures (all credentials are fake)
  data/navigation.ts       workspace view definitions
  hooks/useMediaQuery.ts   native window-width subscriptions
  utils/scanner.ts         secret patterns, entropy scoring, scan helpers
  utils/sanitizer.ts       redaction, mapping, restoration
  utils/time.ts            relative time formatting
src-tauri/
  tauri.conf.json          window, CSP, bundle, and dev/build configuration
  capabilities/default.json read-only filesystem + pre-commit shell scope
  src/                     Tauri Rust entry point and plugins
```

## Desktop permissions

`src-tauri/capabilities/default.json` grants the minimum needed for the local
workflow:

- **Filesystem (read-only)** — `fs:allow-read-text-file`, `fs:allow-read-file`,
  `fs:allow-read-dir`, `fs:allow-stat`, and `fs:allow-exists`, scoped to
  `$HOME`, `$APPDATA`, and `$RESOURCE`.
- **Pre-commit hook** — `shell:allow-execute` scoped to the single command
  `git hook run pre-commit`.

The window CSP allows only local assets and IPC; the dev CSP additionally allows
the Vite HMR socket. No remote origins are permitted.

## Security notes

- The scanner is heuristic. A clean result is not a guarantee that a file is
  secret-free; review findings before committing.
- The sanitizer mapping lives in memory for the current session only and is
  discarded on refresh.
- The dashboard uses demo fixtures. Wire `scanFiles()` to real file content
  (for example through a local CLI or editor integration) for production use.
