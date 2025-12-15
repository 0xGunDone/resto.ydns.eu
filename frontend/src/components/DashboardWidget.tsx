import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronUp, Settings2, X } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';

interface DashboardWidgetProps {
  widgetId: string;
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  className?: string;
}

export default function DashboardWidget({
  widgetId,
  title,
  children,
  collapsible = true,
  className = '',
}: DashboardWidgetProps) {
  const { widgets, setWidgetCollapsed, setWidgetVisibility } = useDashboardStore();
  const widget = widgets.find((w) => w.id === widgetId);
  const [showSettings, setShowSettings] = useState(false);

  if (!widget || !widget.visible) {
    return null;
  }

  const handleToggleCollapse = () => {
    if (collapsible) {
      setWidgetCollapsed(widgetId, !widget.collapsed);
    }
  };

  const handleHide = () => {
    setWidgetVisibility(widgetId, false);
  };

  return (
    <div className={`card ${className} relative group`}>
      {/* Заголовок виджета */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <div className="flex items-center space-x-2">
          {/* Кнопка настроек (появляется при наведении) */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title="Настройки"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
          
          {/* Кнопка сворачивания */}
          {collapsible && (
            <button
              onClick={handleToggleCollapse}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              title={widget.collapsed ? 'Развернуть' : 'Свернуть'}
            >
              {widget.collapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        
        {/* Выпадающее меню настроек */}
        {showSettings && (
          <div className="absolute top-12 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-2 min-w-[150px]">
            <button
              onClick={() => {
                handleHide();
                setShowSettings(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>Скрыть виджет</span>
            </button>
          </div>
        )}
      </div>
      
      {/* Содержимое виджета */}
      {!widget.collapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}

