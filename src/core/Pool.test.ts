import { describe, expect, it } from 'vitest';
import { Pool } from './Pool';

describe('Pool', () => {
  it('recycles released objects instead of creating new ones', () => {
    let created = 0;
    const pool = new Pool(() => ({ id: created++ }), 2);
    const a = pool.acquire()!;
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(created).toBe(2);
  });

  it('grows on demand but respects its hard cap', () => {
    const pool = new Pool(() => ({}), 0, 2);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    expect(pool.inUse).toBe(2);
  });
});
