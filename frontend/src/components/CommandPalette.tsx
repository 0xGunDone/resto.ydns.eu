import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface CommandAction {
  name: string;
  description?: string;
  href?: string;
  icon?: any;
  onSelect?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

export default function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
    );
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = filtered[activeIndex];
        if (!action) return;
        if (action.onSelect) {
          action.onSelect();
        } else if (action.href) {
          navigate(action.href);
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, filtered, activeIndex, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 mt-10">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Поиск команд и страниц (Ctrl/Cmd + K)"
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
              Ничего не найдено
            </div>
          )}
          {filtered.map((action, idx) => {
            const Icon = action.icon;
            const active = idx === activeIndex;
            return (
              <button
                key={action.name + idx}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  if (action.onSelect) action.onSelect();
                  else if (action.href) navigate(action.href);
                  onClose();
                }}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  active
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100'
                }`}
              >
                {Icon && (
                  <div
                    className={`mt-0.5 p-2 rounded-lg ${
                      active ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold">{action.name}</div>
                  {action.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">{action.description}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

