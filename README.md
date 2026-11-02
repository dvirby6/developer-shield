# Developer Shield

Local-first secret scanning, Git pre-commit protection, and prompt redaction.
Runs as a Tauri desktop app; scanning, storage, and report generation stay on the
machine.

## Project Overview

Developer Shield checks for leaked credentials before they reach a remote. It
ships as a native desktop application with a browser preview for UI work.

- Recursive, `.gitignore`-aware folder scanning with 10 built-in detection
  patterns, entropy scoring, and placeholder suppression.
- Custom JavaScript regex rules with validation and live sample matching.
- A POSIX `pre-commit` hook that scans staged blobs across multi-repo
  workspaces, worktrees, submodules, and custom `core.hooksPath` layouts.
- Masked scan history with JSON and print-ready PDF export.
- An in-memory sanitizer that replaces secrets with `[REDACTED_ID]` tokens.
- Opt-in LAN sync of encrypted rules/history snapshots.

There is no hosted backend. The project does not use Supabase, Firebase, or any
other cloud service, and it emits no telemetry. Local state is written to the
Tauri app-data directory, with a `localStorage` fallback in the browser preview.
The only outbound request is a user-triggered push or pull to a sync endpoint
the user configures.

## Core Architecture

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript 6, Tailwind CSS 4 |
| Build | Vite 8, oxc minifier |
| Desktop shell | Tauri 2 (Rust 1.90+, edition 2024) |
| Crypto | Web Crypto API — AES-256-GCM, PBKDF2-SHA256 (600k iterations) |
| Persistence | Tauri `plugin-fs` JSON files; `localStorage` fallback |
| Backend | None — local-first; optional opaque sync endpoint only |

```text
React UI (src/)
  ├─ App.tsx                  view state, scan orchestration
  ├─ utils/scanner.ts         rule packs, entropy, recursive scan
  ├─ utils/preCommit*.ts      hook inspection, generation, installation
  ├─ utils/sanitizer.ts       redaction and token restoration
  ├─ services/report.ts       masked JSON / PDF exports
  ├─ services/encryption.ts   AES-GCM + PBKDF2 envelope
  └─ services/cloudSync.ts    endpoint validation + sync transport
        │
        ├─ services/storage.ts  app-data JSON / localStorage
        └─ services/desktop.ts  Tauri IPC (dialog, fs scope, git hooks)
                  │
          Rust core (src-tauri/src/lib.rs)
```

Design boundaries:

- Tauri commands are limited to user-initiated filesystem and Git operations.
  The native picker grants a runtime fs scope per folder; there is no static
  `$HOME/**` grant.
- Sync encrypts locally and uploads ciphertext only. Endpoints must be HTTPS, or
  HTTP on loopback, `.local`, single-label hostnames, or private LAN ranges.
- The passphrase is held in component memory, wiped after each attempt, and
  never written to disk.
- CSP defaults to `'self'`; `connect-src` is intentionally open to HTTPS/HTTP so
  a configured LAN peer can be reached.

## Quickstart

Prerequisites: Node.js 24+, Rust 1.90+ with Cargo, and the platform webview
toolchain (WebView2 on Windows, Xcode Command Line Tools on macOS, WebKitGTK on
Linux).

```bash
git clone <repository-url>
cd developer-shield
npm install
```

Run the desktop app:

```bash
npm run desktop
```

Run the browser preview:

```bash
npm run dev   # http://localhost:1420
```

Native folder scanning, Git hook installation, and report file writes require
the desktop shell. The browser preview uses demo fixtures and `localStorage`.

Build installers:

```bash
npm run desktop:build   # src-tauri/target/release/bundle/
```

## Environment Variables

No `.env` file is required. Configuration is local and user-driven at runtime.
Vite is configured with `envPrefix: ['VITE_', 'TAURI_ENV_*']`, so only prefixed
variables are exposed to client code.

| Variable | Required | Source | Purpose |
| --- | --- | --- | --- |
| `VITE_*` | No | Developer-defined | Reserved prefix for future frontend variables. Values are embedded in the client bundle; never place secrets here. |
| `TAURI_DEV_HOST` | No | Developer | Dev-server host used for HMR when testing on a physical device. |
| `TAURI_ENV_DEBUG` | No | Tauri CLI | `"true"` in debug builds; disables minification and enables source maps. |
| `TAURI_ENV_PLATFORM` | No | Tauri CLI | Target platform (`windows`, `macos`, `linux`); selects the build target. |

Optional local override:

```bash
# .env.local — not committed
TAURI_DEV_HOST=192.168.1.20
```

Sync endpoints and app state are not environment variables; they are managed in
the UI and stored under the app data directory.

## Local Data

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%\com.developershield.app\state\` |
| macOS | `~/Library/Application Support/com.developershield.app/state/` |
| Linux | `$XDG_DATA_HOME/com.developershield.app/state/` |

Files: `rules.json`, `history.json`, `sync.json`. History contains masked values
only; `sync.json` stores the endpoint and sync timestamps, never the passphrase.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server on port 1420 |
| `npm run desktop` | Tauri dev window (starts Vite) |
| `npm run build` | TypeScript build + production assets |
| `npm run lint` | ESLint |
| `npm test` | Encryption and sync unit tests |
| `npm run desktop:build` | Native installers |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lints |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust tests |

## Project Layout

```text
src/
  App.tsx                 app shell and state wiring
  components/             views, tables, modals, sync panel
  hooks/                  cloud sync state, media queries
  services/               desktop bridge, storage, encryption, sync, reports
  utils/                  scanner, sanitizer, rules, history, git hooks
  data/                   constants and demo fixtures
src-tauri/
  src/lib.rs              Tauri commands and Git helpers
  capabilities/           runtime fs scopes and plugin permissions
  tauri.conf.json         window, CSP, bundle config
tests/                    Node test runner suites
```

## License

MIT. Developer Shield is a heuristic guardrail, not a replacement for a
professional security audit.
