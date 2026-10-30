import { Moon, Sun } from '@phosphor-icons/react'
import type { Theme } from '../useTheme'

export default function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme
  onChange: (theme: Theme) => void
}) {
  return (
    <div className="theme-switch" role="group" aria-label="Appearance">
      <button
        aria-label="Light mode"
        title="Light mode"
        aria-pressed={theme === 'light'}
        onClick={() => onChange('light')}
      >
        <Sun size={17} />
      </button>
      <button
        aria-label="Dark mode"
        title="Dark mode"
        aria-pressed={theme === 'dark'}
        onClick={() => onChange('dark')}
      >
        <Moon size={17} />
      </button>
    </div>
  )
}
