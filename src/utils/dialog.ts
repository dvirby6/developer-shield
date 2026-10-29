import { isDesktopApp } from '../services/desktop'

/**
 * Ask for confirmation before a destructive action.
 *
 * Tauri's dialog plugin replaces `window.confirm` with an async function, so a
 * synchronous truthiness check would always continue. Use the plugin's async
 * API in the desktop app and the browser's native prompt everywhere else.
 *
 * Fails closed: if the native dialog cannot be shown, the action is cancelled.
 */
export async function confirmDestructive(message: string): Promise<boolean> {
  if (!isDesktopApp()) {
    return window.confirm(message)
  }

  try {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    return await confirm(message, {
      title: 'Developer Shield',
      kind: 'warning',
      okLabel: 'Continue',
      cancelLabel: 'Cancel',
    })
  } catch {
    return false
  }
}
