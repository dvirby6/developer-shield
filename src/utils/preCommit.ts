/**
 * Pre-commit hook installation for every Git repository in a workspace.
 *
 * Git itself resolves the authoritative hook location, so linked worktrees,
 * submodules, `core.hooksPath`, and detached HEAD all behave the way Git
 * expects. The Rust side returns the resolved directory and grants the fs
 * plugin access to it at runtime.
 */

import type { CustomRule } from './customRules'
import { PRE_COMMIT_MARKER, buildPreCommitScript } from './preCommitScript'

export type HookStatus = 'installed' | 'missing' | 'custom' | 'unknown'

export interface RepoHook {
  /** Absolute repository root. */
  root: string
  /** Directory Git reads hooks from (may be outside the work tree). */
  hooksDir: string
  status: HookStatus
  branch: string | null
  detached: boolean
  usesCustomHooksPath: boolean
}

export interface InstallFailure {
  root: string
  message: string
}

export interface InstallSummary {
  repositories: number
  installed: number
  backedUp: number
  failures: InstallFailure[]
}

interface RawGitHookInfo {
  isRepo: boolean
  workTree: string | null
  hooksDir: string | null
  branch: string | null
  detached: boolean
  usesCustomHooksPath: boolean
}

async function invoke<T>(command: string, args: Record<string, unknown>) {
  const { invoke: ipc } = await import('@tauri-apps/api/core')
  return ipc<T>(command, args)
}

async function inspectRepository(
  fs: typeof import('@tauri-apps/plugin-fs'),
  path: typeof import('@tauri-apps/api/path'),
  root: string,
): Promise<RepoHook | null> {
  const info = await invoke<RawGitHookInfo>('git_hook_info', { path: root })
  if (!info.isRepo || !info.hooksDir) return null

  let status: HookStatus
  try {
    const hookPath = await path.join(info.hooksDir, 'pre-commit')
    if (await fs.exists(hookPath)) {
      const contents = await fs.readTextFile(hookPath)
      status = contents.includes(PRE_COMMIT_MARKER) ? 'installed' : 'custom'
    } else {
      status = 'missing'
    }
  } catch {
    status = 'unknown'
  }

  return {
    root,
    hooksDir: info.hooksDir,
    status,
    branch: info.branch,
    detached: info.detached,
    usesCustomHooksPath: info.usesCustomHooksPath,
  }
}

/** Detect every repository in the workspace and report its hook state. */
export async function inspectWorkspaceHooks(
  workspaceRoot: string,
): Promise<RepoHook[]> {
  const fs = await import('@tauri-apps/plugin-fs')
  const path = await import('@tauri-apps/api/path')

  const repositories = await invoke<string[]>('discover_git_repositories', {
    root: workspaceRoot,
  })

  const hooks: RepoHook[] = []
  for (const repository of repositories) {
    try {
      const info = await inspectRepository(fs, path, repository)
      if (info) hooks.push(info)
    } catch (error) {
      hooks.push({
        root: repository,
        hooksDir: '',
        status: 'unknown',
        branch: null,
        detached: false,
        usesCustomHooksPath: false,
      })
      console.warn('Could not inspect Git hooks', repository, error)
    }
  }

  return hooks
}

/**
 * Install or refresh the hook in every repository. Existing foreign hooks are
 * preserved as `pre-commit.developer-shield.bak` next to the hook.
 */
export async function installPreCommitHook(
  workspaceRoot: string,
  customRules: readonly CustomRule[] = [],
): Promise<InstallSummary> {
  const fs = await import('@tauri-apps/plugin-fs')
  const path = await import('@tauri-apps/api/path')

  const repositories = await inspectWorkspaceHooks(workspaceRoot)
  if (repositories.length === 0) {
    throw new Error(
      'No Git repositories found in this workspace. Run "git init" in a project folder and scan again.',
    )
  }

  const script = buildPreCommitScript(customRules)
  const summary: InstallSummary = {
    repositories: repositories.length,
    installed: 0,
    backedUp: 0,
    failures: [],
  }

  for (const repository of repositories) {
    try {
      if (!repository.hooksDir) {
        throw new Error('Git did not report a hook directory')
      }

      await fs.mkdir(repository.hooksDir, { recursive: true })

      const hookPath = await path.join(repository.hooksDir, 'pre-commit')
      const backupPath = await path.join(
        repository.hooksDir,
        'pre-commit.developer-shield.bak',
      )

      if (await fs.exists(hookPath)) {
        const existing = await fs.readTextFile(hookPath)
        if (!existing.includes(PRE_COMMIT_MARKER) && !(await fs.exists(backupPath))) {
          await fs.writeTextFile(backupPath, existing)
          summary.backedUp += 1
        }
      }

      await fs.writeTextFile(hookPath, script)
      await invoke('mark_executable', { path: hookPath })
      summary.installed += 1
    } catch (error) {
      summary.failures.push({
        root: repository.root,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (summary.installed === 0) {
    throw new Error(
      summary.failures[0]?.message ??
        'The pre-commit hook could not be installed in any repository.',
    )
  }

  return summary
}

export { buildPreCommitScript, PRE_COMMIT_MARKER }
