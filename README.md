# Developer Shield

**Catch leaked secrets before they ship — local-first by default.**

Developer Shield is a local-first security desktop app for developers. It scans
repositories for credentials, installs a Git pre-commit guardrail, keeps a local
audit trail with exportable compliance reports, and redacts secrets before code
is pasted into an AI assistant.

**Local-first by default. 0 accounts. 0 telemetry. No source code or raw secret
ever leaves the machine.** Local LAN / P2P Sync is strictly opt-in: it uploads
only a passphrase-encrypted snapshot of custom rules and masked scan history.

Built with React, Vite, Tauri, and Rust. Ships as a native window on Windows,
macOS, and Linux; the same UI also runs in a browser during development.

---

## Table of contents

- [Why Developer Shield](#why-developer-shield)
- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Custom detection rules](#custom-detection-rules)
- [Scan history and reports](#scan-history-and-reports)
- [Local LAN and P2P sync (opt-in)](#local-lan-and-p2p-sync-opt-in)
- [Pre-commit hook](#pre-commit-hook)
- [Security model](#security-model)
- [Local data](#local-data)
- [Commands](#commands)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

---

## Why Developer Shield

Secrets leak through the small stuff: a debug `console.log`, a copied `.env`
line, a pasted stack trace. Hosted scanners catch them after the push — usually
after the credential has already been indexed.

Developer Shield moves that check earlier and keeps it private:

- **Local-first by architecture.** Scanning, redaction, history, and report
  generation all run on your machine. There is no backend to trust.
- **Zero cloud cost.** No seats, no API keys, no per-scan billing.
- **Zero data leakage by default.** Scan data stays on the machine until you
  explicitly enable sync. Reports persist masked values, never raw secrets.
- **Guardrails, not just dashboards.** One click writes a pre-commit hook into
  every Git repository in the workspace.

## Features

- **Recursive folder scanning** through the native OS folder picker.
  `.gitignore` rules (including negation), symlinks, binary files, and
  dependency/build directories are handled locally.
- **10 built-in rule packs** for OpenAI, GitHub, AWS, Stripe, Slack, Google,
  JWTs, PEM private keys, and generic hard-coded credentials, backed by Shannon
  entropy scoring and placeholder suppression.
- **Custom regex rules** with live validation and sample matching, persisted
  locally and embedded into the pre-commit hook.
- **Git guardrails** for multi-repo workspaces, linked worktrees, submodules,
  detached HEAD, and custom `core.hooksPath` layouts. Existing hooks are backed
  up, never silently destroyed.
- **Scan history and compliance reports.** Every scan is capped, stored locally,
  and exportable as masked JSON or a print-ready A4 PDF.
- **Opt-in encrypted Local LAN / P2P sync.** Push or pull custom rules and
  masked scan history over HTTPS or a private LAN address as an AES-256-GCM
  snapshot. The passphrase never leaves memory, and the peer only ever receives
  ciphertext.
- **AI sanitizer.** Replaces secrets with stable `[REDACTED_ID]` tokens and keeps
  the de-anonymisation map in memory for the current session only.
- **Screen-fit desktop UI** with a dark developer dashboard, responsive drawers,
  and keyboard-dismissable dialogs.

## Screenshots

Screenshots and a GIF walkthrough will live in
[`docs/screenshots/`](docs/screenshots/). The expected assets are:

| File | Content |
| --- | --- |
| `docs/screenshots/overview.png` | Dashboard with a completed scan |
| `docs/screenshots/rules-builder.png` | Custom rule modal with a live match |
| `docs/screenshots/history-report.png` | History entry with export actions |
| `docs/screenshots/sanitizer.png` | Sanitizer output and redaction mapping |

Contributions of polished captures are welcome — use only the fictional
credentials from `src/data/demo.ts`.

## Architecture

```text
┌────────────────────────────── React + Vite ──────────────────────────────┐
│  Overview · Scans · History · Sanitizer · Guardrails                     │
│                                                                          │
│  utils/scanner.ts      regex packs · entropy · gitignore-aware walk      │
│  utils/customRules.ts  user rules · validation · previews                │
│  utils/history.ts      masked audit trail model                          │
│  services/report.ts    JSON + print-ready PDF reports                    │
│  services/encryption.ts AES-GCM + PBKDF2 snapshot envelopes             │
│  services/cloudSync.ts opt-in encrypted push/pull transport              │
│  services/storage.ts   app-data JSON files (localStorage fallback)       │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ Tauri IPC (local only)
┌──────────────────────────────────▼───────────────────────────────────────┐
│  Rust core (src-tauri)                                                   │
│                                                                          │
│  allow_directory            runtime fs scope for the picked folder       │
│  git_hook_info              resolves hooks via `git rev-parse`           │
│  discover_git_repositories  multi-repo / workspace detection             │
│  write_export_file          bounded JSON/HTML report writer              │
│  mark_executable            makes the hook executable on macOS/Linux     │
│                                                                          │
│  plugins: fs (runtime scope) · dialog (open/save) · log (debug only)     │
└──────────────────────────────────────────────────────────────────────────┘
```

Scanning never crosses the IPC boundary except for file reads inside the
runtime-scoped folder. There is no background network client. The only outbound
traffic is a user-triggered push or pull to the sync endpoint they configured.

## Quick start

### Prerequisites

- **Node.js 24+** and npm
- **Rust 1.90+** with Cargo
- Platform toolchain:
  - **Windows:** WebView2 (installed on current Windows) and MSVC Build Tools
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`,
    `librsvg2-dev`, `patchelf`, `libssl-dev`, and `build-essential`

### Run the desktop app

```bash
git clone <your-fork-or-repository-url>
cd developer-shield
npm install
npm run desktop
```

`npm run desktop` starts Vite and opens the native window.

### Run the web preview

```bash
npm install
npm run dev
```

Native folder scanning and hook installation require the desktop shell. The
browser preview renders the demo workspace and allows rule building, sanitizing,
and report previews.

### Build installers

```bash
npm run desktop:build
```

Artifacts land in `src-tauri/target/release/bundle/`. The release workflow in
`.github/workflows/release.yml` builds Windows, macOS (universal), and Linux
bundles on tag pushes.

## Usage

1. **Scan a project.** Open **Overview** or **Scans** and press **Run scan**.
   Pick a folder in the native dialog. Developer Shield walks the tree, applies
   `.gitignore`, and streams progress.
2. **Review findings.** The Scans table lists the riskiest files first, with
   severity, masked values, line context in the history report, and per-file
   status.
3. **Protect the repository.** In **Guardrails**, press **Install hooks**. Every
   Git repository detected in the workspace receives a `pre-commit` hook. Existing
   hooks are backed up as `pre-commit.developer-shield.bak`.
4. **Add custom rules.** In **Guardrails → Detection rules**, choose **Add rule**,
   enter a regex and test sample, and save. Rules apply to new scans, sanitizer
   runs, and newly installed hooks.
5. **Export evidence.** Open **History**, expand a scan, and export JSON or a
   print-ready PDF. The PDF uses the system print dialog — choose *Save as PDF*.
6. **Sanitize AI prompts.** Paste code into **Sanitizer**, run it, and copy the
   redacted output. Restore tokens locally after the AI responds.
7. **Sync across devices (optional).** In **Guardrails → Local sync**, enter an
   HTTPS or private-LAN HTTP endpoint and a passphrase, enable sync, then push
   or pull. Snapshots are encrypted locally before upload; pull replaces local
   rules and history only after confirmation.

## Custom detection rules

Custom rules are plain JavaScript regular expressions evaluated locally.

Example — an internal API key format:

```text
Rule name: Acme internal key
Pattern:   acme_(live|test)_[A-Za-z0-9]{24}
Severity:  Critical
Sample:    ACME_API_KEY=acme_live_9f3k2m8q7x1p4v6n
```

Rules are validated as you type:

- Empty or multi-line patterns are rejected.
- Patterns that match empty text are rejected to keep the scanner's match loop
  bounded.
- Pattern length is capped at 400 characters; up to 50 custom rules are stored.
- A live preview shows matches against your sample.

Custom rules are stored in the app data directory and embedded into the
pre-commit hook's ERE pattern pack at install time. Reinstall the hook after
editing rules. Case-insensitive rules are scanned in a separate `grep -i` pass.

## Scan history and reports

- Each completed folder scan becomes a history entry (newest first, 25 entries
  retained).
- Only flagged files and **masked** values are persisted. Raw secrets never hit
  disk.
- Exports include:
  - **JSON** — machine-readable report with scan metadata, severity counts, and
    masked findings. Saved through the native save dialog.
  - **PDF** — an A4 compliance report rendered locally, then printed or saved via
    the operating system's PDF printer.
- Entries can be deleted individually, or all history cleared.

## Local LAN and P2P sync (opt-in)

Local LAN / P2P Sync moves **custom rules and masked scan history** between
devices on your network. It is off until you configure it, and every transfer is
manual.

1. Open **Guardrails → Local sync**.
2. Enter an endpoint that accepts a `PUT` and `GET` for the same URL. Use HTTPS
   for public hosts. Plain HTTP is accepted for `localhost`, `.local` names,
   single-label device hostnames (`http://nas:8080/sync`), and private addresses
   (`10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`).
3. Enter a passphrase of at least 8 characters. The enable toggle unlocks as
   soon as the endpoint is valid and the passphrase is entered, then press
   **Push snapshot** or **Pull snapshot**.

Protocol and storage:

- `PUT <endpoint>` receives one JSON envelope; `GET <endpoint>` returns it.
- The peer must allow cross-origin `GET`, `PUT`, and `OPTIONS` requests.
- Rules and history are serialised locally, encrypted with AES-256-GCM using a
  PBKDF2-derived key (600,000 iterations, fresh salt and IV per sync), and only
  then uploaded. The peer sees an opaque `developer-shield.e2e` envelope.
- The passphrase lives in component memory only. It is cleared after a
  successful sync and is never written to `sync.json`, logs, or request headers.
- `sync.json` stores only `enabled`, `endpoint`, `lastSyncedAt`, and
  `lastDirection`.
- **Pull is destructive after confirmation:** it replaces local custom rules and
  scan history with the decrypted snapshot. The wrong passphrase or a tampered
  envelope fails authentication and leaves local state untouched.
- Endpoint validation is enforced in the UI and again in the transport layer.
  Public plain-HTTP hosts are rejected; URLs with embedded credentials or
  fragments are rejected.

## Pre-commit hook

The hook scans **staged blobs** (`git show :file`), not the working tree, so a
secret that was staged and later edited out of the file is still blocked.

Covered scenarios:

- normal clones and the initial commit (unborn `HEAD`)
- linked worktrees and submodules (`git rev-parse --git-path hooks`)
- repositories using `core.hooksPath`
- detached `HEAD` (the staged diff does not need a branch)
- multi-repository workspaces and monorepos (one hook per repository)
- file names quoted by Git (`core.quotePath=false`, NUL-separated list)

The hook only needs POSIX `sh`, `git`, `grep`, `tr`, and `sed`. It does not call
back into the app.

Bypass options:

```bash
git commit --no-verify          # bypass this commit
DEVELOPER_SHIELD_SKIP=1 git commit   # skip the scan, keep other hooks' behaviour
```

## Security model

- **Runtime filesystem scope only.** No static `$HOME/**` grant. The native
  picker adds the selected folder to the Tauri fs scope; Git hook paths are added
  after `git rev-parse` resolves them.
- **App data is separate.** Custom rules and history live under the app's data
  directory, reachable only through scoped fs permissions.
- **CSP is local by default.** `default-src 'self'`, IPC, and local assets.
  `connect-src` permits HTTPS and HTTP so a configured LAN peer can be reached;
  endpoint validation rejects public plain-HTTP hosts before any request.
- **Sync is end-to-end encrypted.** Custom rules and masked scan history are
  encrypted before upload. The passphrase stays in memory and is never stored.
- **Pull validates before replacing state.** Decrypted snapshots must match the
  supported schema; wrong passphrases and tampered ciphertext fail AES-GCM
  authentication.
- **Reports are masked.** The JSON and PDF exports contain masked matches, never
  raw secrets.
- **Sanitizer mappings are ephemeral.** They live in memory and are discarded on
  refresh.
- **The scanner is heuristic.** A clean scan is not proof that a repository is
  secret-free. Review findings before committing.

## Local data

Desktop state lives under the Tauri app data directory:

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%\com.developershield.app\state\` |
| macOS | `~/Library/Application Support/com.developershield.app/state/` |
| Linux | `$XDG_DATA_HOME/com.developershield.app/state/` (usually `~/.local/share/...`) |

Files:

- `rules.json` — custom detection rules
- `history.json` — masked scan history
- `sync.json` — sync endpoint, enable flag, and last-sync metadata only

The browser build falls back to `localStorage` under the `developer-shield:`
prefix.

## Commands

```bash
npm install          # install frontend dependencies
npm run dev          # Vite dev server (http://localhost:1420)
npm run desktop      # native Tauri app (starts Vite automatically)
npm run build        # TypeScript project build + production bundle
npm run lint         # ESLint
npm test             # encryption + local sync unit tests (Node test runner)
npm run preview      # preview the production web bundle
npm run desktop:build # build native installers

# Rust checks
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Project layout

```text
src/
  App.tsx                    app shell, scan orchestration, state wiring
  components/                topbar, sidebar, tables, rules, history, dialogs
  components/CloudSyncPanel.tsx  opt-in sync configuration and actions
  data/app.ts                version and product constants
  data/demo.ts               fictional workspace fixtures
  data/navigation.ts         workspace views
  hooks/useCloudSync.ts      sync state, status, and push/pull actions
  hooks/useMediaQuery.ts     native window-width subscriptions
  services/desktop.ts        Tauri dialog/scope bridges
  services/cloudSync.ts      endpoint validation and encrypted transport
  services/encryption.ts     local E2E encryption (AES-GCM + PBKDF2)
  services/report.ts         JSON + print-ready PDF reports
  services/storage.ts        local state persistence (app data / localStorage)
  utils/customRules.ts       custom rule validation and previews
  utils/gitignore.ts         dependency-free .gitignore matcher
  utils/history.ts           masked scan history model
  utils/preCommit.ts         multi-repo hook inspection and installation
  utils/preCommitScript.ts   POSIX hook generator (custom rules embedded)
  utils/scanner.ts           secret patterns, entropy, recursive scan
  utils/sanitizer.ts         redaction, mapping, restoration
  utils/time.ts              relative and absolute time formatting
src-tauri/
  src/lib.rs                 Tauri commands, Git discovery, report writer
  capabilities/default.json  runtime scopes and plugin permissions
  tauri.conf.json            window, CSP, bundle, and plugin configuration
  icons/                     platform icons
.github/
  workflows/ci.yml           lint, build, clippy, tests on all platforms
  workflows/release.yml      draft installers on version tags
  FUNDING.yml                sponsorship template
docs/screenshots/            screenshot placeholders and capture guide
```

## Contributing

Contributions are welcome — bug reports, rule packs, documentation, and UI
polish alike.

1. Fork the repository and create a focused branch:
   `feat/rule-import`, `fix/hook-worktree`.
2. Install dependencies with `npm install`.
3. Make your change. Keep fixtures fictional and never commit real credentials.
4. Run the gates locally:
   ```bash
   npm run lint
   npm run build
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
5. Open a pull request describing the problem, the approach, and how you
   verified it. Screenshots or a short screen recording help for UI changes.

Guidelines:

- Keep pull requests small and focused; one concern per PR.
- Match the existing TypeScript/Rust style and the dark UI design system.
- Add or update documentation when behaviour changes.
- Never add background network calls, telemetry, or static filesystem scopes.
  User-triggered encrypted sync to a configured endpoint is the only outbound
  traffic allowed.
- Security-sensitive changes (hook script, Rust commands, capabilities) need a
  clear threat-model note in the PR.

## License

[MIT](LICENSE) © 2026 Developer Shield contributors.

Developer Shield is a heuristic guardrail, not a substitute for a professional
security audit. Use it as one layer of a defence-in-depth strategy.
