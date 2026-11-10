/** Small, allocation-free geometry helpers used by the simulation. */

export interface Vec {
  x: number;
  y: number;
}

export function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

export function pointInPolygon(x: number, y: number, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to a polygon's edges (0 if you only need inside/outside, use pointInPolygon). */
export function distToPolygonEdge(x: number, y: number, poly: readonly Vec[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distSqToSegment(x, y, poly[j].x, poly[j].y, poly[i].x, poly[i].y));
  }
  return Math.sqrt(best);
}

/** Smallest signed difference between two angles, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * A walkable path: a polyline with precomputed segment lengths so enemies can be stored as
 * "distance travelled" and turned into x/y cheaply.
 */
export class Path {
  readonly points: readonly Vec[];
  readonly cumulative: number[];
  readonly length: number;

  constructor(
    readonly name: string,
    points: Vec[],
    readonly width: number,
  ) {
    if (points.length < 2) throw new Error(`Path "${name}" needs at least 2 points`);
    this.points = points;
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  /** Writes the position at distance `d` along the path into `out` (and returns the heading). */
  sample(d: number, out: Vec): number {
    const pts = this.points, cum = this.cumulative;
    if (d <= 0) {
      out.x = pts[0].x;
      out.y = pts[0].y;
      return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    }
    // Paths are short (≤ ~30 points), so a linear scan is faster than a binary search here.
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i];
    const segLen = cum[i] - cum[i - 1];
    const t = segLen > 0 ? Math.min(1, (d - cum[i - 1]) / segLen) : 0;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  distSqTo(x: number, y: number): number {
    let best = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const d = distSqToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
    return best;
  }

  /** The point on the path closest to (x, y). */
  closestPoint(x: number, y: number, out: Vec): Vec {
    let best = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / lenSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a.x + dx * t, cy = a.y + dy * t;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < best) {
        best = d;
        out.x = cx;
        out.y = cy;
      }
    }
    return out;
  }
}
