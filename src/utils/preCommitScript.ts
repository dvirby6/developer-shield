/**
 * Shell script written to `.git/hooks/pre-commit`.
 *
 * It deliberately avoids calling back into the app: hooks must work from a
 * plain terminal, before the desktop UI is running. The regexes mirror the
 * highest-signal built-in rules plus any enabled custom rules at install time.
 */

import type { CustomRule } from './customRules'

/** Marker so the app can tell its own hook from a user-managed one. */
export const PRE_COMMIT_MARKER = 'developer-shield:pre-commit'

const BUILTIN_PATTERNS = [
  'sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}',
  'gh[pousr]_[A-Za-z0-9]{36,}',
  'github_pat_[A-Za-z0-9_]{22,}',
  '(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}',
  '(sk|rk)_(live|test)_[A-Za-z0-9]{16,}',
  'xox[baprs]-[A-Za-z0-9-]{10,}',
  'AIza[0-9A-Za-z_-]{35}',
  'eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}',
  '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----',
].join('|')

/** Quote an arbitrary value for a POSIX shell single-quoted string. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function usablePattern(rule: CustomRule): boolean {
  return (
    rule.enabled &&
    rule.pattern.trim().length > 0 &&
    rule.pattern.length <= 400 &&
    !/[\r\n]/.test(rule.pattern)
  )
}

function patternPacks(rules: readonly CustomRule[]): {
  sensitive: string
  insensitive: string
} {
  const sensitive: string[] = []
  const insensitive: string[] = []

  for (const rule of rules) {
    if (!usablePattern(rule)) continue
    if (rule.ignoreCase) {
      insensitive.push(rule.pattern.trim())
    } else {
      sensitive.push(rule.pattern.trim())
    }
  }

  return {
    sensitive: [BUILTIN_PATTERNS, ...sensitive].join('|'),
    insensitive: insensitive.join('|'),
  }
}

export function buildPreCommitScript(
  rules: readonly CustomRule[] = [],
): string {
  const { sensitive, insensitive } = patternPacks(rules)

  return `#!/bin/sh
# ${PRE_COMMIT_MARKER} (managed by Developer Shield)
# Blocks commits whose staged files contain high-signal credentials.
# Installed for this repository only; reinstall from the app after editing rules.
#
# Works in normal clones, linked worktrees, submodules, and detached HEAD.
# Bypass once with:   git commit --no-verify
# Skip the scan with: DEVELOPER_SHIELD_SKIP=1 git commit

if [ "\${DEVELOPER_SHIELD_SKIP:-0}" = "1" ]; then
  echo "Developer Shield: pre-commit scan skipped." >&2
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Developer Shield: git not found; skipping the pre-commit scan." >&2
  exit 0
fi

# A hook can run in a bare repository or a worktree being repaired; bail out
# rather than failing the commit when there is no working tree to inspect.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

patterns=${shellQuote(sensitive)}
patterns_ci=${shellQuote(insensitive)}

files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null | tr '\\0' '\\n')

if [ -z "$files" ]; then
  exit 0
fi

matches=$(printf '%s\\n' "$files" | while IFS= read -r file; do
  [ -n "$file" ] || continue
  # Scan the staged blob, not the working tree: a staged secret that was later
  # edited out of the file must still block the commit.
  if git show ":$file" 2>/dev/null | grep -aqE "$patterns"; then
    printf '%s\\n' "$file"
    continue
  fi
  if [ -n "$patterns_ci" ] && git show ":$file" 2>/dev/null | grep -aqiE "$patterns_ci"; then
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
}
