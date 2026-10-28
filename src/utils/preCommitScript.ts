/** Marker so the app can tell its own hook from a user-managed one. */
export const PRE_COMMIT_MARKER = 'developer-shield:pre-commit'

/**
 * Shell script written to `.git/hooks/pre-commit`.
 *
 * It deliberately avoids calling back into the app: hooks must work from a
 * plain terminal, before the desktop UI is running. The regexes mirror the
 * highest-signal rules from `scanner.ts`.
 */
const PRE_COMMIT_SCRIPT = `#!/bin/sh
# ${PRE_COMMIT_MARKER} (managed by Developer Shield)
# Blocks commits whose staged files contain high-signal credentials.
# Bypass once with: git commit --no-verify
# Or skip the scan with: DEVELOPER_SHIELD_SKIP=1 git commit

if [ "\${DEVELOPER_SHIELD_SKIP:-0}" = "1" ]; then
  echo "Developer Shield: pre-commit scan skipped." >&2
  exit 0
fi

patterns='sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'

files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR)

if [ -z "$files" ]; then
  exit 0
fi

matches=$(printf '%s\\n' "$files" | while IFS= read -r file; do
  [ -n "$file" ] || continue
  # Scan the staged blob, not the working tree: a secret that is staged but
  # later edited out of the file must still block the commit.
  if git show ":$file" 2>/dev/null | grep -qIE "$patterns"; then
    printf '%s\\n' "$file"
  fi
done)

if [ -n "$matches" ]; then
  echo "" >&2
  echo "Developer Shield blocked this commit: possible secrets in staged files." >&2
  printf '%s\\n' "$matches" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Remove the secret, or bypass this once with: git commit --no-verify" >&2
  exit 1
fi

exit 0
`

export function buildPreCommitScript(): string {
  return PRE_COMMIT_SCRIPT
}
