/**
 * Local persistence for app state (custom rules, scan history).
 *
 * In the desktop app state is written as JSON files inside the app data
 * directory. The browser build falls back to localStorage so `npm run dev`
 * behaves the same way. Nothing is ever uploaded.
 */

import { isDesktopApp } from './desktop.ts'

const STATE_DIR = 'state'
const LOCAL_PREFIX = 'developer-shield:'

function readLocal(name: string): string | null {
  try {
    return window.localStorage.getItem(`${LOCAL_PREFIX}${name}`)
  } catch {
    return null
  }
}

function writeLocal(name: string, contents: string): void {
  try {
    window.localStorage.setItem(`${LOCAL_PREFIX}${name}`, contents)
  } catch {
    // Quota or privacy mode: state simply won't survive a reload.
  }
}

function removeLocal(name: string): void {
  try {
    window.localStorage.removeItem(`${LOCAL_PREFIX}${name}`)
  } catch {
    // Ignore storage failures; the in-memory state is still reset.
  }
}

async function readDesktop(name: string): Promise<string | null> {
  const { BaseDirectory, exists, readTextFile } = await import(
    '@tauri-apps/plugin-fs'
  )
  const path = `${STATE_DIR}/${name}`

  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null
  return readTextFile(path, { baseDir: BaseDirectory.AppData })
}

async function writeDesktop(name: string, contents: string): Promise<void> {
  const { BaseDirectory, mkdir, writeTextFile } = await import(
    '@tauri-apps/plugin-fs'
  )

  await mkdir(STATE_DIR, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  })
  await writeTextFile(`${STATE_DIR}/${name}`, contents, {
    baseDir: BaseDirectory.AppData,
  })
}

export async function readState<T>(name: string): Promise<T | null> {
  let raw: string | null

  try {
    raw = isDesktopApp() ? await readDesktop(name) : readLocal(name)
  } catch {
    raw = readLocal(name)
  }

  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeState(name: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value)

  if (isDesktopApp()) {
    try {
      await writeDesktop(name, raw)
      return
    } catch {
      // Fall through to localStorage so the session still remembers state.
    }
  }

  writeLocal(name, raw)
}

export function clearState(name: string): void {
  removeLocal(name)
}
