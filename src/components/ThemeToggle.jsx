import { useTheme } from '../contexts/ThemeContext'

const OPTIONS = [
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-800">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
            theme === o.value
              ? 'bg-amber-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <span className="mr-1">{o.icon}</span>{o.label}
        </button>
      ))}
    </div>
  )
}
