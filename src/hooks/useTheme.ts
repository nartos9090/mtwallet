import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'

/** Same key and logic as the inline script in index.html, which applies the theme before first paint. */
const STORAGE_KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readStored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

let theme = readStored()

function apply() {
  const dark = theme === 'dark' || (theme === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

media.addEventListener('change', apply)

export function setTheme(next: Theme) {
  theme = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
  apply()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  return { theme: useSyncExternalStore(subscribe, () => theme), setTheme }
}
