import { Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from '../lib/theme';

/** Switches between the dark and light themes; the choice is remembered in this browser. */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
