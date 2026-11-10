/**
 * Tiny object pool. Instead of creating/destroying objects every shot or kill (which makes the
 * garbage collector stutter), we create them once and recycle them.
 *
 * Usage: const p = new Pool(() => makeThing(), 64); const t = p.acquire(); ...; p.release(t);
 */
export class Pool<T> {
  private free: T[] = [];
  private readonly all: T[] = [];

  constructor(
    private readonly create: () => T,
    prewarm = 0,
    private readonly maxSize = Infinity,
  ) {
    for (let i = 0; i < prewarm; i++) {
      const item = create();
      this.all.push(item);
      this.free.push(item);
    }
  }

  /** Returns a recycled item, a new one, or null if the pool is at its hard cap. */
  acquire(): T | null {
    const item = this.free.pop();
    if (item !== undefined) return item;
    if (this.all.length >= this.maxSize) return null;
    const fresh = this.create();
    this.all.push(fresh);
    return fresh;
  }

  release(item: T): void {
    this.free.push(item);
  }

  get size(): number {
    return this.all.length;
  }

  get inUse(): number {
    return this.all.length - this.free.length;
  }
}
