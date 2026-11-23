import { useSyncExternalStore } from 'react';

/**
 * Dark is the default and needs nothing: the light theme is only `data-theme="light"` on <html>,
 * and every light rule in index.css is scoped to that attribute, so dark is never touched.
 */
export type ThemeName = 'dark' | 'light';
const KEY = 'testnova:theme';
const listeners = new Set<() => void>();

const read = (): ThemeName => {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export function applyTheme(theme: ThemeName = read()) {
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
}

export function setTheme(theme: ThemeName) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice lasts until the page closes
  }
  applyTheme(theme);
  listeners.forEach((fn) => fn());
}

export function useTheme(): ThemeName {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
  );
}
