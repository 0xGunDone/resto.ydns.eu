import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/Navbar';
import FloatingActionButton from '../components/FloatingActionButton';
import { useSwipe } from '../hooks/useSwipe';
import { Plus, Search, Calendar, User, FileText, XCircle, Edit, Trash2, Check, Filter, ChevronsUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  dueDate?: string;
  isRecurring: boolean;
  recurringRule?: string;
  createdAt: string;
  completedAt?: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attachments: any[];
  restaurant: {
    id: string;
    name: string;
  };
}

const statusColumns = [
  { id: 'NEW', label: 'Новые', color: 'bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100' },
  { id: 'IN_PROGRESS', label: 'В работе', color: 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-gray-900 dark:text-gray-100' },
  { id: 'DONE', label: 'Выполнено', color: 'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-gray-900 dark:text-gray-100' },
];

const categoryColors: Record<string, string> = {
  KITCHEN: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
  HALL: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  BAR: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200',
  ADMIN: 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200',
  SERVICE: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
};

const categoryLabels: Record<string, string> = {
  KITCHEN: 'Кухня',
  HALL: 'Зал',
  BAR: 'Бар',
  ADMIN: 'Админ',
  SERVICE: 'Сервис',
};

export default function TasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const fabActions = [
    {
      name: 'Создать задачу',
      icon: Plus,
      onClick: () => setShowCreateModal(true),
    },
    {
      name: showFilters ? 'Скрыть фильтры' : 'Показать фильтры',
      icon: Filter,
      onClick: () => setShowFilters((v) => !v),
    },
    {
      name: 'Наверх',
      icon: ChevronsUp,
      onClick: handleScrollTop,
    },
  ];
  
  // Фильтры
  const [filters, setFilters] = useState({
    restaurantId: '',
    status: '',
    category: '',
    assignedToId: '',
    search: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [filters]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [restaurantsRes, employeesRes] = await Promise.all([
        api.get('/restaurants'),
        api.get('/restaurants').then(async (res) => {
          if (res.data.restaurants?.length > 0) {
            const empRes = await api.get(`/restaurants/${res.data.restaurants[0].id}/employees`);
            return empRes.data.allEmployees || [];
          }
          return [];
        }),
      ]);
      setRestaurants(restaurantsRes.data.restaurants || []);
      setEmployees(employeesRes);
      if (restaurantsRes.data.restaurants?.length > 0) {
        setFilters({ ...filters, restaurantId: restaurantsRes.data.restaurants[0].id });
      }
    } catch (error) {
      console.error('Ошибка загрузки исходных данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const params: any = {};
      if (filters.restaurantId) params.restaurantId = filters.restaurantId;
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.assignedToId) params.assignedToId = filters.assignedToId;
      if (filters.search) params.search = filters.search;

      const response = await api.get('/tasks', { params });
      setTasks(response.data.tasks || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки задач');
      console.error(error);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      toast.success('Статус обновлен');
      loadTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка обновления статуса');
    }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      await handleStatusChange(taskId, newStatus);
    }
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter((task) => task.status === status);
  };

  const toggleTaskSelection = (taskId: string) => {
    const next = new Set(selectedTaskIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    setSelectedTaskIds(next);
  };

  const handleBatchStatusChange = async (newStatus: string) => {
    if (selectedTaskIds.size === 0) return;
    try {
      for (const id of selectedTaskIds) {
        await api.put(`/tasks/${id}`, { status: newStatus });
      }
      toast.success(`Обновлено задач: ${selectedTaskIds.size}`);
      setSelectedTaskIds(new Set());
      loadTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка пакетного обновления');
    }
  };

  const clearSelection = () => setSelectedTaskIds(new Set());

  const applyPreset = (preset: 'all' | 'mine') => {
    if (preset === 'all') {
      setFilters({
        restaurantId: filters.restaurantId,
        status: '',
        category: '',
        assignedToId: '',
        search: '',
      });
      return;
    }
    if (preset === 'mine') {
      setFilters({
        ...filters,
        assignedToId: user?.id || '',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Задачи</h1>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Создать задачу</span>
                <span className="sm:hidden">Создать</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-300">Быстрые пресеты:</span>
            <button
              onClick={() => applyPreset('all')}
              className="btn-secondary btn-sm"
            >
              Все задачи
            </button>
            <button
              onClick={() => applyPreset('mine')}
              className="btn-secondary btn-sm"
            >
              Мои задачи
            </button>
          </div>

          {/* Фильтры */}
          {showFilters && (
            <div className="card p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ресторан</label>
                <select
                  value={filters.restaurantId}
                  onChange={(e) => setFilters({ ...filters, restaurantId: e.target.value })}
                  className="select"
                >
                  <option value="">Все</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Статус</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="select"
                >
                  <option value="">Все</option>
                  {statusColumns.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="select"
                >
                  <option value="">Все</option>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Исполнитель</label>
                <select
                  value={filters.assignedToId}
                  onChange={(e) => setFilters({ ...filters, assignedToId: e.target.value })}
                  className="select"
                >
                  <option value="">Все</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Поиск</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    placeholder="Поиск..."
                    className="input pl-10"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ restaurantId: '', status: '', category: '', assignedToId: '', search: '' })}
                className="w-full px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-100 rounded-md hover:bg-gray-300 dark:hover:bg-slate-600"
              >
                Сбросить
              </button>
            </div>
            </div>
          )}

          {selectedTaskIds.size > 0 && (
            <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-700 dark:text-gray-200">Выбрано: {selectedTaskIds.size}</span>
              <button
                onClick={() => handleBatchStatusChange('NEW')}
                className="btn-secondary btn-sm"
              >
                В «Новые»
              </button>
              <button
                onClick={() => handleBatchStatusChange('IN_PROGRESS')}
                className="btn-secondary btn-sm"
              >
                В «В работе»
              </button>
              <button
                onClick={() => handleBatchStatusChange('DONE')}
                className="btn-primary btn-sm"
              >
                В «Выполнено»
              </button>
              <button
                onClick={clearSelection}
                className="btn-secondary btn-sm"
              >
                Сбросить выбор
              </button>
            </div>
          )}
        </div>

        {/* Kanban доска */}
        {tasks.length === 0 ? (
          <div className="card p-6 text-center text-gray-700 dark:text-gray-200">
            <div className="text-lg font-semibold mb-2">Нет задач</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Создайте первую задачу, чтобы начать работу</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Создать задачу
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-24">
            {statusColumns.map((column) => (
              <div
                key={column.id}
                className={`${column.color} rounded-xl p-4 min-h-[400px] sm:min-h-[600px] shadow-sm min-w-[260px]`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {column.label} ({getTasksByStatus(column.id).length})
                </h2>
                <div className="space-y-3">
                  {getTasksByStatus(column.id).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={handleDragStart}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={handleStatusChange}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={() => toggleTaskSelection(task.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadTasks();
            setShowCreateModal(false);
          }}
          restaurants={restaurants}
          employees={employees}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={loadTasks}
          employees={employees}
        />
      )}

      {/* FAB меню для мобильных устройств */}
      <FloatingActionButton
        actions={fabActions}
        position="bottom-right"
      />
    </div>
  );
}

function TaskCard({
  task,
  onDragStart,
  onClick,
  onStatusChange,
  selected,
  onToggleSelect,
}: {
  task: Task;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onClick: () => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  // Определяем следующий и предыдущий статусы
  const getNextStatus = () => {
    const currentIndex = statusColumns.findIndex((s) => s.id === task.status);
    if (currentIndex < statusColumns.length - 1) {
      return statusColumns[currentIndex + 1].id;
    }
    return null;
  };

  const getPreviousStatus = () => {
    const currentIndex = statusColumns.findIndex((s) => s.id === task.status);
    if (currentIndex > 0) {
      return statusColumns[currentIndex - 1].id;
    }
    return null;
  };

  // Свайпы для изменения статуса
  const { handlers, ref } = useSwipe({
    onSwipeLeft: () => {
      const nextStatus = getNextStatus();
      if (nextStatus) {
        onStatusChange(task.id, nextStatus);
        toast.success(`Статус изменен: ${statusColumns.find((s) => s.id === nextStatus)?.label}`);
      }
    },
    onSwipeRight: () => {
      const prevStatus = getPreviousStatus();
      if (prevStatus) {
        onStatusChange(task.id, prevStatus);
        toast.success(`Статус изменен: ${statusColumns.find((s) => s.id === prevStatus)?.label}`);
      }
    },
    threshold: 100, // Для задач нужен более длинный свайп
    preventDefault: false, // Не предотвращаем прокрутку
  });

  return (
    <div
      ref={ref}
      {...handlers}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={onClick}
      className="card p-4 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 no-select shadow-sm"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className="mt-1 checkbox checkbox-sm"
            onClick={(e) => e.stopPropagation()}
          />
          <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{task.title}</h3>
        </div>
        <span className={`px-2 py-1 rounded text-xs ${categoryColors[task.category] || categoryColors.ADMIN}`}>
          {categoryLabels[task.category] || task.category}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        {task.assignedTo && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{task.assignedTo.firstName}</span>
          </div>
        )}
        {task.dueDate && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{format(new Date(task.dueDate), 'dd.MM')}</span>
          </div>
        )}
      </div>
      {task.attachments && task.attachments.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <FileText className="w-3 h-3" />
          <span>{task.attachments.length}</span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const prev = getPreviousStatus();
            if (prev) {
              onStatusChange(task.id, prev);
              toast.success(`Статус: ${statusColumns.find((s) => s.id === prev)?.label}`);
            }
          }}
          disabled={!getPreviousStatus()}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span className="flex-1 text-center text-[11px] font-medium text-gray-600 dark:text-gray-200 bg-white/60 dark:bg-gray-800/60 px-2 py-1 rounded">
          {statusColumns.find((s) => s.id === task.status)?.label || task.status}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const next = getNextStatus();
            if (next) {
              onStatusChange(task.id, next);
              toast.success(`Статус: ${statusColumns.find((s) => s.id === next)?.label}`);
            }
          }}
          disabled={!getNextStatus()}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, 'DONE');
            toast.success('Статус: Выполнено');
          }}
          className="px-2 py-1 text-xs rounded bg-green-500 text-white hover:bg-green-600"
        >
          <Check className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onSuccess,
  restaurants,
  employees,
}: {
  onClose: () => void;
  onSuccess: () => void;
  restaurants: any[];
  employees: any[];
}) {
  const [formData, setFormData] = useState({
    restaurantId: restaurants[0]?.id || '',
    title: '',
    description: '',
    category: 'ADMIN',
    assignedToId: '',
    dueDate: '',
    isRecurring: false,
    recurringInterval: 'DAILY',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const submitData: any = {
        ...formData,
        recurringRule: formData.isRecurring ? formData.recurringInterval : null,
        dueDate: formData.dueDate || null,
      };
      await api.post('/tasks', submitData);
      toast.success('Задача создана');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка создания задачи');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Создать задачу</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ресторан</label>
            <select
              value={formData.restaurantId}
              onChange={(e) => setFormData({ ...formData, restaurantId: e.target.value })}
              className="input"
              required
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input"
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Исполнитель</label>
            <select
              value={formData.assignedToId}
              onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
              className="input"
            >
              <option value="">Не назначен</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Срок выполнения (опционально)</label>
            <input
              type="datetime-local"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              className="rounded"
            />
            <label className="text-sm text-gray-700 dark:text-gray-300">Повторяющаяся задача</label>
          </div>
          {formData.isRecurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Интервал повторения</label>
              <select
                value={formData.recurringInterval}
                onChange={(e) => setFormData({ ...formData, recurringInterval: e.target.value })}
                className="input"
                required={formData.isRecurring}
              >
                <option value="DAILY">Ежедневно</option>
                <option value="WEEKLY">Еженедельно</option>
                <option value="MONTHLY">Ежемесячно</option>
                <option value="YEARLY">Ежегодно</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  onClose,
  onUpdate,
  employees,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
  employees: any[];
}) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    try {
      setLoading(true);
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      toast.success('Статус обновлен');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка обновления статуса');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Вы уверены, что хотите удалить эту задачу?')) {
      return;
    }
    try {
      setLoading(true);
      await api.delete(`/tasks/${task.id}`);
      toast.success('Задача удалена');
      onUpdate();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления задачи');
    } finally {
      setLoading(false);
    }
  };

  const canEdit = user?.id === task.createdBy?.id || ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');
  const canDelete = user?.id === task.createdBy?.id || ['OWNER', 'ADMIN', 'MANAGER'].includes(user?.role || '');

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-gray-900">{task.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className={`px-2 py-1 rounded text-xs ${categoryColors[task.category] || categoryColors.ADMIN}`}>
                  {categoryLabels[task.category] || task.category}
                </span>
                <span className="ml-2 px-2 py-1 rounded text-xs bg-gray-100">
                  {statusColumns.find((s) => s.id === task.status)?.label || task.status}
                </span>
              </div>
              <div className="flex gap-2">
                {task.status !== 'DONE' && (
                  <button
                    onClick={() => handleStatusChange('DONE')}
                    disabled={loading}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Check className="w-4 h-4" />
                    Завершить
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    disabled={loading}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Edit className="w-4 h-4" />
                    Редактировать
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="btn-secondary flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                )}
              </div>
            </div>
            {task.description && <p className="text-gray-700">{task.description}</p>}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Создал:</span> {task.createdBy?.firstName} {task.createdBy?.lastName}
              </div>
              {task.assignedTo && (
                <div>
                  <span className="font-medium">Исполнитель:</span> {task.assignedTo.firstName} {task.assignedTo.lastName}
                </div>
              )}
              {task.dueDate && (
                <div>
                  <span className="font-medium">Срок:</span> {format(new Date(task.dueDate), 'dd.MM.yyyy HH:mm')}
                </div>
              )}
              <div>
                <span className="font-medium">Создана:</span> {format(new Date(task.createdAt), 'dd.MM.yyyy')}
              </div>
              {task.isRecurring && (
                <div>
                  <span className="font-medium">Повторение:</span>{' '}
                  {task.recurringRule === 'DAILY' && 'Ежедневно'}
                  {task.recurringRule === 'WEEKLY' && 'Еженедельно'}
                  {task.recurringRule === 'MONTHLY' && 'Ежемесячно'}
                  {task.recurringRule === 'YEARLY' && 'Ежегодно'}
                  {!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(task.recurringRule || '') && (task.recurringRule || 'Не указано')}
                </div>
              )}
            </div>
            {task.attachments && task.attachments.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Вложения ({task.attachments.length})</h3>
                <div className="space-y-2">
                  {task.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={`/uploads/${att.fileName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <FileText className="w-4 h-4" />
                      {att.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-4 border-t">
              {statusColumns.map((status) => (
                status.id !== task.status && (
                  <button
                    key={status.id}
                    onClick={() => handleStatusChange(status.id)}
                    disabled={loading}
                    className="btn-secondary text-sm"
                  >
                    {status.label}
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      </div>
      {showEditModal && (
        <EditTaskModal
          task={task}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            onUpdate();
          }}
          employees={employees}
        />
      )}
    </>
  );
}

function EditTaskModal({
  task,
  onClose,
  onSuccess,
  employees,
}: {
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
  employees: any[];
}) {
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description || '',
    category: task.category,
    assignedToId: task.assignedTo?.id || '',
    dueDate: task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd'T'HH:mm") : '',
    isRecurring: task.isRecurring,
    recurringInterval: task.recurringRule || 'DAILY',
    status: task.status,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const submitData: any = {
        title: formData.title,
        description: formData.description || '',
        category: formData.category,
        status: formData.status,
        restaurantId: (task as any).restaurantId || task.restaurant?.id,
      };

      if (formData.assignedToId) {
        submitData.assignedToId = formData.assignedToId;
      }
      if (formData.dueDate) {
        submitData.dueDate = formData.dueDate;
      }
      if (formData.isRecurring) {
        submitData.isRecurring = true;
        submitData.recurringRule = formData.recurringInterval;
      } else {
        submitData.isRecurring = false;
      }

      await api.put(`/tasks/${task.id}`, submitData);
      toast.success('Задача обновлена');
      onSuccess();
    } catch (error: any) {
      const firstValidation = error.response?.data?.errors?.[0]?.msg;
      const msg = error.response?.data?.error || firstValidation || 'Ошибка обновления задачи';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">Редактировать задачу</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input"
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input"
            >
              {statusColumns.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label>
            <select
              value={formData.assignedToId}
              onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
              className="input"
            >
              <option value="">Не назначен</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Срок выполнения (опционально)</label>
            <input
              type="datetime-local"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              className="rounded"
            />
            <label className="text-sm text-gray-700">Повторяющаяся задача</label>
          </div>
          {formData.isRecurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Интервал повторения</label>
              <select
                value={formData.recurringInterval}
                onChange={(e) => setFormData({ ...formData, recurringInterval: e.target.value })}
                className="input"
                required={formData.isRecurring}
              >
                <option value="DAILY">Ежедневно</option>
                <option value="WEEKLY">Еженедельно</option>
                <option value="MONTHLY">Ежемесячно</option>
                <option value="YEARLY">Ежегодно</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
