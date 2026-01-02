/**
 * Preset Position Service
 * 
 * Creates preset positions with permissions when a new restaurant is created.
 */

import dbClient from '../utils/db';
import { PRESET_POSITIONS, PermissionCode } from '../utils/permissions';
import { logger } from './loggerService';

/**
 * Creates preset positions for a restaurant with their associated permissions.
 * 
 * @param restaurantId - The ID of the restaurant to create positions for
 * @returns Array of created position IDs
 */
export async function createPresetPositions(restaurantId: string): Promise<string[]> {
  const createdPositionIds: string[] = [];

  try {
    // Get all permissions from the database to map codes to IDs
    const allPermissions = await dbClient.permission.findMany({});
    const permissionCodeToId = new Map<string, string>();
    
    for (const perm of allPermissions) {
      permissionCodeToId.set(perm.code, perm.id);
    }

    // Create each preset position
    for (const [positionName, permissionCodes] of Object.entries(PRESET_POSITIONS)) {
      // Create the position
      const position = await dbClient.position.create({
        data: {
          restaurantId,
          name: positionName,
          isActive: true,
          bonusPerShift: 0,
        },
      });

      createdPositionIds.push(position.id);

      // Create position permissions
      const positionPermissions: { positionId: string; permissionId: string }[] = [];
      
      for (const code of permissionCodes) {
        const permissionId = permissionCodeToId.get(code);
        if (permissionId) {
          positionPermissions.push({
            positionId: position.id,
            permissionId,
          });
        } else {
          logger.warn(`Permission code not found in database: ${code}`);
        }
      }

      // Bulk create position permissions
      if (positionPermissions.length > 0) {
        await dbClient.positionPermission.createMany({
          data: positionPermissions,
        });
      }

      logger.debug(`Created preset position: ${positionName} with ${positionPermissions.length} permissions`);
    }

    logger.info(`Created ${createdPositionIds.length} preset positions for restaurant ${restaurantId}`);
    return createdPositionIds;
  } catch (error: any) {
    logger.error('Error creating preset positions', { error: error?.message, restaurantId });
    throw error;
  }
}

/**
 * Gets the list of preset position names.
 * 
 * @returns Array of preset position names
 */
export function getPresetPositionNames(): string[] {
  return Object.keys(PRESET_POSITIONS);
}

/**
 * Gets the permissions for a preset position.
 * 
 * @param positionName - The name of the preset position
 * @returns Array of permission codes or undefined if position not found
 */
export function getPresetPositionPermissions(positionName: string): PermissionCode[] | undefined {
  return PRESET_POSITIONS[positionName];
}
