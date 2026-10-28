/**
 * Pre-commit hook installation.
 *
 * The hook is a small POSIX shell script that greps staged files for the
 * highest-signal secret patterns used by the scanner. It runs entirely on the
 * developer's machine and can be bypassed with `git commit --no-verify`.
 */

import { PRE_COMMIT_MARKER, buildPreCommitScript } from './preCommitScript'

export type HookStatus =
  | 'installed'
  | 'missing'
  | 'custom'
  | 'not-a-repo'
  | 'unknown'

export interface InstalledHook {
  hookPath: string
  /** Set when a pre-existing custom hook was preserved. */
  backupPath: string | null
  replacedCustomHook: boolean
}

async function grantScope(root: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke<string>('allow_directory', { path: root })
}

/**
 * Locate the hook directory for a repository, including linked worktrees where
 * `.git` is a file containing a `gitdir: <path>` pointer.
 */
async function resolveHooksDir(root: string): Promise<string | null> {
  const fs = await import('@tauri-apps/plugin-fs')
  const path = await import('@tauri-apps/api/path')

  const gitPath = await path.join(root, '.git')

  let info
  try {
    info = await fs.stat(gitPath)
  } catch {
    return null
  }

  if (info.isDirectory) {
    return path.join(gitPath, 'hooks')
  }

  if (!info.isFile) return null

  let pointer: string
  try {
    pointer = await fs.readTextFile(gitPath)
  } catch {
    return null
  }

  const line = pointer
    .split(/\r?\n/)
    .find((entry) => entry.trimStart().startsWith('gitdir:'))

  if (!line) return null

  const target = line.slice(line.indexOf(':') + 1).trim()
  if (!target) return null

  const gitDir = (await path.isAbsolute(target))
    ? target
    : await path.join(root, target)

  // Linked worktrees can keep the hook directory outside the workspace root.
  await grantScope(gitDir)

  return path.join(gitDir, 'hooks')
}

/** Read the current hook state without changing anything. */
export async function inspectPreCommitHook(root: string): Promise<HookStatus> {
  try {
    await grantScope(root)

    const fs = await import('@tauri-apps/plugin-fs')
    const path = await import('@tauri-apps/api/path')
    const hooksDir = await resolveHooksDir(root)

    if (!hooksDir) return 'not-a-repo'

    const hookPath = await path.join(hooksDir, 'pre-commit')
    if (!(await fs.exists(hookPath))) return 'missing'

    const contents = await fs.readTextFile(hookPath)
    return contents.includes(PRE_COMMIT_MARKER) ? 'installed' : 'custom'
  } catch {
    return 'unknown'
  }
}

/**
 * Write the hook into `<repo>/.git/hooks/pre-commit`. A pre-existing custom hook
 * is copied to `pre-commit.developer-shield.bak` instead of being destroyed.
 */
export async function installPreCommitHook(
  root: string,
): Promise<InstalledHook> {
  await grantScope(root)

  const fs = await import('@tauri-apps/plugin-fs')
  const path = await import('@tauri-apps/api/path')
  const { invoke } = await import('@tauri-apps/api/core')

  const hooksDir = await resolveHooksDir(root)
  if (!hooksDir) {
    throw new Error(
      'This folder is not a Git repository. Run "git init" first, then try again.',
    )
  }

  await fs.mkdir(hooksDir, { recursive: true })

  const hookPath = await path.join(hooksDir, 'pre-commit')
  const backupPath = await path.join(
    hooksDir,
    'pre-commit.developer-shield.bak',
  )

  let backup: string | null = null
  let replacedCustomHook = false

  if (await fs.exists(hookPath)) {
    const existing = await fs.readTextFile(hookPath)

    if (!existing.includes(PRE_COMMIT_MARKER)) {
      replacedCustomHook = true
      backup = backupPath

      if (!(await fs.exists(backupPath))) {
        await fs.writeTextFile(backupPath, existing)
      }
    }
  }

  await fs.writeTextFile(hookPath, buildPreCommitScript())
  await invoke('mark_executable', { path: hookPath })

  return { hookPath, backupPath: backup, replacedCustomHook }
}

export { buildPreCommitScript, PRE_COMMIT_MARKER }
