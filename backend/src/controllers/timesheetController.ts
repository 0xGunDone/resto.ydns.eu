/**
 * Timesheet Controller
 * HTTP request handling for timesheet operations
 * 
 * Requirements: 4.1, 4.2, 10.2
 */

import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import {
  getTimesheetService,
  UpdateTimesheetData,
} from '../services/timesheetService';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';

const timesheetService = getTimesheetService();

/**
 * Calculate timesheet from shifts
 */
export const calculateTimesheet = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.body;

    const timesheet = await timesheetService.calculateTimesheet({
      restaurantId,
      userId,
      month,
      year,
    });

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Calculated timesheet for ${timesheet.user?.firstName} ${timesheet.user?.lastName} - ${month}/${year}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

/**
 * Get timesheets with filters
 */
export const getTimesheets = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.query;

    const timesheets = await timesheetService.getTimesheets(req.user.id, req.user.role, {
      restaurantId: restaurantId as string | undefined,
      userId: userId as string | undefined,
      month: month ? parseInt(month as string) : undefined,
      year: year ? parseInt(year as string) : undefined,
    });

    res.json({ timesheets });
  } catch (error) {
    next(error);
  }
};

/**
 * Update timesheet (manual correction)
 */
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

    // Only manager, admin or owner can edit timesheets
    if (!timesheetService.canEditTimesheet(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const { totalHours, overtimeHours, lateCount, sickDays, vacationDays, notes } = req.body;

    const updateData: UpdateTimesheetData = {};
    if (totalHours !== undefined) updateData.totalHours = parseFloat(totalHours);
    if (overtimeHours !== undefined) updateData.overtimeHours = parseFloat(overtimeHours);
    if (lateCount !== undefined) updateData.lateCount = parseInt(lateCount);
    if (sickDays !== undefined) updateData.sickDays = parseInt(sickDays);
    if (vacationDays !== undefined) updateData.vacationDays = parseInt(vacationDays);
    if (notes !== undefined) updateData.notes = notes;

    const timesheet = await timesheetService.updateTimesheet(id, updateData);

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Updated timesheet for ${timesheet.user?.firstName} ${timesheet.user?.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve timesheet
 */
export const approveTimesheet = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!timesheetService.canEditTimesheet(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;

    const timesheet = await timesheetService.approveTimesheet(id, req.user.id);

    await logAction({
      userId: req.user.id,
      type: 'APPROVE',
      entityType: 'Timesheet',
      entityId: timesheet.id,
      description: `Approved timesheet for ${timesheet.user?.firstName} ${timesheet.user?.lastName}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
};

/**
 * Get timesheet with earnings calculation by shift types
 */
export const getTimesheetWithEarnings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId, userId, month, year } = req.query;

    // Validate parameters
    if (!restaurantId || !userId || !month || !year) {
      res.status(400).json({ 
        error: 'restaurantId, userId, month, and year are required',
        received: { restaurantId, userId, month, year }
      });
      return;
    }

    const monthNum = parseInt(month as string);
    const yearNum = parseInt(year as string);
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      res.status(400).json({ error: 'month must be between 1 and 12' });
      return;
    }
    
    if (isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      res.status(400).json({ error: 'year must be between 2020 and 2100' });
      return;
    }

    // Check permissions
    const permissions = await timesheetService.checkTimesheetPermissions(
      req.user.id, 
      req.user.role, 
      restaurantId as string
    );
    
    if (!permissions.canView) {
      res.status(403).json({ error: 'Forbidden: No permission to view timesheets' });
      return;
    }
    
    // If only VIEW_OWN, check that user is requesting their own timesheet
    if (!permissions.canViewAll && permissions.canViewOwn && req.user.id !== userId) {
      res.status(403).json({ error: 'Forbidden: Can only view own timesheet' });
      return;
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
    endDate.setHours(23, 59, 59, 999);

    // Get all shifts for the month
    const shifts = await dbClient.shift.findMany({
      where: {
        restaurantId: restaurantId as string,
        userId: userId as string,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Get employee info
    const restaurantUser = await dbClient.restaurantUser.findFirst({
      where: {
        restaurantId: restaurantId as string,
        userId: userId as string,
      },
      include: {
        user: true,
        position: true,
      },
    });

    if (!restaurantUser) {
      res.status(404).json({ error: 'Employee not found in restaurant' });
      return;
    }

    // Get all shift templates
    const templates = await dbClient.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null },
        ],
        isActive: true,
      },
    });

    // Group shifts by type and calculate
    const shiftGroups: Record<string, {
      templateId: string;
      templateName: string;
      count: number;
      rate: number;
      bonusPerShift: number;
      totalEarnings: number;
    }> = {};

    shifts.forEach((shift) => {
      let template = templates.find((t) => t.id === shift.type);
      if (!template) {
        template = templates.find((t) => t.name === shift.type);
      }

      if (!template) {
        template = {
          id: shift.type,
          name: `Неизвестный тип (${shift.type})`,
          rate: 0,
        } as any;
      }

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

    // Calculate earnings for each group
    const shiftSummary = Object.values(shiftGroups).map((group) => ({
      ...group,
      totalEarnings: (group.rate + group.bonusPerShift) * group.count,
    }));

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
        month: monthNum,
        year: yearNum,
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

/**
 * Get timesheet summary for all employees
 */
export const getTimesheetSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Check permissions
    const permissions = await timesheetService.checkTimesheetPermissions(
      req.user.id, 
      req.user.role, 
      restaurantId as string
    );
    
    if (!permissions.canView) {
      res.status(403).json({ error: 'Forbidden: No permission to view timesheets' });
      return;
    }

    // Build filter for employees
    const restaurantUsersWhere: any = {
      restaurantId: restaurantId as string,
    };
    
    // If only VIEW_OWN, filter to user's data
    if (!permissions.canViewAll && permissions.canViewOwn) {
      restaurantUsersWhere.userId = req.user.id;
    }

    const restaurantUsers = await dbClient.restaurantUser.findMany({
      where: restaurantUsersWhere,
      include: {
        user: true,
        position: true,
      },
    });

    // Get all shift templates
    const templates = await dbClient.shiftTemplate.findMany({
      where: {
        OR: [
          { restaurantId: restaurantId as string },
          { restaurantId: null },
        ],
        isActive: true,
      },
    });

    // Calculate for each employee
    const summary = await Promise.all(
      restaurantUsers.map(async (restaurantUser) => {
        const shifts = await dbClient.shift.findMany({
          where: {
            restaurantId: restaurantId as string,
            userId: restaurantUser.user.id,
            startTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Group shifts by type
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

        // Calculate total earnings
        let totalEarnings = 0;
        let totalShifts = 0;

        Object.values(shiftGroups).forEach((group) => {
          const earnings = (group.rate + (restaurantUser.position.bonusPerShift || 0)) * group.count;
          totalEarnings += earnings;
          totalShifts += group.count;
        });

        // Get bonuses and penalties
        const [bonuses, penalties] = await Promise.all([
          dbClient.bonus.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          }),
          dbClient.penalty.findMany({
            where: {
              restaurantId: restaurantId as string,
              userId: restaurantUser.user.id,
              month: monthNum,
              year: yearNum,
            },
          }),
        ]);

        const bonusesTotal = bonuses.reduce((sum, b) => sum + (b.amount || 0), 0);
        const penaltiesTotal = penalties.reduce((sum, p) => sum + (p.amount || 0), 0);
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

    // Sort by last name
    summary.sort((a, b) => {
      const nameA = `${a.employee.lastName} ${a.employee.firstName}`;
      const nameB = `${b.employee.lastName} ${b.employee.firstName}`;
      return nameA.localeCompare(nameB, 'ru');
    });

    res.json({
      period: {
        month: monthNum,
        year: yearNum,
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


/**
 * Helper function to get export data
 */
async function getExportData(
  restaurantId: string,
  monthNum: number,
  yearNum: number,
  userIdFilter?: string
) {
  const startDate = new Date(yearNum, monthNum - 1, 1);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
  endDate.setHours(23, 59, 59, 999);

  // Get employees
  const restaurantUsersWhere: any = {
    restaurantId,
  };
  if (userIdFilter) {
    restaurantUsersWhere.userId = userIdFilter;
  }

  const restaurantUsers = await dbClient.restaurantUser.findMany({
    where: restaurantUsersWhere,
    include: {
      user: true,
      position: true,
    },
  });

  // Get shift templates
  const templates = await dbClient.shiftTemplate.findMany({
    where: {
      OR: [
        { restaurantId },
        { restaurantId: null },
      ],
      isActive: true,
    },
  });

  // Collect export data
  const exportData = await Promise.all(
    restaurantUsers.map(async (restaurantUser) => {
      const shifts = await dbClient.shift.findMany({
        where: {
          restaurantId,
          userId: restaurantUser.user.id,
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate earnings
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
        const bonusPerShift = restaurantUser.position?.bonusPerShift || 0;
        const earnings = (group.rate + bonusPerShift) * group.count;
        totalEarnings += earnings;
      });

      // Get bonuses and penalties
      let totalBonuses = 0;
      let totalPenalties = 0;
      
      try {
        const bonuses = await dbClient.bonus.findMany({
          where: {
            restaurantId,
            userId: restaurantUser.user.id,
            month: monthNum,
            year: yearNum,
          },
        });
        totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
      } catch (err: any) {
        logger.warn('Error loading bonuses for export', { error: err?.message });
      }

      try {
        const penalties = await dbClient.penalty.findMany({
          where: {
            restaurantId,
            userId: restaurantUser.user.id,
            month: monthNum,
            year: yearNum,
          },
        });
        totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0);
      } catch (err: any) {
        logger.warn('Error loading penalties for export', { error: err?.message });
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

  // Sort by last name
  exportData.sort((a, b) => a.employee.localeCompare(b.employee, 'ru'));

  return exportData;
}

/**
 * Export to Excel
 */
export const exportToExcel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    // Get restaurant
    const restaurant = await dbClient.restaurant.findUnique({
      where: { id: restaurantId as string },
      select: { name: true },
    });

    // Check permissions
    const permissions = await timesheetService.checkTimesheetPermissions(
      req.user.id, 
      req.user.role, 
      restaurantId as string
    );

    let userIdFilter: string | undefined = undefined;
    if (!permissions.canViewAll && permissions.canViewOwn) {
      userIdFilter = req.user.id;
    } else if (!permissions.canView) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const exportData = await getExportData(restaurantId as string, monthNum, yearNum, userIdFilter);

    if (exportData.length === 0) {
      res.status(400).json({ error: 'Нет данных для экспорта' });
      return;
    }

    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    if (res.headersSent) {
      logger.error('Headers already sent before Excel export');
      return;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const fileName = `tab-${monthNames[monthNum - 1]}-${yearNum}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    // Create Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Табель');

    // Styles
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

    // Title
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Табель заработной платы`;
    titleCell.style = titleStyle;

    worksheet.mergeCells('A2:H2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `${restaurant?.name || 'Ресторан'} - ${monthNames[monthNum - 1]} ${yearNum}`;
    subtitleCell.style = { ...titleStyle, font: { ...titleStyle.font, size: 14 } };

    worksheet.addRow([]);

    // Table headers
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

    // Data
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

      dataRow.getCell(4).numFmt = '0';
      dataRow.getCell(5).numFmt = '#,##0.00';
      dataRow.getCell(6).numFmt = '#,##0.00';
      dataRow.getCell(7).numFmt = '#,##0.00';
      dataRow.getCell(8).numFmt = '#,##0.00';

      dataRow.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      const finalCell = dataRow.getCell(8);
      finalCell.font = { bold: true };
      if (row.finalAmount >= 0) {
        finalCell.font = { bold: true, color: { argb: 'FF00B050' } };
      } else {
        finalCell.font = { bold: true, color: { argb: 'FFFF0000' } };
      }
    });

    // Total row
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

    // Column widths
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
    logger.error('Excel export error', { error: error?.message, stack: error?.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Ошибка экспорта в Excel' });
    }
    next(error);
  }
};

/**
 * Export to PDF
 */
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

    // Get restaurant
    const restaurant = await dbClient.restaurant.findUnique({
      where: { id: restaurantId as string },
      select: { name: true },
    });

    // Check permissions
    const permissions = await timesheetService.checkTimesheetPermissions(
      req.user.id, 
      req.user.role, 
      restaurantId as string
    );

    let userIdFilter: string | undefined = undefined;
    if (!permissions.canViewAll && permissions.canViewOwn) {
      userIdFilter = req.user.id;
    } else if (!permissions.canView) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const exportData = await getExportData(restaurantId as string, monthNum, yearNum, userIdFilter);

    if (exportData.length === 0) {
      res.status(400).json({ error: 'Нет данных для экспорта' });
      return;
    }

    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    if (res.headersSent) {
      logger.error('Headers already sent before PDF export');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    const fileName = `tab-${monthNames[monthNum - 1]}-${yearNum}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Register fonts
    const fontPaths = {
      arialBold: [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/Library/Fonts/Arial Bold.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
      ],
      arialRegular: [
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
        'C:/Windows/Fonts/arial.ttf',
      ],
    };
    
    let arialBoldPath: string | null = null;
    let arialRegularPath: string | null = null;
    
    for (const path of fontPaths.arialBold) {
      if (fs.existsSync(path)) {
        arialBoldPath = path;
        break;
      }
    }
    
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
      logger.warn('Could not register Arial fonts, using defaults', { error: err });
    }
    
    doc.pipe(res);

    const fontBold = arialBoldPath ? 'Arial-Bold' : 'Helvetica-Bold';
    const fontRegular = arialRegularPath ? 'Arial' : 'Helvetica';

    // Title
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

    // Table
    const tableTop = doc.y;
    const tableLeft = 50;
    const rowHeight = 25;
    const colWidths = [140, 100, 80, 55, 60, 60, 60, 60];
    const headers = ['Сотрудник', 'Должность', 'Телефон', 'Смен', 'Заработок', 'Премии', 'Штрафы', 'Итого'];

    // Draw table headers
    const drawTableHeaders = (yPos: number) => {
      doc.fontSize(10);
      doc.font(fontBold);
      let headerX = tableLeft;
      
      headers.forEach((header, i) => {
        doc.fillColor('#4472C4');
        doc.rect(headerX, yPos, colWidths[i], rowHeight).fill();
        
        doc.strokeColor('black');
        doc.rect(headerX, yPos, colWidths[i], rowHeight).stroke();
        
        doc.fillColor('#FFFFFF');
        doc.text(header, headerX + 5, yPos + 8, { width: colWidths[i] - 10, align: 'left' });
        
        headerX += colWidths[i];
      });
      
      doc.fillColor('black');
      doc.strokeColor('black');
    };

    drawTableHeaders(tableTop);

    // Data
    let y = tableTop + rowHeight;
    doc.font(fontRegular);
    exportData.forEach((row) => {
      if (y + rowHeight > 750) {
        doc.addPage();
        y = 50;
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
        doc.strokeColor('black');
        doc.rect(x, y, colWidths[i], rowHeight).stroke();
        
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
        
        doc.fillColor('black');
        doc.font(fontRegular);
        
        x += colWidths[i];
      });

      y += rowHeight;
    });

    // Total row
    if (y + rowHeight * 2 > 750) {
      doc.addPage();
      y = 50;
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
      doc.fillColor('#F2F2F2');
      doc.rect(x, y, colWidths[i], rowHeight).fill();
      
      doc.strokeColor('black');
      doc.rect(x, y, colWidths[i], rowHeight).stroke();
      
      if (i === 7) {
        doc.fillColor('#0070C0');
      } else {
        doc.fillColor('black');
      }
      
      doc.text(cell, x + 5, y + 8, { width: colWidths[i] - 10, align: 'left' });
      
      doc.fillColor('black');
      
      x += colWidths[i];
    });

    // Signature
    y += rowHeight + 30;
    doc.font(fontRegular)
       .fontSize(10)
       .text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, 50, y);

    doc.end();
  } catch (error: any) {
    logger.error('PDF export error', { error: error?.message, stack: error?.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Ошибка экспорта в PDF' });
    } else {
      if (!res.writableEnded) {
        res.end();
      }
    }
    next(error);
  }
};
