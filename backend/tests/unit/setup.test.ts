import { describe, it, expect } from 'vitest';
import { createMockRequest, createMockResponse, generateTestId } from '../helpers';
import { testUser, testRestaurant } from '../helpers';

describe('Test Infrastructure', () => {
  it('should have working test helpers', () => {
    const req = createMockRequest({ body: { test: true } });
    const res = createMockResponse();
    
    expect(req.body.test).toBe(true);
    expect(res.status).toBeDefined();
    expect(res.json).toBeDefined();
  });

  it('should generate unique test IDs', () => {
    const id1 = generateTestId();
    const id2 = generateTestId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^test-/);
  });

  it('should have valid test fixtures', () => {
    expect(testUser.id).toBeDefined();
    expect(testUser.email).toContain('@');
    expect(testRestaurant.id).toBeDefined();
    expect(testRestaurant.name).toBe('Test Restaurant');
  });
});
