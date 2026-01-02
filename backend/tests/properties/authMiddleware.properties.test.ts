/**
 * Property-Based Tests for Auth Middleware
 * Tests for Properties 4 and 17 from the design document
 * 
 * **Feature: project-refactoring, Property 4: Permission Denial Response Format**
 * **Validates: Requirements 1.5, 8.6**
 * 
 * **Feature: project-refactoring, Property 17: Authentication Failure Response**
 * **Validates: Requirements 8.5**
 */

// IMPORTANT: Set JWT_SECRET before any imports to ensure jwt.ts uses this value
const JWT_SECRET = 'test-secret-key';
process.env.JWT_SECRET = JWT_SECRET;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import express, { Express } from 'express';
import request from 'supertest';
import { 
  authenticate, 
  requirePermission, 
  requireRestaurantAccess,
  requireRole,
  AuthRequest 
} from '../../src/middleware/auth';
import { 
  setPermissionService, 
  resetPermissionService,
  createPermissionService,
  PermissionServiceDatabase,
  PERMISSIONS,
  PermissionCode,
} from '../../src/services/permissionService';
import { errorHandler } from '../../src/middleware/errorHandler';
import jwt from 'jsonwebtoken';

// Mock database for permission service
function createMockDatabase(config: {
  userRoles?: Map<string, string>;
  restaurantManagers?: Map<string, string>;
  memberships?: Set<string>;
  positionPermissions?: Map<string, string[]>;
}): PermissionServiceDatabase {
  const {
    userRoles = new Map(),
    restaurantManagers = new Map(),
    memberships = new Set(),
    positionPermissions = new Map(),
  } = config;

  return {
    async getUserRole(userId: string): Promise<string | null> {
      return userRoles.get(userId) ?? null;
    },
    async getRestaurantManagerId(restaurantId: string): Promise<string | null> {
      return restaurantManagers.get(restaurantId) ?? null;
    },
    async isRestaurantMember(userId: string, restaurantId: string): Promise<boolean> {
      return memberships.has(`${userId}:${restaurantId}`);
    },
    async getUserPositionPermissions(userId: string, restaurantId: string): Promise<string[]> {
      return positionPermissions.get(`${userId}:${restaurantId}`) ?? [];
    },
  };
}

// Create a test app with the middleware
function createTestApp(middleware: any): Express {
  const app = express();
  app.use(express.json());
  
  // Test route that uses the middleware
  app.get('/test/:restaurantId', middleware, (req, res) => {
    res.json({ success: true });
  });
  
  app.use(errorHandler);
  return app;
}

// Generate a valid JWT token
function generateToken(userId: string, role: string = 'EMPLOYEE'): string {
  return jwt.sign(
    { userId, role, email: 'test@example.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Arbitrary generators
const userIdArb = fc.uuid();
const restaurantIdArb = fc.uuid();
const allPermissions = Object.values(PERMISSIONS) as PermissionCode[];
const permissionArb = fc.constantFrom(...allPermissions);

describe('Auth Middleware Properties', () => {
  afterEach(() => {
    resetPermissionService();
  });


  /**
   * **Feature: project-refactoring, Property 4: Permission Denial Response Format**
   * **Validates: Requirements 1.5, 8.6**
   * 
   * For any API request that fails permission check, the response SHALL have
   * status 403 and body containing { status: 403, code: string, message: string, timestamp: string }.
   */
  describe('Property 4: Permission Denial Response Format', () => {
    it('should return 403 with correct format when permission is denied', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          async (userId, restaurantId, permission) => {
            // Skip VIEW_RESTAURANTS as it's always allowed
            if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
              return;
            }

            // Set up mock database - user is EMPLOYEE with no permissions
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(), // Not a member
              restaurantManagers: new Map(), // Not a manager
            });
            const service = createPermissionService(db);
            setPermissionService(service);

            // Create test app with requirePermission middleware
            const app = express();
            app.use(express.json());
            
            // Mock authenticate middleware that sets user
            app.use((req: any, res, next) => {
              req.user = { id: userId, userId, role: 'EMPLOYEE', email: 'test@example.com' };
              next();
            });
            
            app.get('/test/:restaurantId', requirePermission(permission), (req, res) => {
              res.json({ success: true });
            });
            
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`)
              .set('Authorization', `Bearer ${generateToken(userId)}`);

            // Verify response format
            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('status', 403);
            expect(response.body).toHaveProperty('code');
            expect(typeof response.body.code).toBe('string');
            expect(response.body).toHaveProperty('message');
            expect(typeof response.body.message).toBe('string');
            expect(response.body).toHaveProperty('timestamp');
            expect(typeof response.body.timestamp).toBe('string');
            
            // Verify timestamp is valid ISO 8601
            const timestamp = new Date(response.body.timestamp);
            expect(timestamp.toISOString()).toBe(response.body.timestamp);
          }
        ),
        { numRuns: 50 } // Reduced runs since HTTP tests are slower
      );
    });

    it('should return 403 with FORBIDDEN_NO_PERMISSION code', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(),
            });
            const service = createPermissionService(db);
            setPermissionService(service);

            const app = express();
            app.use(express.json());
            app.use((req: any, res, next) => {
              req.user = { id: userId, userId, role: 'EMPLOYEE', email: 'test@example.com' };
              next();
            });
            app.get('/test/:restaurantId', requirePermission(PERMISSIONS.EDIT_SCHEDULE), (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`);

            expect(response.status).toBe(403);
            expect(response.body.code).toBe('FORBIDDEN_NO_PERMISSION');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 403 with FORBIDDEN_NO_RESTAURANT_ACCESS code for restaurant access denial', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(), // Not a member
              restaurantManagers: new Map(), // Not a manager
            });
            const service = createPermissionService(db);
            setPermissionService(service);

            const app = express();
            app.use(express.json());
            app.use((req: any, res, next) => {
              req.user = { id: userId, userId, role: 'EMPLOYEE', email: 'test@example.com' };
              next();
            });
            app.get('/test/:restaurantId', requireRestaurantAccess, (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`);

            expect(response.status).toBe(403);
            expect(response.body.code).toBe('FORBIDDEN_NO_RESTAURANT_ACCESS');
            expect(response.body).toHaveProperty('status', 403);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * **Feature: project-refactoring, Property 17: Authentication Failure Response**
   * **Validates: Requirements 8.5**
   * 
   * For any request with missing, invalid, or expired authentication token,
   * the response SHALL have status 401.
   */
  describe('Property 17: Authentication Failure Response', () => {
    it('should return 401 when no token is provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          restaurantIdArb,
          async (restaurantId) => {
            const app = express();
            app.use(express.json());
            app.get('/test/:restaurantId', authenticate, (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`);
            // No Authorization header

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('status', 401);
            expect(response.body).toHaveProperty('code');
            expect(response.body.code).toBe('AUTH_TOKEN_MISSING');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 401 when token is invalid', async () => {
      await fc.assert(
        fc.asyncProperty(
          restaurantIdArb,
          fc.string({ minLength: 10, maxLength: 100 }), // Random invalid token
          async (restaurantId, invalidToken) => {
            const app = express();
            app.use(express.json());
            app.get('/test/:restaurantId', authenticate, (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`)
              .set('Authorization', `Bearer ${invalidToken}`);

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('status', 401);
            expect(response.body).toHaveProperty('code');
            expect(response.body.code).toBe('AUTH_TOKEN_INVALID');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 401 when token is expired', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            // Generate an expired token by setting iat in the past and short expiry
            const pastTime = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
            const expiredToken = jwt.sign(
              { 
                userId, 
                role: 'EMPLOYEE', 
                email: 'test@example.com',
                iat: pastTime,
                exp: pastTime + 3600 // Expired 1 hour ago
              },
              JWT_SECRET
            );

            const app = express();
            app.use(express.json());
            app.get('/test/:restaurantId', authenticate, (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app)
              .get(`/test/${restaurantId}`)
              .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('status', 401);
            expect(response.body).toHaveProperty('code');
            expect(response.body.code).toBe('AUTH_TOKEN_EXPIRED');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 401 with correct response format for all auth failures', async () => {
      // Test various auth failure scenarios
      const scenarios = [
        { name: 'no_header', header: undefined },
        { name: 'empty_bearer', header: 'Bearer ' },
        { name: 'wrong_scheme', header: 'Basic abc123' },
        { name: 'malformed', header: 'Bearer' },
      ];

      for (const scenario of scenarios) {
        const app = express();
        app.use(express.json());
        app.get('/test', authenticate, (req, res) => {
          res.json({ success: true });
        });
        app.use(errorHandler);

        const req = request(app).get('/test');
        if (scenario.header) {
          req.set('Authorization', scenario.header);
        }

        const response = await req;

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('status', 401);
        expect(response.body).toHaveProperty('code');
        expect(typeof response.body.code).toBe('string');
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
        expect(response.body).toHaveProperty('timestamp');
        
        // Verify timestamp is valid ISO 8601
        const timestamp = new Date(response.body.timestamp);
        expect(timestamp.toISOString()).toBe(response.body.timestamp);
      }
    });
  });

  /**
   * Additional property: Role-based access returns 403 with correct format
   */
  describe('Role-based access denial format', () => {
    it('should return 403 with correct format when role check fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.constantFrom('EMPLOYEE', 'MANAGER'),
          async (userId, role) => {
            const app = express();
            app.use(express.json());
            app.use((req: any, res, next) => {
              req.user = { id: userId, userId, role, email: 'test@example.com' };
              next();
            });
            // Require OWNER or ADMIN role
            app.get('/test', requireRole('OWNER', 'ADMIN'), (req, res) => {
              res.json({ success: true });
            });
            app.use(errorHandler);

            const response = await request(app).get('/test');

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('status', 403);
            expect(response.body).toHaveProperty('code', 'FORBIDDEN_NO_PERMISSION');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
