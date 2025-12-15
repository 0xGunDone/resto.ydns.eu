import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { mode, toggleTheme, isDark } = useTheme();

  const getIcon = () => {
    if (mode === 'auto') {
      return <Monitor className="w-5 h-5" />;
    }
    return isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />;
  };

  const getLabel = () => {
    if (mode === 'light') return 'Светлая тема';
    if (mode === 'dark') return 'Темная тема';
    return 'Автоматическая тема';
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
      title={getLabel()}
      aria-label={getLabel()}
    >
      {getIcon()}
    </button>
  );
}

