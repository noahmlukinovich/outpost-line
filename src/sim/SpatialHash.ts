/**
 * Uniform grid for "which enemies are near this point?" queries. Rebuilt every tick; buckets
 * are reused so it never allocates after warm-up. With 100+ enemies and 20 squads this turns
 * thousands of distance checks per tick into a few dozen.
 */
export interface Positioned {
  x: number;
  y: number;
}

export class SpatialHash<T extends Positioned> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: T[][];

  constructor(
    width: number,
    height: number,
    private readonly cell = 64,
  ) {
    this.cols = Math.ceil(width / cell) + 2;
    this.rows = Math.ceil(height / cell) + 2;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell) + 1));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell) + 1));
  }

  insert(item: T): void {
    this.buckets[this.row(item.y) * this.cols + this.col(item.x)].push(item);
  }

  /** Fills `out` with items whose cell overlaps the circle (caller does the exact distance check). */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const c0 = this.col(x - r), c1 = this.col(x + r);
    const r0 = this.row(y - r), r1 = this.row(y + r);
    for (let row = r0; row <= r1; row++) {
      for (let c = c0; c <= c1; c++) {
        const b = this.buckets[row * this.cols + c];
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
