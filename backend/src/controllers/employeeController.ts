/**
 * Employee Controller
 * HTTP handling for employee management
 * 
 * Requirements: 7.1, 10.2
 */

import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/actionLog';
import { hashPassword } from '../utils/bcrypt';
import { logger } from '../services/loggerService';
import { getEmployeeService } from '../services/employeeService';
import { getErrorMessage, isDatabaseError } from '../middleware/errorHandler';

const employeeService = getEmployeeService();

// Получение всех пользователей (для выбора при добавлении сотрудника)
export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { role } = req.query;
    const users = await employeeService.getUsers(role as string | undefined);
    res.json({ users });
  } catch (error) {
    next(error);
  }
};

// Получение сотрудников ресторана
export const getEmployees = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { restaurantId } = req.params;

    // Check permissions
    const permissions = await employeeService.checkEmployeePermissions(
      req.user.id,
      req.user.role,
      restaurantId
    );

    if (!permissions.canView) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const employees = await employeeService.getEmployees(
      restaurantId,
      req.user.id,
      req.user.role
    );

    res.json({ employees });
  } catch (error) {
    next(error);
  }
};

// Создание сотрудника (регистрация + добавление в ресторан)
export const createEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId } = req.params;
    const { email, password, firstName, lastName, phone, positionId, departmentId } = req.body;

    const employee = await employeeService.createEmployee(
      restaurantId,
      { email, password, firstName, lastName, phone, positionId, departmentId },
      hashPassword
    );

    await logAction({
      userId: req.user.id,
      type: 'CREATE',
      entityType: 'Employee',
      entityId: employee.id,
      description: `Added employee ${employee.user.firstName} ${employee.user.lastName} to restaurant`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({ employee });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Error creating employee', { error: errorMessage });
    
    if (errorMessage === 'Пользователь с таким логином уже существует') {
      res.status(400).json({ error: errorMessage });
      return;
    }
    if (isDatabaseError(error)) {
      if (error.code === 'P2002') {
        res.status(400).json({ error: 'Employee already exists in this restaurant' });
        return;
      }
      if (error.code === 'P2003') {
        res.status(400).json({ error: 'Invalid position or department ID' });
        return;
      }
    }
    res.status(500).json({ error: errorMessage || 'Error creating employee' });
  }
};

// Обновление сотрудника
export const updateEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((err: any) => {
        const msg = err.msg || err.message || 'Invalid value';
        if (msg.includes('Password must be at least')) return 'Пароль должен быть не менее 6 символов';
        return msg;
      });
      res.status(400).json({ 
        error: errorMessages.join(', '),
        errors: errors.array() 
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId, employeeId } = req.params;
    const { positionId, departmentId, isActive, email, password } = req.body;

    logger.debug('Updating employee', { restaurantId, employeeId });

    const employee = await employeeService.updateEmployee(
      restaurantId,
      employeeId,
      { positionId, departmentId, isActive, email, password },
      req.user.role === 'OWNER',
      hashPassword
    );

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Employee',
      entityId: employee.id,
      description: `Updated employee ${employee.user ? `${employee.user.firstName} ${employee.user.lastName}` : 'неизвестный сотрудник'}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.debug('Employee updated successfully', { employeeId: employee.id });
    res.json({ employee });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage === 'Employee not found') {
      res.status(404).json({ error: errorMessage });
      return;
    }
    if (errorMessage === 'Email уже используется другим пользователем' ||
        errorMessage === 'Пароль должен быть не менее 6 символов') {
      res.status(400).json({ error: errorMessage });
      return;
    }
    next(error);
  }
};

// Удаление сотрудника из ресторана
export const removeEmployee = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { restaurantId, employeeId } = req.params;

    // Get employee info for logging before deletion
    const dbClient = (await import('../utils/db')).default;
    const restaurantUser = await dbClient.restaurantUser.findFirst({
      where: { restaurantId, userId: employeeId },
      include: { user: true },
    });

    logger.debug('Removing employee', { restaurantId, employeeId });
    await employeeService.removeEmployee(restaurantId, employeeId);

    await logAction({
      userId: req.user.id,
      type: 'UPDATE',
      entityType: 'Employee',
      entityId: restaurantUser?.id || employeeId,
      description: `Removed employee ${restaurantUser?.user ? `${restaurantUser.user.firstName} ${restaurantUser.user.lastName}` : 'неизвестный сотрудник'} from restaurant`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ message: 'Employee removed successfully' });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage === 'Employee not found') {
      res.status(404).json({ error: errorMessage });
      return;
    }
    next(error);
  }
};

// Получение расширенного профиля сотрудника
export const getEmployeeExtendedProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userId } = req.params;
    const restaurantId = req.query.restaurantId as string | undefined;

    const profile = await employeeService.getExtendedProfile(
      userId,
      req.user.id,
      req.user.role,
      restaurantId
    );

    res.json(profile);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage === 'restaurantId is required') {
      res.status(400).json({ error: errorMessage });
      return;
    }
    if (errorMessage === 'Forbidden') {
      res.status(403).json({ error: errorMessage });
      return;
    }
    if (errorMessage === 'User not found') {
      res.status(404).json({ error: errorMessage });
      return;
    }
    next(error);
  }
};
