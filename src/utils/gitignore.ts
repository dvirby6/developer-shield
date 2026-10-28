/**
 * Small, dependency-free `.gitignore` matcher.
 *
 * It covers the common cases needed by the local scanner: comments, negation,
 * directory-only rules, anchored patterns, `*`, `**`, `?`, and character
 * classes. Rules are evaluated in order, so a later `!` rule can re-include a
 * path (matching Git's "last match wins" behaviour).
 */

export interface IgnoreRule {
  /** Posix path of the directory that owns the .gitignore file. */
  base: string
  regex: RegExp
  negated: boolean
  dirOnly: boolean
}

const REGEXP_SPECIALS = /[.+^${}()|[\]\\]/g

function globToSource(glob: string): string {
  let source = ''

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]

    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 1
        if (glob[index + 1] === '/') {
          index += 1
          // `**/` matches zero or more leading directories.
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else if (char === '[') {
      const end = glob.indexOf(']', index + 1)
      if (end === -1) {
        source += '\\['
      } else {
        let body = glob.slice(index + 1, end)
        if (body.startsWith('!')) body = `^${body.slice(1)}`
        source += `[${body.replace(/\\/g, '\\\\')}]`
        index = end
      }
    } else {
      source += char.replace(REGEXP_SPECIALS, '\\$&')
    }
  }

  return source
}

function trimUnescapedTrailingSpaces(line: string): string {
  let end = line.length

  while (end > 0 && line[end - 1] === ' ') {
    let backslashes = 0
    let cursor = end - 2
    while (cursor >= 0 && line[cursor] === '\\') {
      backslashes += 1
      cursor -= 1
    }
    if (backslashes % 2 === 1) break
    end -= 1
  }

  return line.slice(0, end)
}

/** Parse one `.gitignore` file that lives in `baseDir` (posix, root = ''). */
export function parseGitignore(contents: string, baseDir = ''): IgnoreRule[] {
  const base = baseDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const rules: IgnoreRule[] = []

  for (const rawLine of contents.split(/\r?\n/)) {
    let line = trimUnescapedTrailingSpaces(rawLine)
    if (!line || line.startsWith('#')) continue

    let negated = false
    if (line.startsWith('!')) {
      negated = true
      line = line.slice(1)
    } else if (line.startsWith('\\!')) {
      line = line.slice(1)
    }

    if (!line) continue

    let dirOnly = false
    if (line.endsWith('/')) {
      dirOnly = true
      line = line.slice(0, -1)
    }

    let anchored = false
    if (line.startsWith('/')) {
      anchored = true
      line = line.slice(1)
    }

    if (!line) continue

    const hasSlash = line.includes('/')
    const prefix = anchored || hasSlash ? '^' : '(?:^|.*/)'

    rules.push({
      base,
      regex: new RegExp(`${prefix}${globToSource(line)}$`),
      negated,
      dirOnly,
    })
  }

  return rules
}

/** Test a path relative to the scan root against every collected rule. */
export function isPathIgnored(
  relativePath: string,
  isDirectory: boolean,
  rules: IgnoreRule[],
): boolean {
  const path = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (!path) return false

  let ignored = false

  for (const rule of rules) {
    if (rule.dirOnly && !isDirectory) continue

    let scoped = path
    if (rule.base) {
      if (path === rule.base) {
        scoped = ''
      } else if (path.startsWith(`${rule.base}/`)) {
        scoped = path.slice(rule.base.length + 1)
      } else {
        continue
      }
    }

    if (!scoped) continue
    if (rule.regex.test(scoped)) ignored = !rule.negated
  }

  return ignored
}
