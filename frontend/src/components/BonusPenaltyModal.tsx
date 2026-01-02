import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

interface Bonus {
  id: string;
  amount: number;
  comment: string | null;
  createdAt: string;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  month: number | null;
  year: number | null;
}

interface Penalty {
  id: string;
  amount: number;
  comment: string | null;
  createdAt: string;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  month: number | null;
  year: number | null;
}

interface BonusPenaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  restaurantId: string;
  month: number;
  year: number;
  bonuses: Bonus[];
  penalties: Penalty[];
  onReload: () => void;
  onAddBonus: (data: { userId: string; restaurantId: string; amount: number; comment?: string; month: number; year: number }) => Promise<void>;
  onAddPenalty: (data: { userId: string; restaurantId: string; amount: number; comment?: string; month: number; year: number }) => Promise<void>;
  onDeleteBonus: (id: string) => Promise<void>;
  onDeletePenalty: (id: string) => Promise<void>;
  canEdit: boolean;
}

export default function BonusPenaltyModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  restaurantId,
  month,
  year,
  bonuses,
  penalties,
  onReload,
  onAddBonus,
  onAddPenalty,
  onDeleteBonus,
  onDeletePenalty,
  canEdit,
}: BonusPenaltyModalProps) {
  const [showAddBonus, setShowAddBonus] = useState(false);
  const [showAddPenalty, setShowAddPenalty] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusComment, setBonusComment] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyComment, setPenaltyComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowAddBonus(false);
      setShowAddPenalty(false);
      setBonusAmount('');
      setBonusComment('');
      setPenaltyAmount('');
      setPenaltyComment('');
    }
  }, [isOpen]);

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusAmount || parseFloat(bonusAmount) <= 0) return;
    
    setLoading(true);
    try {
      const bonusData: {
        userId: string;
        restaurantId: string;
        amount: number;
        comment?: string;
        month: number;
        year: number;
      } = {
        userId: employeeId,
        restaurantId,
        amount: parseFloat(bonusAmount),
        month,
        year,
      };
      if (bonusComment.trim()) {
        bonusData.comment = bonusComment.trim();
      }
      await onAddBonus(bonusData);
      setBonusAmount('');
      setBonusComment('');
      setShowAddBonus(false);
      onReload();
    } catch (error) {
      // Ошибка обрабатывается в родительском компоненте
    } finally {
      setLoading(false);
    }
  };

  const handleAddPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penaltyAmount || parseFloat(penaltyAmount) <= 0) return;
    
    setLoading(true);
    try {
      const penaltyData: {
        userId: string;
        restaurantId: string;
        amount: number;
        comment?: string;
        month: number;
        year: number;
      } = {
        userId: employeeId,
        restaurantId,
        amount: parseFloat(penaltyAmount),
        month,
        year,
      };
      if (penaltyComment.trim()) {
        penaltyData.comment = penaltyComment.trim();
      }
      await onAddPenalty(penaltyData);
      setPenaltyAmount('');
      setPenaltyComment('');
      setShowAddPenalty(false);
      onReload();
    } catch (error) {
      // Ошибка обрабатывается в родительском компоненте
    } finally {
      setLoading(false);
    }
  };

  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0);
  const netAmount = totalBonuses - totalPenalties;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Премии и штрафы</h2>
              <p className="text-sm text-gray-600 mt-1">{employeeName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Сводка */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">Премии</span>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-900">{totalBonuses.toFixed(2)} ₽</p>
              <p className="text-xs text-green-600 mt-1">{bonuses.length} записей</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700">Штрафы</span>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-900">{totalPenalties.toFixed(2)} ₽</p>
              <p className="text-xs text-red-600 mt-1">{penalties.length} записей</p>
            </div>
            <div className={`p-4 rounded-lg border ${
              netAmount >= 0 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${
                  netAmount >= 0 ? 'text-blue-700' : 'text-orange-700'
                }`}>
                  Итого
                </span>
              </div>
              <p className={`text-2xl font-bold ${
                netAmount >= 0 ? 'text-blue-900' : 'text-orange-900'
              }`}>
                {netAmount >= 0 ? '+' : ''}{netAmount.toFixed(2)} ₽
              </p>
            </div>
          </div>

          {/* Премии */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Премии</h3>
              {canEdit && (
                <button
                  onClick={() => setShowAddBonus(!showAddBonus)}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить премию
                </button>
              )}
            </div>

            {showAddBonus && canEdit && (
              <form onSubmit={handleAddBonus} className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Сумма (₽) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={bonusAmount}
                      onChange={(e) => setBonusAmount(e.target.value)}
                      className="input w-full"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Комментарий
                    </label>
                    <input
                      type="text"
                      value={bonusComment}
                      onChange={(e) => setBonusComment(e.target.value)}
                      className="input w-full"
                      placeholder="Причина премии"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="submit"
                    disabled={loading || !bonusAmount}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Добавить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBonus(false);
                      setBonusAmount('');
                      setBonusComment('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {bonuses.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Нет премий</p>
              ) : (
                bonuses.map((bonus) => (
                  <div key={bonus.id} className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-green-900">+{bonus.amount.toFixed(2)} ₽</span>
                      </div>
                      {bonus.comment && (
                        <p className="text-sm text-gray-600 mb-1">{bonus.comment}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Начислил: {bonus.createdBy ? `${bonus.createdBy.firstName} ${bonus.createdBy.lastName}` : 'Неизвестный'} • {format(new Date(bonus.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => {
                          if (confirm('Удалить эту премию?')) {
                            onDeleteBonus(bonus.id);
                          }
                        }}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Удалить премию"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Штрафы */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Штрафы</h3>
              {canEdit && (
                <button
                  onClick={() => setShowAddPenalty(!showAddPenalty)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить штраф
                </button>
              )}
            </div>

            {showAddPenalty && canEdit && (
              <form onSubmit={handleAddPenalty} className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Сумма (₽) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={penaltyAmount}
                      onChange={(e) => setPenaltyAmount(e.target.value)}
                      className="input w-full"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Комментарий
                    </label>
                    <input
                      type="text"
                      value={penaltyComment}
                      onChange={(e) => setPenaltyComment(e.target.value)}
                      className="input w-full"
                      placeholder="Причина штрафа"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="submit"
                    disabled={loading || !penaltyAmount}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Добавить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPenalty(false);
                      setPenaltyAmount('');
                      setPenaltyComment('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {penalties.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Нет штрафов</p>
              ) : (
                penalties.map((penalty) => (
                  <div key={penalty.id} className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-red-900">-{penalty.amount.toFixed(2)} ₽</span>
                      </div>
                      {penalty.comment && (
                        <p className="text-sm text-gray-600 mb-1">{penalty.comment}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Назначил: {penalty.createdBy ? `${penalty.createdBy.firstName} ${penalty.createdBy.lastName}` : 'Неизвестный'} • {format(new Date(penalty.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => {
                          if (confirm('Удалить этот штраф?')) {
                            onDeletePenalty(penalty.id);
                          }
                        }}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Удалить штраф"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

