/**
 * Property-Based Tests for Preset Positions
 * 
 * **Feature: platform-upgrade, Property 10: Preset positions created with restaurant**
 * **Validates: Requirements 9.1**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { PRESET_POSITIONS, PERMISSIONS, PermissionCode } from '../../src/utils/permissions';

// Mock data stores - must be defined before vi.mock
let mockPositions: any[] = [];
let mockPositionPermissions: any[] = [];
let mockPermissions: any[] = [];
let positionIdCounter = 0;

// Mock the dbClient module - hoisted to top
vi.mock('../../src/utils/db', () => {
  return {
    default: {
      permission: {
        findMany: async () => mockPermissions,
      },
      position: {
        create: async (args: { data: any }) => {
          const position = {
            id: `pos-${++positionIdCounter}`,
            restaurantId: args.data.restaurantId,
            name: args.data.name,
            isActive: args.data.isActive,
            bonusPerShift: args.data.bonusPerShift,
          };
          mockPositions.push(position);
          return position;
        },
        findMany: async (args?: { where?: { restaurantId?: string } }) => {
          if (args?.where?.restaurantId) {
            return mockPositions.filter(p => p.restaurantId === args.where!.restaurantId);
          }
          return mockPositions;
        },
      },
      positionPermission: {
        createMany: async (args: { data: any[] }) => {
          mockPositionPermissions.push(...args.data);
          return { count: args.data.length };
        },
        findMany: async (args?: { where?: { positionId?: string } }) => {
          if (args?.where?.positionId) {
            return mockPositionPermissions.filter(pp => pp.positionId === args.where!.positionId);
          }
          return mockPositionPermissions;
        },
      },
    },
  };
});

// Mock logger
vi.mock('../../src/services/loggerService', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  createPresetPositions,
  getPresetPositionNames,
  getPresetPositionPermissions,
} from '../../src/services/presetPositionService';

// Initialize mock permissions based on PRESET_POSITIONS
function initializeMockPermissions() {
  const allPermissionCodes = new Set<string>();
  for (const permissions of Object.values(PRESET_POSITIONS)) {
    for (const code of permissions) {
      allPermissionCodes.add(code);
    }
  }
  
  mockPermissions = Array.from(allPermissionCodes).map((code, index) => ({
    id: `perm-${index + 1}`,
    code,
  }));
}

describe('Preset Positions Properties', () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockPositions = [];
    mockPositionPermissions = [];
    positionIdCounter = 0;
    initializeMockPermissions();
  });

  /**
   * **Feature: platform-upgrade, Property 10: Preset positions created with restaurant**
   * **Validates: Requirements 9.1**
   * 
   * For any newly created restaurant, preset positions (Официант, Повар, Бармен, 
   * Старший смены, Администратор) SHALL be created.
   */
  describe('Property 10: Preset positions created with restaurant', () => {
    const expectedPositionNames = ['Официант', 'Повар', 'Бармен', 'Старший смены', 'Администратор'];

    it('should create all preset positions for any restaurant ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (restaurantId) => {
            // Reset mock data for each property test iteration
            mockPositions = [];
            mockPositionPermissions = [];
            positionIdCounter = 0;
            initializeMockPermissions();

            // Create preset positions
            const createdIds = await createPresetPositions(restaurantId);

            // Verify all preset positions were created
            expect(createdIds.length).toBe(expectedPositionNames.length);

            // Verify each expected position name exists
            const createdPositionNames = mockPositions
              .filter(p => p.restaurantId === restaurantId)
              .map(p => p.name);

            for (const expectedName of expectedPositionNames) {
              expect(createdPositionNames).toContain(expectedName);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create positions with correct restaurant ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (restaurantId) => {
            // Reset mock data
            mockPositions = [];
            mockPositionPermissions = [];
            positionIdCounter = 0;
            initializeMockPermissions();

            await createPresetPositions(restaurantId);

            // All created positions should have the correct restaurant ID
            const restaurantPositions = mockPositions.filter(p => p.restaurantId === restaurantId);
            expect(restaurantPositions.length).toBe(expectedPositionNames.length);

            for (const position of restaurantPositions) {
              expect(position.restaurantId).toBe(restaurantId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create positions with isActive=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (restaurantId) => {
            // Reset mock data
            mockPositions = [];
            mockPositionPermissions = [];
            positionIdCounter = 0;
            initializeMockPermissions();

            await createPresetPositions(restaurantId);

            // All created positions should be active
            for (const position of mockPositions) {
              expect(position.isActive).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should assign permissions to each preset position', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (restaurantId) => {
            // Reset mock data
            mockPositions = [];
            mockPositionPermissions = [];
            positionIdCounter = 0;
            initializeMockPermissions();

            await createPresetPositions(restaurantId);

            // Each position should have permissions assigned
            for (const position of mockPositions) {
              const positionPerms = mockPositionPermissions.filter(
                pp => pp.positionId === position.id
              );
              
              // Get expected permissions for this position
              const expectedPerms = PRESET_POSITIONS[position.name];
              if (expectedPerms) {
                expect(positionPerms.length).toBe(expectedPerms.length);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: getPresetPositionNames returns correct names
   */
  describe('getPresetPositionNames', () => {
    it('should return all preset position names', () => {
      const names = getPresetPositionNames();
      const expectedNames = Object.keys(PRESET_POSITIONS);

      expect(names.length).toBe(expectedNames.length);
      for (const name of expectedNames) {
        expect(names).toContain(name);
      }
    });
  });

  /**
   * Additional property: getPresetPositionPermissions returns correct permissions
   */
  describe('getPresetPositionPermissions', () => {
    it('should return correct permissions for each preset position', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(PRESET_POSITIONS)),
          (positionName) => {
            const permissions = getPresetPositionPermissions(positionName);
            const expectedPermissions = PRESET_POSITIONS[positionName];

            expect(permissions).toBeDefined();
            expect(permissions).toEqual(expectedPermissions);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return undefined for non-existent position names', () => {
      // Filter out strings that are Object prototype methods
      const objectPrototypeMethods = Object.getOwnPropertyNames(Object.prototype);
      
      fc.assert(
        fc.property(
          fc.string().filter(s => 
            !Object.keys(PRESET_POSITIONS).includes(s) && 
            !objectPrototypeMethods.includes(s)
          ),
          (invalidName) => {
            const permissions = getPresetPositionPermissions(invalidName);
            expect(permissions).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: PRESET_POSITIONS configuration is valid
   */
  describe('PRESET_POSITIONS configuration validity', () => {
    it('should have all required position names', () => {
      const requiredNames = ['Официант', 'Повар', 'Бармен', 'Старший смены', 'Администратор'];
      
      for (const name of requiredNames) {
        expect(PRESET_POSITIONS).toHaveProperty(name);
      }
    });

    it('should have non-empty permission arrays for all positions', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(PRESET_POSITIONS)),
          (positionName) => {
            const permissions = PRESET_POSITIONS[positionName];
            expect(Array.isArray(permissions)).toBe(true);
            expect(permissions.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have valid permission codes for all positions', () => {
      const validCodes = Object.values(PERMISSIONS) as string[];

      for (const [positionName, permissions] of Object.entries(PRESET_POSITIONS)) {
        for (const code of permissions) {
          expect(validCodes).toContain(code);
        }
      }
    });
  });
});
