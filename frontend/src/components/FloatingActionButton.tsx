import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface QuickAction {
  name: string;
  icon: any;
  onClick: () => void;
  color?: string;
}

interface FloatingActionButtonProps {
  actions?: QuickAction[];
  mainAction?: {
    icon: any;
    onClick: () => void;
    label?: string;
  };
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export default function FloatingActionButton({
  actions = [],
  mainAction,
  position = 'bottom-right',
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Позиционирование
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  };

  // Если только одно главное действие, показываем простую кнопку
  if (!actions.length && mainAction) {
    const MainIcon = mainAction.icon;
    return (
      <button
        onClick={mainAction.onClick}
        className={`fab ${positionClasses[position]} safe-area-inset-bottom`}
        aria-label={mainAction.label || 'Действие'}
        title={mainAction.label}
      >
        <MainIcon className="w-6 h-6" />
      </button>
    );
  }

  // Если есть несколько действий, показываем раскрывающееся меню
  if (actions.length > 0) {
    return (
      <div className={`fixed ${positionClasses[position]} z-50 safe-area-inset-bottom`}>
        {/* Дополнительные действия */}
        {isOpen && (
          <div className="mb-4 flex flex-col-reverse gap-3">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    action.onClick();
                    setIsOpen(false);
                  }}
                  className={`bg-white text-gray-700 rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-3 min-w-[56px] min-h-[56px] touch-target ${
                    isOpen ? 'animate-fade-in' : 'hidden'
                  }`}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                  aria-label={action.name}
                >
                  <Icon className="w-6 h-6" />
                  <span className="whitespace-nowrap pr-2 text-sm font-medium">{action.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Главная кнопка */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fab"
          aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Plus className="w-6 h-6" />
          )}
        </button>
      </div>
    );
  }

  // Если нет действий, не показываем ничего
  return null;
}

