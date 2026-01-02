import dbClient from './db';

// Типы действий (SQLite не поддерживает enum)
export type ActionLogType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'COMPLETE';

interface LogActionParams {
  userId: string;
  type: ActionLogType;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

export const logAction = async (params: LogActionParams): Promise<void> => {
  try {
    await dbClient.actionLog.create({
      data: {
        userId: params.userId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // Логируем ошибку, но не прерываем выполнение основного процесса
    console.error('Failed to log action:', error);
  }
};

