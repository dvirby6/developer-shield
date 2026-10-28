/**
 * Thin wrappers around the Tauri desktop APIs.
 *
 * Imports are dynamic so the browser build can still run `npm run dev` without
 * the native plugins present.
 */

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Open the native folder picker. Returns an absolute path or null if cancelled. */
export async function pickProjectFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select a folder to scan',
  })

  return typeof selected === 'string' ? selected : null
}

/**
 * Validate the picked folder and add it to the fs plugin's runtime scope.
 * Returns the absolute path the scanner should use.
 */
export async function registerProjectScope(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('allow_directory', { path })
}
