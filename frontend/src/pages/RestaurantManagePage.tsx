import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { useAuthStore } from '../store/authStore';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, Edit2, Trash2, Building2, ArrowLeft, Shield, Save, X, MessageCircle, Copy, Check, UserCircle } from 'lucide-react';

export default function RestaurantManagePage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'departments' | 'positions' | 'employees' | 'shift-types'>('departments');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (restaurantId) {
      loadRestaurant();
    }
  }, [restaurantId]);

  const loadRestaurant = async () => {
    try {
      setLoading(true);
      const response = await api.get('/restaurants');
      const found = response.data.restaurants?.find((r: any) => r.id === restaurantId);
      setRestaurant(found);
    } catch (error) {
      toast.error('Ошибка загрузки ресторана');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-gray-500">Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-red-500">Ресторан не найден</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <button
          onClick={() => navigate('/restaurants')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к ресторанам
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{restaurant.name}</h1>
              {restaurant.address && (
                <p className="text-sm text-gray-600">{restaurant.address}</p>
              )}
            </div>
          </div>
        </div>

        {/* Табы */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('departments')}
              className={`${
                activeTab === 'departments'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Отделы
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`${
                activeTab === 'positions'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Должности
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`${
                activeTab === 'employees'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Сотрудники
            </button>
            <button
              onClick={() => setActiveTab('shift-types')}
              className={`${
                activeTab === 'shift-types'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Типы смен
            </button>
          </nav>
        </div>

        {/* Контент табов */}
        {activeTab === 'departments' && <DepartmentsTab restaurantId={restaurantId!} />}
        {activeTab === 'positions' && <PositionsTab restaurantId={restaurantId!} />}
        {activeTab === 'employees' && <EmployeesTab restaurantId={restaurantId!} />}
        {activeTab === 'shift-types' && <ShiftTypesTab restaurantId={restaurantId!} />}
      </div>
    </div>
  );
}

function DepartmentsTab({ restaurantId }: { restaurantId: string }) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);

  useEffect(() => {
    loadDepartments();
  }, [restaurantId]);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/departments/${restaurantId}`);
      setDepartments(response.data.departments || []);
    } catch (error) {
      toast.error('Ошибка загрузки отделов');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить отдел?')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Отдел удален');
      loadDepartments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  if (loading) {
    return <div className="text-gray-500">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Отделы</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить отдел
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="card p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {dept.isActive ? 'Активен' : 'Неактивен'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingDept(dept)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(dept.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <DepartmentModal
          restaurantId={restaurantId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadDepartments();
            setShowCreateModal(false);
          }}
        />
      )}

      {editingDept && (
        <DepartmentModal
          restaurantId={restaurantId}
          department={editingDept}
          onClose={() => {
            setEditingDept(null);
          }}
          onSuccess={() => {
            loadDepartments();
            setEditingDept(null);
          }}
        />
      )}
    </div>
  );
}

function PositionsTab({ restaurantId }: { restaurantId: string }) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPos, setEditingPos] = useState<any>(null);
  const [managingPermissionsPos, setManagingPermissionsPos] = useState<any>(null);

  useEffect(() => {
    loadPositions();
  }, [restaurantId]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/positions/${restaurantId}`);
      setPositions(response.data.positions || []);
    } catch (error) {
      toast.error('Ошибка загрузки должностей');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить должность?')) return;
    try {
      await api.delete(`/positions/${id}`);
      toast.success('Должность удалена');
      loadPositions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  if (loading) {
    return <div className="text-gray-500">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Должности</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить должность
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {positions.map((pos) => (
          <div key={pos.id} className="card p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">{pos.name}</h3>
                {pos.bonusPerShift > 0 && (
                  <p className="text-sm text-gray-500 mt-1">Надбавка: {pos.bonusPerShift} ₽/смена</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setManagingPermissionsPos(pos)}
                  className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                  title="Управление правами"
                >
                  <Shield className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingPos(pos)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Редактировать"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(pos.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <PositionModal
          restaurantId={restaurantId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadPositions();
            setShowCreateModal(false);
          }}
        />
      )}

      {editingPos && (
        <PositionModal
          restaurantId={restaurantId}
          position={editingPos}
          onClose={() => setEditingPos(null)}
          onSuccess={() => {
            loadPositions();
            setEditingPos(null);
          }}
        />
      )}

      {managingPermissionsPos && (
        <PermissionsModal
          position={managingPermissionsPos}
          onClose={() => setManagingPermissionsPos(null)}
          onSuccess={() => {
            setManagingPermissionsPos(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeesTab({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuthStore();
  const isOwner = user?.role === 'OWNER';
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<string>('');

  useEffect(() => {
    loadEmployees();
    loadFilters();
  }, [restaurantId]);

  const loadFilters = async () => {
    try {
      const [departmentsRes, positionsRes] = await Promise.all([
        api.get(`/departments/${restaurantId}`),
        api.get(`/positions/${restaurantId}`),
      ]);
      setDepartments(departmentsRes.data.departments || []);
      setPositions(positionsRes.data.positions || []);
    } catch (error) {
      console.error('Ошибка загрузки фильтров:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/employees/${restaurantId}`);
      setEmployees(response.data.employees || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки сотрудников');
      console.error('Ошибка загрузки сотрудников:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить сотрудника?')) return;
    try {
      await api.delete(`/employees/${restaurantId}/${id}`);
      toast.success('Сотрудник удален');
      loadEmployees();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (selectedDepartment && emp.departmentId !== selectedDepartment) return false;
    if (selectedPosition && emp.positionId !== selectedPosition) return false;
    return true;
  });

  if (loading) {
    return <div className="text-gray-500">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Сотрудники</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Пригласить через Telegram
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить сотрудника
          </button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Отдел</label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="select"
          >
            <option value="">Все отделы</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Должность</label>
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="select"
          >
            <option value="">Все должности</option>
            {positions.map((pos) => (
              <option key={pos.id} value={pos.id}>
                {pos.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Имя</th>
              {isOwner && (
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Логин</th>
              )}
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Телефон</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Должность</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Отдел</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={isOwner ? 6 : 5} className="text-center py-8 text-gray-500">
                  Сотрудники не найдены
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {emp.firstName} {emp.lastName}
                  </td>
                  {isOwner && (
                    <td className="py-3 px-4 text-gray-600 text-sm">{emp.email || '-'}</td>
                  )}
                  <td className="py-3 px-4 text-gray-600">{emp.phone || '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{emp.position?.name || '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{emp.department?.name || '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/employees/${emp.id}/profile?restaurantId=${restaurantId}`}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Профиль сотрудника"
                      >
                        <UserCircle className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => setEditingEmp(emp)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(emp.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <EmployeeModal
          restaurantId={restaurantId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadEmployees();
            setShowCreateModal(false);
          }}
        />
      )}

      {editingEmp && (
        <EmployeeModal
          restaurantId={restaurantId}
          employee={editingEmp}
          onClose={() => setEditingEmp(null)}
          onSuccess={() => {
            loadEmployees();
            setEditingEmp(null);
          }}
        />
      )}

      {showInviteModal && (
        <InviteLinkModal
          restaurantId={restaurantId}
          positions={positions}
          departments={departments}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}

function DepartmentModal({
  restaurantId,
  department,
  onClose,
  onSuccess,
}: {
  restaurantId: string;
  department?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: department?.name || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (department) {
        await api.put(`/departments/${department.id}`, formData);
        toast.success('Отдел обновлен');
      } else {
        await api.post(`/departments/${restaurantId}`, formData);
        toast.success('Отдел создан');
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-6">{department ? 'Редактировать отдел' : 'Добавить отдел'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="Например: Кухня"
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PositionModal({
  restaurantId,
  position,
  onClose,
  onSuccess,
}: {
  restaurantId: string;
  position?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: position?.name || '',
    bonusPerShift: position?.bonusPerShift || 0,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (position) {
        await api.put(`/positions/${position.id}`, formData);
        toast.success('Должность обновлена');
      } else {
        await api.post(`/positions/${restaurantId}`, formData);
        toast.success('Должность создана');
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-6">{position ? 'Редактировать должность' : 'Добавить должность'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="Например: Официант"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Надбавка к смене (₽) - может быть 0
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.bonusPerShift}
              onChange={(e) => setFormData({ ...formData, bonusPerShift: parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="0.00"
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmployeeModal({
  restaurantId,
  employee,
  onClose,
  onSuccess,
}: {
  restaurantId: string;
  employee?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuthStore();
  const isOwner = user?.role === 'OWNER';
  
  const [formData, setFormData] = useState({
    email: employee?.email || '',
    firstName: employee?.firstName || '',
    lastName: employee?.lastName || '',
    phone: employee?.phone || '',
    password: '',
    positionId: employee?.positionId || '',
    departmentId: employee?.departmentId || '',
  });
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Обновляем форму при изменении employee (для загрузки email)
  useEffect(() => {
    if (employee) {
      setFormData({
        email: employee.email || '',
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        phone: employee.phone || '',
        password: '',
        positionId: employee.positionId || '',
        departmentId: employee.departmentId || '',
      });
    }
  }, [employee]);

  const loadData = async () => {
    try {
      const [positionsRes, departmentsRes] = await Promise.all([
        api.get(`/positions/${restaurantId}`),
        api.get(`/departments/${restaurantId}`),
      ]);
      setPositions(positionsRes.data.positions || []);
      setDepartments(departmentsRes.data.departments || []);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (employee) {
        const updatePayload: any = {
          positionId: formData.positionId,
          departmentId: formData.departmentId || null,
        };
        
        // OWNER может обновлять логин и пароль
        if (isOwner) {
          // Отправляем email только если он изменился и не пустой
          const trimmedEmail = formData.email?.trim();
          if (trimmedEmail && trimmedEmail !== employee.email) {
            updatePayload.email = trimmedEmail;
          }
          
          // Отправляем пароль только если он указан (не пустой)
          const trimmedPassword = formData.password?.trim();
          if (trimmedPassword) {
            updatePayload.password = trimmedPassword;
          }
        }
        
        await api.put(`/employees/${restaurantId}/${employee.id}`, updatePayload);
        toast.success('Сотрудник обновлен');
      } else {
        const payload: any = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          positionId: formData.positionId,
          departmentId: formData.departmentId || undefined,
        };
        
        // Добавляем логин только если он указан
        if (formData.email && formData.email.trim()) {
          payload.email = formData.email.trim();
        }
        
        // Добавляем пароль только если он указан
        if (formData.password && formData.password.trim()) {
          payload.password = formData.password;
        }
        
        const response = await api.post(`/employees/${restaurantId}`, payload);
        const employeeEmail = response.data?.employee?.user?.email || payload.email;
        if (employeeEmail) {
          toast.success(`Сотрудник добавлен. Логин: ${employeeEmail}`);
        } else {
          toast.success('Сотрудник добавлен');
        }
      }
      onSuccess();
    } catch (error: any) {
      console.error('Ошибка сохранения сотрудника:', error);
      let errorMessage = 'Ошибка сохранения';
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        errorMessage = error.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">
          {employee ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(!employee || isOwner) && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Логин (Email)</label>
                <input
                  type="text"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  placeholder={employee ? employee.email || 'Введите новый логин' : 'Оставьте пустым для автогенерации'}
                  disabled={employee && !isOwner}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {employee ? 'Измените логин для сотрудника' : 'Логин для первого входа в систему'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input"
                  placeholder={employee ? 'Оставьте пустым, чтобы не менять пароль' : 'Оставьте пустым для Temp123!'}
                  disabled={employee && !isOwner}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {employee ? 'Введите новый пароль (оставьте пустым, чтобы не менять)' : 'Сотрудник сможет изменить пароль после первого входа'}
                </p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Должность <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.positionId}
              onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
              className="select"
              required
            >
              <option value="">Выберите должность</option>
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {pos.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Отдел</label>
            <select
              value={formData.departmentId}
              onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
              className="select"
            >
              <option value="">Без отдела</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionsModal({
  position,
  onClose,
  onSuccess,
}: {
  position: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, any[]>>({});
  const [positionPermissions, setPositionPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, [position.id]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const [allPermsRes, positionPermsRes] = await Promise.all([
        api.get('/permissions'),
        api.get(`/permissions/position/${position.id}`),
      ]);

      setGroupedPermissions(allPermsRes.data.grouped || {});

      const posPerms = positionPermsRes.data.permissions || [];
      setPositionPermissions(posPerms.map((p: any) => p.id));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка загрузки прав');
      console.error('Ошибка загрузки прав доступа:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (permissionId: string) => {
    setPositionPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSelectAll = (category: string) => {
    const categoryPerms = groupedPermissions[category] || [];
    const categoryIds = categoryPerms.map((p: any) => p.id);
    const allSelected = categoryIds.every((id: string) => positionPermissions.includes(id));

    if (allSelected) {
      // Убираем все права категории
      setPositionPermissions((prev) => prev.filter((id) => !categoryIds.includes(id)));
    } else {
      // Добавляем все права категории
      setPositionPermissions((prev) => {
        const newPerms = [...prev];
        categoryIds.forEach((id) => {
          if (!newPerms.includes(id)) {
            newPerms.push(id);
          }
        });
        return newPerms;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put(`/permissions/position/${position.id}`, {
        permissionIds: positionPermissions,
      });
      toast.success('Права доступа обновлены');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка сохранения прав');
      console.error('Ошибка сохранения прав доступа:', error);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (category: string) => {
    const categoryNames: Record<string, string> = {
      RESTAURANTS: 'Рестораны',
      SCHEDULE: 'График работы',
      SHIFT_TYPES: 'Типы смен',
      TASKS: 'Задачи',
      TIMESHEETS: 'Табели',
      EMPLOYEES: 'Сотрудники',
      POSITIONS: 'Должности',
      DEPARTMENTS: 'Отделы',
    };
    return categoryNames[category] || category;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="card p-6 w-full max-w-2xl">
          <div className="text-center text-gray-500">Загрузка прав доступа...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Управление правами доступа</h2>
            <p className="text-sm text-gray-600 mt-1">Должность: {position.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {Object.entries(groupedPermissions).map(([category, permissions]) => {
              const categoryPerms = permissions as any[];
              const categoryIds = categoryPerms.map((p: any) => p.id);
              const allSelected = categoryIds.every((id: string) => positionPermissions.includes(id));

              return (
                <div key={category} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{getCategoryName(category)}</h3>
                    <button
                      type="button"
                      onClick={() => handleSelectAll(category)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {allSelected ? 'Снять все' : 'Выбрать все'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {categoryPerms.map((perm: any) => (
                      <label
                        key={perm.id}
                        className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={positionPermissions.includes(perm.id)}
                          onChange={() => handleTogglePermission(perm.id)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">{perm.name}</span>
                          {perm.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end mt-6 pt-6 border-t border-gray-200">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Сохранение...' : 'Сохранить права'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteLinkModal({
  restaurantId,
  positions,
  departments,
  onClose,
}: {
  restaurantId: string;
  positions: any[];
  departments: any[];
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    positionId: '',
    departmentId: '',
  });
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload: any = {
        restaurantId,
      };
      
      if (formData.positionId) {
        payload.positionId = formData.positionId;
      }
      
      if (formData.departmentId) {
        payload.departmentId = formData.departmentId;
      }

      const response = await api.post('/invite-links', payload);
      setInviteLink(response.data.inviteLink.url);
      toast.success('Пригласительная ссылка создана!');
    } catch (error: any) {
      console.error('Ошибка создания пригласительной ссылки:', error);
      let errorMessage = 'Ошибка создания ссылки';
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        errorMessage = error.response.data.errors.map((e: any) => e.msg || e.message).join(', ');
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (inviteLink) {
      try {
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        toast.success('Ссылка скопирована в буфер обмена');
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        toast.error('Не удалось скопировать ссылку');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Пригласить через Telegram</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!inviteLink ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Создайте пригласительную ссылку для регистрации сотрудника через Telegram бота. 
              Сотрудник получит ссылку, перейдет по ней в Telegram и зарегистрируется автоматически.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Должность (опционально)
              </label>
              <select
                value={formData.positionId}
                onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                className="select"
              >
                <option value="">Не указывать</option>
                {positions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Если указать должность, сотрудник будет автоматически назначен на неё
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Отдел (опционально)
              </label>
              <select
                value={formData.departmentId}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                className="select"
              >
                <option value="">Не указывать</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Если указать отдел, сотрудник будет автоматически добавлен в него
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">
                Отмена
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                {loading ? 'Создание...' : 'Создать ссылку'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium mb-2">✅ Ссылка создана!</p>
              <p className="text-sm text-green-700">
                Скопируйте ссылку и отправьте сотруднику через Telegram или любым другим способом.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пригласительная ссылка
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="input flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-secondary flex items-center gap-2 px-4"
                  title="Копировать"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Скопировано
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Копировать
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium mb-2">Как использовать:</p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Скопируйте ссылку</li>
                <li>Отправьте её сотруднику через Telegram или другой мессенджер</li>
                <li>Сотрудник переходит по ссылке в Telegram бота</li>
                <li>Бот автоматически зарегистрирует сотрудника в системе</li>
              </ol>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <button
                onClick={() => {
                  setInviteLink(null);
                  setFormData({ positionId: '', departmentId: '' });
                }}
                className="btn-secondary"
              >
                Создать новую ссылку
              </button>
              <button onClick={onClose} className="btn-primary">
                Готово
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Интерфейс для типа смены
interface ShiftTemplate {
  id: string;
  restaurantId?: string;
  name: string;
  startHour: number;
  endHour: number;
  color?: string;
  rate?: number;
  isActive: boolean;
}

// Вкладка "Типы смен"
function ShiftTypesTab({ restaurantId }: { restaurantId: string }) {
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { hasPermission } = usePermissions(restaurantId);

  useEffect(() => {
    loadTemplates();
  }, [restaurantId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/shift-templates', {
        params: { restaurantId },
      });
      setTemplates(response.data.templates || []);
    } catch (error: any) {
      toast.error('Ошибка загрузки типов смен');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот тип смены?')) {
      return;
    }

    try {
      await api.delete(`/shift-templates/${id}`);
      toast.success('Тип смены удален');
      loadTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  const canEdit = hasPermission('EDIT_SHIFT_TYPES');

  if (loading) {
    return <div className="text-gray-500">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Типы смен</h2>
        {canEdit && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить тип смены
          </button>
        )}
      </div>

      {/* Список типов смен */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Название
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Время
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Продолжительность
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Ставка (₽)
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Цвет
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Статус
                </th>
                {canEdit && (
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((template) => (
                <ShiftTemplateRow
                  key={template.id}
                  template={template}
                  onUpdate={loadTemplates}
                  onDelete={handleDelete}
                  canEdit={canEdit}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                    Нет типов смен. {canEdit && 'Создайте первый тип смены.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateShiftTemplateModal
          restaurantId={restaurantId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadTemplates();
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// Компонент строки типа смены
function ShiftTemplateRow({
  template,
  onUpdate,
  onDelete,
  canEdit,
  editingId,
  setEditingId,
}: {
  template: ShiftTemplate;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const [formData, setFormData] = useState({
    name: template.name,
    startHour: template.startHour,
    endHour: template.endHour,
    color: template.color || '',
    rate: template.rate || 0,
    isActive: template.isActive,
  });
  const [loading, setLoading] = useState(false);
  const isEditing = editingId === template.id;

  const handleSave = async () => {
    try {
      setLoading(true);
      await api.put(`/shift-templates/${template.id}`, formData);
      toast.success('Тип смены обновлен');
      setEditingId(null);
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка обновления');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: template.name,
      startHour: template.startHour,
      endHour: template.endHour,
      color: template.color || '',
      rate: template.rate || 0,
      isActive: template.isActive,
    });
    setEditingId(null);
  };

  const duration = template.endHour >= template.startHour
    ? template.endHour - template.startHour
    : (24 - template.startHour) + template.endHour;

  const timeDisplay = `${String(template.startHour).padStart(2, '0')}:00 - ${String(template.endHour).padStart(2, '0')}:00`;

  if (isEditing) {
    return (
      <tr className="bg-primary-50/50">
        <td className="px-4 sm:px-6 py-4">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
          />
        </td>
        <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="23"
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) })}
              className="input w-16"
            />
            <span>-</span>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) })}
              className="input w-16"
            />
          </div>
        </td>
        <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
          {duration} ч
        </td>
        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.rate}
            onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
            className="input w-24"
            placeholder="0"
          />
        </td>
        <td className="px-4 sm:px-6 py-4">
          <input
            type="color"
            value={formData.color || '#3b82f6'}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="w-12 h-8 border border-gray-300 rounded-lg cursor-pointer"
          />
        </td>
        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded"
            />
            <span className="ml-2 text-sm">{formData.isActive ? 'Активен' : 'Неактивен'}</span>
          </label>
        </td>
        <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors"
            >
              <Save className="w-5 h-5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 sm:px-6 py-4 text-sm font-medium text-gray-900">
        <div className="flex flex-col">
          <span>{template.name}</span>
          <span className="sm:hidden text-xs text-gray-500 mt-1">{timeDisplay} • {duration}ч</span>
        </div>
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
        {timeDisplay}
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
        {duration} часов
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 hidden md:table-cell">
        {template.rate || 0} ₽
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
        <div
          className="w-8 h-8 rounded-lg shadow-sm"
          style={{ backgroundColor: template.color || '#3b82f6' }}
        />
      </td>
      <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
        <span
          className={`px-2 py-1 text-xs rounded-full font-medium ${
            template.isActive
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {template.isActive ? 'Активен' : 'Неактивен'}
        </span>
      </td>
      {canEdit && (
        <td className="px-4 sm:px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingId(template.id)}
              className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => onDelete(template.id)}
              className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// Модальное окно создания типа смены
function CreateShiftTemplateModal({
  restaurantId,
  onClose,
  onSuccess,
}: {
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    startHour: 9,
    endHour: 18,
    color: '#3b82f6',
    rate: 0,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/shift-templates', {
        ...formData,
        restaurantId,
      });
      toast.success('Тип смены создан');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Ошибка создания типа смены');
    } finally {
      setLoading(false);
    }
  };

  const duration = formData.endHour >= formData.startHour
    ? formData.endHour - formData.startHour
    : (24 - formData.startHour) + formData.endHour;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">Добавить тип смены</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название типа смены
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Полная смена"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Время начала (час)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) || 0 })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Время окончания (час)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) || 0 })}
              className="input"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Продолжительность: {duration} часов
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ставка за смену (₽)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Цвет для отображения
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="#3b82f6"
              />
            </div>
          </div>

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