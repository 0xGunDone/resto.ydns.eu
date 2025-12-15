import { ShiftTemplate } from './types';

interface ScheduleLegendProps {
  templates: ShiftTemplate[];
}

export default function ScheduleLegend({ templates }: ScheduleLegendProps) {
  return (
    <div className="mt-4 sm:mt-6 flex flex-wrap gap-3 sm:gap-4 items-center text-sm">
      <span className="text-sm font-medium text-gray-700">Легенда:</span>
      {templates.map((template) => (
        <div key={template.id} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: template.color || '#gray' }}
          >
            {template.name.substring(0, 1).toUpperCase()}
          </div>
          <span className="text-sm text-gray-600">
            {template.name} ({String(template.startHour).padStart(2, '0')}:00 - {String(template.endHour).padStart(2, '0')}:00)
          </span>
        </div>
      ))}
    </div>
  );
}

