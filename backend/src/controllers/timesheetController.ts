import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

// Автоматический расчет табеля на основе смен
export const calculateTimesheet = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.body;

    // Получаем все смены за месяц
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        userId,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
        isConfirmed: true,
      },
    });

    // Рассчитываем показатели
    let totalHours = 0;
    let overtimeHours = 0;
    let lateCount = 0;
    const standardHoursPerDay = 8;
    const standardHoursPerMonth = 176; // Примерно

    shifts.forEach((shift) => {
      totalHours += shift.hours;

      // Проверка опозданий (если есть время фактического начала)
      // Здесь можно добавить логику проверки опозданий

      // Проверка переработки
      if (shift.hours > standardHoursPerDay) {
        overtimeHours += shift.hours - standardHoursPerDay;
      }
    });

    // Проверяем, существует ли табель
    const existing = await prisma.timesheet.findFirst({
      where: {
        restaurantId,
        userId,
        month,
        year,
      },
    });

    let timesheet;
    if (existing) {
      timesheet = await prisma.timesheet.update({
        where: { id: existing.id },
        data: {
          totalHours,
          overtimeHours,
          lateCount,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } else {
      timesheet = await prisma.timesheet.create({
        data: {
          restaurantId,
          userId,
          month,
          year,
          totalHours,
          overtimeHours,
          lateCount,
          isApproved: false,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    }

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Calculated timesheet for ${timesheet.user.firstName} ${timesheet.user.lastName} - ${month}/${year}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

// Получение табелей
export const getTimesheets = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.query;

    const where: any = {};

    if (restaurantId) where.restaurantId = restaurantId as string;
    if (userId) where.userId = userId as string;
    if (month) where.month = parseInt(month as string);
    if (year) where.year = parseInt(year as string);

    // Проверяем права доступа для фильтрации табелей
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      if (restaurantId) {
        const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
        const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
        
        // Если есть только VIEW_OWN, показываем только свои табели
        if (!hasViewAll && hasViewOwn) {
          where.userId = req.user.id;
        } else if (!hasViewAll && !hasViewOwn) {
          // Нет прав вообще - возвращаем пустой список
          res.json({ timesheets: [] });
          return;
        }
      }
    }

    const timesheets = await prisma.timesheet.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
    });

    res.json({ timesheets });
  } catch (error) {
    next(error);
  }
};

// Обновление табеля (ручная коррекция)
export const updateTimesheet = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Только менеджер, админ или владелец могут редактировать табели
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const { totalHours, overtimeHours, lateCount, sickDays, vacationDays, notes } = req.body;

    const updateData: any = {};
    if (totalHours !== undefined) updateData.totalHours = parseFloat(totalHours);
    if (overtimeHours !== undefined) updateData.overtimeHours = parseFloat(overtimeHours);
    if (lateCount !== undefined) updateData.lateCount = parseInt(lateCount);
    if (sickDays !== undefined) updateData.sickDays = parseInt(sickDays);
    if (vacationDays !== undefined) updateData.vacationDays = parseInt(vacationDays);
    if (notes !== undefined) updateData.notes = notes;

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Updated timesheet for ${timesheet.user.firstName} ${timesheet.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

// Одобрение табеля
export const approveTimesheet = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;

    const timesheet = await prisma.timesheet.update({
      where: { id },
      data: {
        isApproved: true,
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await logAction({
      userId: req.user.id,
      type: 'APPROVE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Approved timesheet for ${timesheet.user.firstName} ${timesheet.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

// Получение табеля с расчетом заработка по типам смен
export const getTimesheetWithEarnings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.query;

    if (!restaurantId || !userId || !month || !year) {
      res.status(400).json({ error: 'restaurantId, userId, month, and year are required' });
      return;
    }

    // Проверка доступа - проверяем права VIEW_OWN_TIMESHEETS или VIEW_ALL_TIMESHEETS
    const { checkPermission } = await import('../utils/checkPermissions');
    const { PERMISSIONS } = await import('../utils/permissions');
    
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
      
      if (!hasViewAll && !hasViewOwn) {
        res.status(403).json({ error: 'Forbidden: No permission to view timesheets' });
        return;
      }
      
      // Если есть только VIEW_OWN, проверяем что запрашивается свой табель
      if (!hasViewAll && hasViewOwn && req.user.id !== userId) {
        res.status(403).json({ error: 'Forbidden: Can only view own timesheet' });
        return;
      }
    }

    const startDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59);
    endDate.setHours(23, 59, 59, 999);

    // Получаем все смены за месяц (включая неподтвержденные)
    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId: restaurantId as string,
        userId: userId as string,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
        // Убираем фильтр isConfirmed, чтобы считать все смены
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Получаем информацию о сотруднике и его должности
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId: restaurantId as string,
        userId: userId as string,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
            bonusPerShift: true,
          },
        },
      },
    });

    if (!restaurantUser) {
      res.status(404).json({ error: 'Employee not found in restaurant' });
      return;
    }

    // Получаем все шаблоны смен
    const templates = await prisma.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null }, // Общие шаблоны
        ],
        isActive: true,
      },
    });

    // Группируем смены по типу и считаем
    const shiftGroups: Record<string, {
      templateId: string;
      templateName: string;
      count: number;
      rate: number;
      bonusPerShift: number;
      totalEarnings: number;
    }> = {};

    shifts.forEach((shift) => {
      // Находим шаблон смены
      // Сначала пытаемся найти по ID (если type содержит ID шаблона)
      let template = templates.find((t) => t.id === shift.type);
      
      // Если не найден по ID, ищем по названию
      if (!template) {
        template = templates.find((t) => t.name === shift.type);
      }

      // Если шаблон не найден, создаем запись с дефолтными значениями
      if (!template) {
        console.warn(`Template not found for shift type: ${shift.type}, shiftId: ${shift.id}`);
        template = {
          id: shift.type,
          name: shift.type,
          rate: 0,
        } as any;
      }

      // Используем ID шаблона как ключ, если он есть, иначе используем название
      const templateKey = template?.id || template?.name || shift.type;
      
      if (!shiftGroups[templateKey]) {
        shiftGroups[templateKey] = {
          templateId: template?.id || shift.type,
          templateName: template?.name || shift.type,
          count: 0,
          rate: template?.rate || 0,
          bonusPerShift: restaurantUser.position.bonusPerShift || 0,
          totalEarnings: 0,
        };
      }

      shiftGroups[templateKey].count++;
    });

    // Рассчитываем заработок для каждой группы
    const shiftSummary = Object.values(shiftGroups).map((group) => ({
      ...group,
      totalEarnings: (group.rate + group.bonusPerShift) * group.count,
    }));

    // Общий заработок
    const totalEarnings = shiftSummary.reduce((sum, group) => sum + group.totalEarnings, 0);

    res.json({
      employee: {
        id: restaurantUser.user.id,
        firstName: restaurantUser.user.firstName,
        lastName: restaurantUser.user.lastName,
        phone: restaurantUser.user.phone,
        position: {
          id: restaurantUser.position.id,
          name: restaurantUser.position.name,
          bonusPerShift: restaurantUser.position.bonusPerShift,
        },
      },
      period: {
        month: parseInt(month as string),
        year: parseInt(year as string),
        startDate,
        endDate,
      },
      shifts: shiftSummary,
      totalShifts: shifts.length,
      totalEarnings,
    });
  } catch (error) {
    next(error);
  }
};

// Получение сводки табелей по всем сотрудникам ресторана
export const getTimesheetSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, month, year } = req.query;

    if (!restaurantId || !month || !year) {
      res.status(400).json({ error: 'restaurantId, month, and year are required' });
      return;
    }

    const startDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59);
    endDate.setHours(23, 59, 59, 999);

    // Проверяем права доступа
    let userIdFilter: string | undefined = undefined;
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
      
      if (!hasViewAll && !hasViewOwn) {
        res.status(403).json({ error: 'Forbidden: No permission to view timesheets' });
        return;
      }
      
      // Если есть только VIEW_OWN, показываем только свои табели
      if (!hasViewAll && hasViewOwn) {
        userIdFilter = req.user.id;
      }
    }

    // Получаем сотрудников ресторана (с фильтром по пользователю, если нужно)
    const restaurantUsersWhere: any = {
      restaurantId: restaurantId as string,
      isActive: true,
    };
    
    if (userIdFilter) {
      restaurantUsersWhere.userId = userIdFilter;
    }

    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: restaurantUsersWhere,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
            bonusPerShift: true,
          },
        },
      },
    });

    // Получаем все шаблоны смен
    const templates = await prisma.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null },
        ],
        isActive: true,
      },
    });

    const monthNum = parseInt(month as string);
    const yearNum = parseInt(year as string);

    // Для каждого сотрудника считаем табель + премии/штрафы
    const summary = await Promise.all(
      restaurantUsers.map(async (restaurantUser) => {
        const shifts = await prisma.shift.findMany({
          where: {
            restaurantId: restaurantId as string,
            userId: restaurantUser.user.id,
            startTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Группируем смены по типу
        const shiftGroups: Record<string, { count: number; rate: number }> = {};

        shifts.forEach((shift) => {
          let template = templates.find((t) => t.id === shift.type);
          if (!template) {
            template = templates.find((t) => t.name === shift.type);
          }

          const templateKey = template?.id || template?.name || shift.type;
          const rate = template?.rate || 0;

          if (!shiftGroups[templateKey]) {
            shiftGroups[templateKey] = { count: 0, rate };
          }
          shiftGroups[templateKey].count++;
        });

        // Считаем общий заработок по сменам
        let totalEarnings = 0;
        let totalShifts = 0;

        Object.values(shiftGroups).forEach((group) => {
          const earnings = (group.rate + (restaurantUser.position.bonusPerShift || 0)) * group.count;
          totalEarnings += earnings;
          totalShifts += group.count;
        });

        // Премии/штрафы за период (по месяцу/году)
        const [bonusAgg, penaltyAgg] = await Promise.all([
          prisma.bonus.aggregate({
            _sum: { amount: true },
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          }),
          prisma.penalty.aggregate({
            _sum: { amount: true },
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          }),
        ]);

        const bonusesTotal = bonusAgg._sum.amount || 0;
        const penaltiesTotal = penaltyAgg._sum.amount || 0;
        const netEarnings = totalEarnings + bonusesTotal - penaltiesTotal;

        return {
          employee: {
            id: restaurantUser.user.id,
            firstName: restaurantUser.user.firstName,
            lastName: restaurantUser.user.lastName,
            phone: restaurantUser.user.phone,
            position: {
              id: restaurantUser.position.id,
              name: restaurantUser.position.name,
              bonusPerShift: restaurantUser.position.bonusPerShift || 0,
            },
          },
          totalShifts,
          totalEarnings,
          bonusesTotal,
          penaltiesTotal,
          netEarnings,
        };
      })
    );

    // Сортируем по фамилии
    summary.sort((a, b) => {
      const nameA = `${a.employee.lastName} ${a.employee.firstName}`;
      const nameB = `${b.employee.lastName} ${b.employee.firstName}`;
      return nameA.localeCompare(nameB, 'ru');
    });

    res.json({
      period: {
        month: parseInt(month as string),
        year: parseInt(year as string),
        startDate,
        endDate,
      },
      summary,
      totalEmployees: summary.length,
      totalShifts: summary.reduce((sum, emp) => sum + emp.totalShifts, 0),
      totalEarnings: summary.reduce((sum, emp) => sum + emp.totalEarnings, 0),
      totalBonuses: summary.reduce((sum, emp) => sum + (emp.bonusesTotal || 0), 0),
      totalPenalties: summary.reduce((sum, emp) => sum + (emp.penaltiesTotal || 0), 0),
      totalNet: summary.reduce((sum, emp) => sum + (emp.netEarnings || 0), 0),
    });
  } catch (error) {
    next(error);
  }
};

// Экспорт в Excel
export const exportToExcel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('Excel export started');
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, month, year } = req.query;
    console.log('Excel export params:', { restaurantId, month, year });

    if (!restaurantId || !month || !year) {
      res.status(400).json({ error: 'restaurantId, month, and year are required' });
      return;
    }

    const monthNum = parseInt(month as string);
    const yearNum = parseInt(year as string);
    console.log('Parsed dates:', { monthNum, yearNum });
    const startDate = new Date(yearNum, monthNum - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
    endDate.setHours(23, 59, 59, 999);

    // Получаем ресторан
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId as string },
      select: { name: true },
    });

    // Получаем данные из summary
    let userIdFilter: string | undefined = undefined;
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
      
      if (!hasViewAll && hasViewOwn) {
        userIdFilter = req.user.id;
      } else if (!hasViewAll && !hasViewOwn) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Получаем сотрудников
    const restaurantUsersWhere: any = {
      restaurantId: restaurantId as string,
      isActive: true,
    };
    if (userIdFilter) {
      restaurantUsersWhere.userId = userIdFilter;
    }

    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: restaurantUsersWhere,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
            bonusPerShift: true,
          },
        },
      },
    });

    // Получаем шаблоны смен
    const templates = await prisma.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null },
        ],
        isActive: true,
      },
    });

    // Собираем данные для экспорта
    const exportData = await Promise.all(
      restaurantUsers.map(async (restaurantUser) => {
        const shifts = await prisma.shift.findMany({
          where: {
            restaurantId: restaurantId as string,
            userId: restaurantUser.user.id,
            startTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Считаем заработок
        let totalEarnings = 0;
        let totalShifts = 0;
        const shiftGroups: Record<string, { count: number; rate: number }> = {};

        shifts.forEach((shift) => {
          let template = templates.find((t) => t.id === shift.type);
          if (!template) {
            template = templates.find((t) => t.name === shift.type);
          }
          const templateKey = template?.id || template?.name || shift.type;
          const rate = template?.rate || 0;

          if (!shiftGroups[templateKey]) {
            shiftGroups[templateKey] = { count: 0, rate };
          }
          shiftGroups[templateKey].count++;
          totalShifts++;
        });

        Object.values(shiftGroups).forEach((group) => {
          const bonusPerShift = (restaurantUser.position && restaurantUser.position.bonusPerShift) ? restaurantUser.position.bonusPerShift : 0;
          const earnings = (group.rate + bonusPerShift) * group.count;
          totalEarnings += earnings;
        });

        // Получаем премии и штрафы
        let totalBonuses = 0;
        let totalPenalties = 0;
        
        try {
          const bonuses = await prisma.bonus.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          });
          totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
        } catch (err: any) {
          console.warn('Error loading bonuses for Excel export:', err?.message);
        }

        try {
          const penalties = await prisma.penalty.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          });
          totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0);
        } catch (err: any) {
          console.warn('Error loading penalties for Excel export:', err?.message);
        }

        const finalAmount = totalEarnings + totalBonuses - totalPenalties;

        return {
          employee: `${restaurantUser.user.lastName || ''} ${restaurantUser.user.firstName || ''}`.trim() || 'Не указано',
          position: restaurantUser.position?.name || 'Не указана',
          phone: restaurantUser.user.phone || '',
          totalShifts,
          totalEarnings,
          totalBonuses,
          totalPenalties,
          finalAmount,
        };
      })
    );

    // Сортируем по фамилии
    exportData.sort((a, b) => a.employee.localeCompare(b.employee, 'ru'));

    // Проверяем, есть ли данные для экспорта
    if (exportData.length === 0) {
      res.status(400).json({ error: 'Нет данных для экспорта' });
      return;
    }

    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    // Проверяем, что заголовки еще не отправлены
    if (res.headersSent) {
      console.error('Headers already sent before Excel export');
      return;
    }

    // Устанавливаем заголовки ПЕРЕД созданием файла
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const fileName = `tab-${monthNames[monthNum - 1]}-${yearNum}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    // Создаем Excel файл
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Табель');

    // Стили
    const headerStyle = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FF4472C4' },
      },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      },
    };

    const titleStyle = {
      font: { bold: true, size: 16 },
      alignment: { horizontal: 'center' as const },
    };

    const totalStyle = {
      font: { bold: true, size: 11 },
      fill: {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FFF2F2F2' },
      },
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      },
    };

    // Заголовок
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Табель заработной платы`;
    titleCell.style = titleStyle;

    worksheet.mergeCells('A2:H2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `${restaurant?.name || 'Ресторан'} - ${monthNames[monthNum - 1]} ${yearNum}`;
    subtitleCell.style = { ...titleStyle, font: { ...titleStyle.font, size: 14 } };

    worksheet.addRow([]);

    // Заголовки таблицы
    const headerRow = worksheet.addRow([
      'Сотрудник',
      'Должность',
      'Телефон',
      'Смен',
      'Заработок (₽)',
      'Премии (₽)',
      'Штрафы (₽)',
      'Итого (₽)',
    ]);
    headerRow.eachCell((cell) => {
      cell.style = headerStyle;
    });
    headerRow.height = 25;

    // Данные
    exportData.forEach((row) => {
      const dataRow = worksheet.addRow([
        row.employee,
        row.position,
        row.phone,
        row.totalShifts,
        row.totalEarnings,
        row.totalBonuses,
        row.totalPenalties,
        row.finalAmount,
      ]);

      // Форматируем числовые значения
      dataRow.getCell(4).numFmt = '0';
      dataRow.getCell(5).numFmt = '#,##0.00';
      dataRow.getCell(6).numFmt = '#,##0.00';
      dataRow.getCell(7).numFmt = '#,##0.00';
      dataRow.getCell(8).numFmt = '#,##0.00';

      // Стили для ячеек
      dataRow.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // Выделяем итоговую сумму
      const finalCell = dataRow.getCell(8);
      finalCell.font = { bold: true };
      if (row.finalAmount >= 0) {
        finalCell.font = { bold: true, color: { argb: 'FF00B050' } };
      } else {
        finalCell.font = { bold: true, color: { argb: 'FFFF0000' } };
      }
    });

    // Итоговая строка
    const totalRow = worksheet.addRow([
      'ИТОГО',
      '',
      '',
      exportData.reduce((sum, r) => sum + r.totalShifts, 0),
      exportData.reduce((sum, r) => sum + r.totalEarnings, 0),
      exportData.reduce((sum, r) => sum + r.totalBonuses, 0),
      exportData.reduce((sum, r) => sum + r.totalPenalties, 0),
      exportData.reduce((sum, r) => sum + r.finalAmount, 0),
    ]);

    totalRow.eachCell((cell, colNumber) => {
      cell.style = totalStyle;
      if (colNumber >= 4 && colNumber <= 8) {
        cell.numFmt = colNumber === 4 ? '0' : '#,##0.00';
      }
      if (colNumber === 1) {
        cell.font = { ...totalStyle.font, size: 12 };
      }
      if (colNumber === 8) {
        cell.font = { ...totalStyle.font, color: { argb: 'FF0070C0' } };
      }
    });

    // Устанавливаем ширину колонок
    worksheet.columns = [
      { width: 30 },
      { width: 20 },
      { width: 15 },
      { width: 10 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    await workbook.xlsx.write(res);
  } catch (error: any) {
    console.error('Excel export error:', error);
    console.error('Error stack:', error?.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Ошибка экспорта в Excel' });
    }
    next(error);
  }
};

// Экспорт в PDF
export const exportToPDF = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, month, year } = req.query;

    if (!restaurantId || !month || !year) {
      res.status(400).json({ error: 'restaurantId, month, and year are required' });
      return;
    }

    const monthNum = parseInt(month as string);
    const yearNum = parseInt(year as string);
    const startDate = new Date(yearNum, monthNum - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
    endDate.setHours(23, 59, 59, 999);

    // Получаем ресторан
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId as string },
      select: { name: true },
    });

    // Получаем данные из summary
    let userIdFilter: string | undefined = undefined;
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
      const { checkPermission } = await import('../utils/checkPermissions');
      const { PERMISSIONS } = await import('../utils/permissions');
      
      const hasViewAll = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_ALL_TIMESHEETS);
      const hasViewOwn = await checkPermission(req.user.id, restaurantId as string, PERMISSIONS.VIEW_OWN_TIMESHEETS);
      
      if (!hasViewAll && hasViewOwn) {
        userIdFilter = req.user.id;
      } else if (!hasViewAll && !hasViewOwn) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Получаем сотрудников
    const restaurantUsersWhere: any = {
      restaurantId: restaurantId as string,
      isActive: true,
    };
    if (userIdFilter) {
      restaurantUsersWhere.userId = userIdFilter;
    }

    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: restaurantUsersWhere,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
            bonusPerShift: true,
          },
        },
      },
    });

    // Получаем шаблоны смен
    const templates = await prisma.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null },
        ],
        isActive: true,
      },
    });

    // Собираем данные для экспорта
    const exportData = await Promise.all(
      restaurantUsers.map(async (restaurantUser) => {
        const shifts = await prisma.shift.findMany({
          where: {
            restaurantId: restaurantId as string,
            userId: restaurantUser.user.id,
            startTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Считаем заработок
        let totalEarnings = 0;
        let totalShifts = 0;
        const shiftGroups: Record<string, { count: number; rate: number }> = {};

        shifts.forEach((shift) => {
          let template = templates.find((t) => t.id === shift.type);
          if (!template) {
            template = templates.find((t) => t.name === shift.type);
          }
          const templateKey = template?.id || template?.name || shift.type;
          const rate = template?.rate || 0;

          if (!shiftGroups[templateKey]) {
            shiftGroups[templateKey] = { count: 0, rate };
          }
          shiftGroups[templateKey].count++;
          totalShifts++;
        });

        Object.values(shiftGroups).forEach((group) => {
          const bonusPerShift = (restaurantUser.position && restaurantUser.position.bonusPerShift) ? restaurantUser.position.bonusPerShift : 0;
          const earnings = (group.rate + bonusPerShift) * group.count;
          totalEarnings += earnings;
        });

        // Получаем премии и штрафы
        let totalBonuses = 0;
        let totalPenalties = 0;
        
        try {
          const bonuses = await prisma.bonus.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          });
          totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
        } catch (err: any) {
          console.warn('Error loading bonuses for PDF export:', err?.message);
        }

        try {
          const penalties = await prisma.penalty.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          });
          totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0);
        } catch (err: any) {
          console.warn('Error loading penalties for PDF export:', err?.message);
        }

        const finalAmount = totalEarnings + totalBonuses - totalPenalties;

        return {
          employee: `${restaurantUser.user.lastName || ''} ${restaurantUser.user.firstName || ''}`.trim() || 'Не указано',
          position: restaurantUser.position?.name || 'Не указана',
          phone: restaurantUser.user.phone || '',
          totalShifts,
          totalEarnings,
          totalBonuses,
          totalPenalties,
          finalAmount,
        };
      })
    );

    // Сортируем по фамилии
    exportData.sort((a, b) => a.employee.localeCompare(b.employee, 'ru'));

    // Проверяем, есть ли данные для экспорта
    if (exportData.length === 0) {
      res.status(400).json({ error: 'Нет данных для экспорта' });
      return;
    }

    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    // Проверяем, что заголовки еще не отправлены
    if (res.headersSent) {
      console.error('Headers already sent before PDF export');
      return;
    }

    // Устанавливаем заголовки ПЕРЕД созданием документа
    res.setHeader('Content-Type', 'application/pdf');
    const fileName = `tab-${monthNames[monthNum - 1]}-${yearNum}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    // Создаем PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Регистрируем шрифт с поддержкой кириллицы
    // Пробуем разные пути для разных систем
    const fontPaths = {
      arialBold: [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/Library/Fonts/Arial Bold.ttf',
        'C:/Windows/Fonts/arialbd.ttf', // Windows
      ],
      arialRegular: [
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
        'C:/Windows/Fonts/arial.ttf', // Windows
      ],
    };
    
    let arialBoldPath: string | null = null;
    let arialRegularPath: string | null = null;
    
    // Ищем доступный шрифт Arial Bold
    for (const path of fontPaths.arialBold) {
      if (fs.existsSync(path)) {
        arialBoldPath = path;
        break;
      }
    }
    
    // Ищем доступный шрифт Arial Regular
    for (const path of fontPaths.arialRegular) {
      if (fs.existsSync(path)) {
        arialRegularPath = path;
        break;
      }
    }
    
    try {
      if (arialBoldPath) {
        doc.registerFont('Arial-Bold', arialBoldPath);
      }
      if (arialRegularPath) {
        doc.registerFont('Arial', arialRegularPath);
      }
    } catch (err) {
      console.warn('Could not register Arial fonts, using defaults:', err);
    }
    
    doc.pipe(res);

    // Используем зарегистрированный шрифт или стандартный
    const fontBold = arialBoldPath ? 'Arial-Bold' : 'Helvetica-Bold';
    const fontRegular = arialRegularPath ? 'Arial' : 'Helvetica';

    // Заголовок
    doc.fontSize(20)
       .font(fontBold)
       .text('Табель заработной платы', { align: 'center' });
    doc.moveDown(0.5);
    
    doc.fontSize(14)
       .font(fontRegular)
       .text(`${restaurant?.name || 'Ресторан'}`, { align: 'center' });
    doc.moveDown(0.3);
    
    doc.fontSize(12)
       .text(`${monthNames[monthNum - 1]} ${yearNum}`, { align: 'center' });
    doc.moveDown(1);

    // Таблица
    const tableTop = doc.y;
    const tableLeft = 50;
    const tableWidth = 495;
    const rowHeight = 25;
    const colWidths = [140, 100, 80, 55, 60, 60, 60, 60];
    const headers = ['Сотрудник', 'Должность', 'Телефон', 'Смен', 'Заработок', 'Премии', 'Штрафы', 'Итого'];

    // Функция для рисования заголовков таблицы
    const drawTableHeaders = (yPos: number) => {
      doc.fontSize(10);
      doc.font(fontBold);
      let headerX = tableLeft;
      
      headers.forEach((header, i) => {
        // Фон для заголовка
        doc.fillColor('#4472C4');
        doc.rect(headerX, yPos, colWidths[i], rowHeight).fill();
        
        // Границы
        doc.strokeColor('black');
        doc.rect(headerX, yPos, colWidths[i], rowHeight).stroke();
        
        // Текст заголовка (белый)
        doc.fillColor('#FFFFFF');
        doc.text(header, headerX + 5, yPos + 8, { width: colWidths[i] - 10, align: 'left' });
        
        headerX += colWidths[i];
      });
      
      // Возвращаем черный цвет по умолчанию
      doc.fillColor('black');
      doc.strokeColor('black');
    };

    // Заголовки таблицы
    drawTableHeaders(tableTop);

    // Данные
    let y = tableTop + rowHeight;
    doc.font(fontRegular);
    exportData.forEach((row, index) => {
      if (y + rowHeight > 750) {
        doc.addPage();
        y = 50;
        // Перерисовываем заголовки на новой странице
        drawTableHeaders(y);
        y += rowHeight;
      }

      let x = tableLeft;
      const rowData = [
        row.employee,
        row.position,
        row.phone,
        row.totalShifts.toString(),
        row.totalEarnings.toFixed(2),
        row.totalBonuses.toFixed(2),
        row.totalPenalties.toFixed(2),
        row.finalAmount.toFixed(2),
      ];

      rowData.forEach((cell, i) => {
        // Границы ячейки
        doc.strokeColor('black');
        doc.rect(x, y, colWidths[i], rowHeight).stroke();
        
        // Для последней колонки (Итого) используем жирный шрифт и цвет
        if (i === 7) {
          doc.font(fontBold);
          if (row.finalAmount >= 0) {
            doc.fillColor('#00B050');
          } else {
            doc.fillColor('#FF0000');
          }
        } else {
          doc.font(fontRegular);
          doc.fillColor('black');
        }
        
        doc.text(cell, x + 5, y + 8, { width: colWidths[i] - 10, align: 'left' });
        
        // Сбрасываем цвет и шрифт
        doc.fillColor('black');
        doc.font(fontRegular);
        
        x += colWidths[i];
      });

      y += rowHeight;
    });

    // Итоговая строка
    if (y + rowHeight * 2 > 750) {
      doc.addPage();
      y = 50;
      // Перерисовываем заголовки на новой странице перед итогами
      drawTableHeaders(y);
      y += rowHeight;
    }

    y += 10;
    const totals = [
      'ИТОГО',
      '',
      '',
      exportData.reduce((sum, r) => sum + r.totalShifts, 0).toString(),
      exportData.reduce((sum, r) => sum + r.totalEarnings, 0).toFixed(2),
      exportData.reduce((sum, r) => sum + r.totalBonuses, 0).toFixed(2),
      exportData.reduce((sum, r) => sum + r.totalPenalties, 0).toFixed(2),
      exportData.reduce((sum, r) => sum + r.finalAmount, 0).toFixed(2),
    ];

    doc.font(fontBold);
    let x = tableLeft;
    totals.forEach((cell, i) => {
      // Фон
      doc.fillColor('#F2F2F2');
      doc.rect(x, y, colWidths[i], rowHeight).fill();
      
      // Границы
      doc.strokeColor('black');
      doc.rect(x, y, colWidths[i], rowHeight).stroke();
      
      // Для последней колонки используем цвет текста
      if (i === 7) {
        doc.fillColor('#0070C0');
      } else {
        doc.fillColor('black');
      }
      
      doc.text(cell, x + 5, y + 8, { width: colWidths[i] - 10, align: 'left' });
      
      // Сбрасываем цвет текста
      doc.fillColor('black');
      
      x += colWidths[i];
    });

    // Подпись
    y += rowHeight + 30;
    doc.font(fontRegular)
       .fontSize(10)
       .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, 50, y);

    doc.end();
  } catch (error: any) {
    console.error('PDF export error:', error);
    console.error('Error stack:', error?.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Ошибка экспорта в PDF' });
    } else {
      // Если заголовки уже отправлены, мы не можем отправить JSON ошибку
      // Просто закрываем поток
      if (!res.writableEnded) {
        res.end();
      }
    }
    next(error);
  }
};

