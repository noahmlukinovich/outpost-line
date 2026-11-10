/**
 * Player intent → game commands. Holds the selection and the placement "ghost", and draws the
 * world-space overlays for them (ghost preview, rally flag, leash circle, rotate handle).
 *
 * Placement flow: tap a unit card → a ghost appears → drag it (or tap where it should go) →
 * rotate with the handle if you like → tap ✔ in the UI. Nothing is spent until ✔.
 */
import Phaser from 'phaser';
import { addArt } from '../assets/art';
import { Palette } from '../assets/palette';
import { sfx } from '../audio/Sfx';
import { getCover } from '../data/cover';
import { getUnit } from '../data/units';
import type { PointerTarget } from '../input/types';
import type { PowerId } from '../data/types';
import { VEHICLE_SCALE } from '../render/WorldRenderer';
import { Depth } from '../render/depth';
import { UNIT_DRAW_SCALE, trooperArt } from '../render/WorldRenderer';
import type { Placeable, Squad } from '../sim/entities';
import { getBuilding, isBuildingId } from '../data/buildings';
import type { PlacementCheck, World } from '../sim/World';

export interface Ghost {
  unitId: string;
  x: number;
  y: number;
  facing: number;
  manualFacing: boolean;
  check: PlacementCheck;
}

type Grab = 'none' | 'ghost' | 'ghostRotate' | 'rally' | 'rotate' | 'power';

/** Distance (world units) from the squad center to its rotate handle. */
const HANDLE_DIST = 62;

export class Controller implements PointerTarget {
  ghost: Ghost | null = null;
  selected: Placeable | null = null;
  private grab: Grab = 'none';
  private grabOffset = { x: 0, y: 0 };
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly flag: Phaser.GameObjects.Image;
  private ghostTroopers: Phaser.GameObjects.Image[] = [];
  private t = 0;
  /** Called whenever selection/placement changes, so the UI can refresh. */
  onChange?: () => void;
  /** Called when an action fails, with the reason (shown as a toast). */
  onError?: (reason: string) => void;
  /** Commander power being aimed (null = none). */
  power: PowerId | null = null;
  private aim = { x: 0, y: 0, x2: 0, y2: 0, active: false };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.g = scene.add.graphics().setDepth(Depth.handles);
    this.flag = addArt(scene, 'fx.flag').setOrigin(0.25, 0.94).setDepth(Depth.handles + 1).setVisible(false);
  }

  // ------------------------------------------------------------------ commands from the UI

  beginPlacement(unitId: string, x: number, y: number): void {
    this.select(null);
    for (const t of this.ghostTroopers) t.destroy();
    if (isBuildingId(unitId)) {
      const b = getBuilding(unitId);
      const img = addArt(this.scene, b.art).setAlpha(0.75).setDepth(Depth.handles - 1);
      img.setScale(((b.footprint * 2.2) / 64) * img.scale);
      this.ghostTroopers = [img];
    } else {
      const def = getUnit(unitId);
      if (def.vehicleHull) {
        const hull = addArt(this.scene, def.vehicleHull).setAlpha(0.75).setDepth(Depth.handles - 1);
        const tur = addArt(this.scene, def.art).setAlpha(0.75).setDepth(Depth.handles - 1);
        hull.setScale(hull.scale * VEHICLE_SCALE);
        tur.setScale(tur.scale * VEHICLE_SCALE);
        this.ghostTroopers = [hull, tur];
      } else {
        this.ghostTroopers = Array.from({ length: def.troopers }, (_, i) =>
          addArt(this.scene, trooperArt({ def, spec: null }, i)).setAlpha(0.75).setDepth(Depth.handles - 1),
        );
        for (const img of this.ghostTroopers) img.setScale(img.scale * UNIT_DRAW_SCALE);
      }
    }
    this.ghost = { unitId, x, y, facing: 0, manualFacing: false, check: this.world.checkPlacement(unitId, x, y) };
    this.moveGhost(x, y);
    this.onChange?.();
  }

  moveGhost(x: number, y: number): void {
    const gh = this.ghost;
    if (!gh) return;
    gh.x = x;
    gh.y = y;
    gh.check = this.world.checkPlacement(gh.unitId, x, y);
    if (!gh.manualFacing && !isBuildingId(gh.unitId)) gh.facing = this.world.suggestFacing(gh.check.x, gh.check.y);
  }

  confirmPlacement(): boolean {
    const gh = this.ghost;
    if (!gh) return false;
    gh.check = this.world.checkPlacement(gh.unitId, gh.x, gh.y);
    if (!gh.check.ok) {
      sfx.error();
      return false;
    }
    const placed = this.world.place(gh.unitId, gh.x, gh.y, gh.facing);
    this.cancelPlacement();
    if (placed) this.select(placed);
    return !!placed;
  }

  cancelPlacement(): void {
    this.ghost = null;
    for (const t of this.ghostTroopers) t.destroy();
    this.ghostTroopers = [];
    this.grab = 'none';
    this.onChange?.();
  }

  select(p: Placeable | null): void {
    if (this.selected === p) return;
    this.selected = p;
    this.onChange?.();
  }

  get selectedSquad(): Squad | null {
    return this.selected?.kind === 'squad' ? this.selected : null;
  }

  // ------------------------------------------------------------------ pointer input

  pointerDown(x: number, y: number, r: number): boolean {
    if (this.power) {
      this.aim = { x, y, x2: x, y2: y, active: true };
      return this.startGrab('power', 0, 0);
    }
    const gh = this.ghost;
    if (gh) {
      const hx = gh.check.x + Math.cos(gh.facing) * HANDLE_DIST, hy = gh.check.y + Math.sin(gh.facing) * HANDLE_DIST;
      if (!isBuildingId(gh.unitId) && Math.hypot(x - hx, y - hy) < r) return this.startGrab('ghostRotate', 0, 0);
      if (Math.hypot(x - gh.check.x, y - gh.check.y) < Math.max(r, 34)) return this.startGrab('ghost', gh.x - x, gh.y - y);
      return false;
    }
    const s = this.selectedSquad;
    if (s && !s.removed) {
      if (Math.hypot(x - s.rallyX, y - (s.rallyY - 14)) < Math.max(r, 26)) return this.startGrab('rally', s.rallyX - x, s.rallyY - y);
      const hx = s.x + Math.cos(s.facing) * HANDLE_DIST, hy = s.y + Math.sin(s.facing) * HANDLE_DIST;
      if (Math.hypot(x - hx, y - hy) < r) return this.startGrab('rotate', 0, 0);
    }
    return false;
  }

  private startGrab(g: Grab, ox: number, oy: number): boolean {
    this.grab = g;
    this.grabOffset.x = ox;
    this.grabOffset.y = oy;
    return true;
  }

  dragMove(x: number, y: number): void {
    const gh = this.ghost, s = this.selectedSquad;
    switch (this.grab) {
      case 'power':
        if (this.power === 'airstrike') {
          this.aim.x2 = x;
          this.aim.y2 = y;
        } else {
          this.aim.x = this.aim.x2 = x;
          this.aim.y = this.aim.y2 = y;
        }
        break;
      case 'ghost':
        this.moveGhost(x + this.grabOffset.x, y + this.grabOffset.y);
        break;
      case 'ghostRotate':
        if (gh) {
          gh.facing = this.snapAngle(Math.atan2(y - gh.check.y, x - gh.check.x));
          gh.manualFacing = true;
        }
        break;
      case 'rally':
        if (s) this.world.setRally(s, x + this.grabOffset.x, y + this.grabOffset.y);
        break;
      case 'rotate':
        if (s) this.world.rotate(s, this.snapAngle(Math.atan2(y - s.y, x - s.x)));
        break;
    }
  }

  /** True while a ghost, flag or handle is being dragged (the camera edge-scrolls). */
  get dragging(): boolean {
    return this.grab !== 'none';
  }

  dragEnd(x: number, y: number): void {
    this.dragMove(x, y);
    if (this.grab === 'power' && this.power) {
      const id = this.power;
      const a = this.aim;
      const reason = this.world.checkPower(id, a.x, a.y);
      if (reason) {
        this.onError?.(reason);
        sfx.error();
      } else {
        this.world.usePower(id, a.x, a.y, a.x2, a.y2);
      }
      this.power = null;
      this.aim.active = false;
    }
    this.grab = 'none';
    this.onChange?.();
  }

  /** Start aiming a commander power (from the UI button). Tapping it again cancels. */
  beginPower(id: PowerId): void {
    if (this.power === id) {
      this.power = null;
      this.onChange?.();
      return;
    }
    this.cancelPlacement();
    this.select(null);
    this.power = id;
    this.aim.active = false;
    this.onChange?.();
  }

  tap(x: number, y: number): void {
    if (this.ghost) {
      // Tapping elsewhere while placing moves the ghost there.
      this.moveGhost(x, y);
      this.onChange?.();
      return;
    }
    let best: Placeable | null = null;
    let bestD = Infinity;
    for (const s of this.world.squads) {
      const d = Math.min(Math.hypot(s.x - x, s.y - y), Math.hypot(s.anchorX - x, s.anchorY - y));
      if (d < s.def.footprint + 14 && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    for (const b of this.world.buildings) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < b.def.footprint + 10 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    // With the hero selected, tapping open ground sends the hero there.
    const sel = this.selected;
    if (!best && sel?.kind === 'squad' && sel.hero && !sel.down) {
      const r = this.world.setRally(sel, x, y);
      if (r.x === x && r.y === y) {
        this.moveMarker = { x, y, t: 0.6 };
        sfx.click();
      }
      return;
    }
    if (best) sfx.click();
    this.select(best);
  }

  private moveMarker: { x: number; y: number; t: number } | null = null;

  /** 15° steps make it easy to line arcs up with roads. */
  private snapAngle(a: number): number {
    const step = Math.PI / 12;
    return Math.round(a / step) * step;
  }

  // ------------------------------------------------------------------ overlay drawing

  update(dt: number): void {
    this.t += dt;
    const g = this.g.clear();
    this.flag.setVisible(false);
    if (this.moveMarker) {
      const m = this.moveMarker;
      m.t -= dt;
      g.lineStyle(2.5, 0xf2c14a, Math.max(0, m.t / 0.6)).strokeCircle(m.x, m.y, 8 + (0.6 - m.t) * 30);
      if (m.t <= 0) this.moveMarker = null;
    }
    if (this.power && this.aim.active) {
      const def = this.world.powerDefs[this.power];
      const a = this.aim;
      const ok = !this.world.checkPower(this.power, a.x, a.y);
      const col = ok ? (this.power === 'emp' ? 0x6fc8ff : this.power === 'droppod' ? Palette.fdcAccent : 0xff5a3a) : 0x888888;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 10);
      if (this.power === 'airstrike') {
        let dx = a.x2 - a.x, dy = a.y2 - a.y;
        const len = Math.hypot(dx, dy);
        if (len > 20) {
          dx /= len;
          dy /= len;
          const L = def.length ?? 300, cx = (a.x + a.x2) / 2, cy = (a.y + a.y2) / 2;
          const x0 = cx - dx * L / 2, y0 = cy - dy * L / 2;
          g.lineStyle(3, col, 0.8).lineBetween(x0, y0, x0 + dx * L, y0 + dy * L);
          const n = def.bombs ?? 6;
          for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            g.lineStyle(1.5, col, 0.5).strokeCircle(x0 + dx * L * k, y0 + dy * L * k, def.radius);
          }
        } else {
          g.lineStyle(2, col, 0.6 + 0.4 * pulse).strokeCircle(a.x, a.y, 20);
        }
      } else {
        g.lineStyle(3, col, 0.6 + 0.4 * pulse).strokeCircle(a.x, a.y, def.radius);
        g.fillStyle(col, 0.12).fillCircle(a.x, a.y, def.radius);
        g.lineStyle(2, col, 0.8).lineBetween(a.x - def.radius * 0.4, a.y, a.x + def.radius * 0.4, a.y).lineBetween(a.x, a.y - def.radius * 0.4, a.x, a.y + def.radius * 0.4);
      }
      return;
    }
    if (this.selected?.removed) this.select(null);

    const gh = this.ghost;
    if (gh && isBuildingId(gh.unitId)) {
      const b = getBuilding(gh.unitId);
      const { x, y, ok } = gh.check;
      const color = ok ? 0x7be08a : 0xff5a4a;
      g.lineStyle(2, color, 0.9).strokeCircle(x, y, b.footprint);
      g.fillStyle(color, 0.15).fillCircle(x, y, b.footprint);
      const detect = b.tiers[0].detect;
      if (detect) {
        g.lineStyle(2, 0x9a7aff, 0.6).strokeCircle(x, y, detect);
        g.fillStyle(0x9a7aff, 0.06).fillCircle(x, y, detect);
      }
      this.ghostTroopers[0]?.setPosition(x, y).setTint(ok ? 0xffffff : 0xff9090);
      return;
    }
    if (gh) {
      const def = getUnit(gh.unitId);
      const { x, y, ok, cover } = gh.check;
      const color = ok ? 0x7be08a : 0xff5a4a;
      const range = def.tiers[0].weapon.range * (cover ? getCover(cover.type).rangeBonus : 1);
      this.drawArc(g, x, y, gh.facing, def.arcDeg, range, color, 0.12, 0.7);
      g.lineStyle(2, color, 0.9).strokeCircle(x, y, def.footprint);
      g.fillStyle(color, 0.15).fillCircle(x, y, def.footprint);
      if (cover) g.lineStyle(3, Palette.fdcAccent, 0.9).strokeCircle(cover.x, cover.y, getCover(cover.type).radius + 6);
      this.drawHandle(g, x + Math.cos(gh.facing) * HANDLE_DIST, y + Math.sin(gh.facing) * HANDLE_DIST, gh.facing);
      const n = this.ghostTroopers.length;
      if (def.vehicleHull) {
        for (const img of this.ghostTroopers) img.setPosition(x, y).setRotation(gh.facing).setTint(ok ? 0xffffff : 0xff9090);
        return;
      }
      this.ghostTroopers.forEach((img, i) => {
        const lateral = (i - (n - 1) / 2) * (n > 2 ? 15 : 17);
        const fwd = -Math.abs(lateral) * 0.35;
        const c = Math.cos(gh.facing), s = Math.sin(gh.facing);
        img.setPosition(x + fwd * c - lateral * s, y + fwd * s + lateral * c).setRotation(gh.facing).setTint(ok ? 0xffffff : 0xff9090);
      });
      return;
    }

    const sel = this.selected;
    if (!sel) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    if (sel.kind === 'building') {
      g.lineStyle(2.5, Palette.uiAmber, 0.6 + 0.4 * pulse).strokeCircle(sel.x, sel.y, sel.def.footprint + 6);
      return;
    }
    const s = sel;
    // Leash circle (where the rally point may go). Heroes roam freely.
    if (!s.hero) {
      g.lineStyle(1.5, 0xffffff, 0.25);
      this.dashedCircle(g, s.anchorX, s.anchorY, s.def.leash);
    }
    // Selection ring.
    g.lineStyle(2.5, Palette.uiAmber, 0.6 + 0.4 * pulse).strokeCircle(s.x, s.y, s.def.footprint + 4);
    // Line from squad to rally point.
    if (Math.hypot(s.rallyX - s.x, s.rallyY - s.y) > 4) g.lineStyle(2, Palette.fdcAccent, 0.6).lineBetween(s.x, s.y, s.rallyX, s.rallyY);
    this.flag.setVisible(true).setPosition(s.rallyX, s.rallyY);
    if (!s.down) this.drawHandle(g, s.x + Math.cos(s.facing) * HANDLE_DIST, s.y + Math.sin(s.facing) * HANDLE_DIST, s.facing);
  }

  private drawArc(g: Phaser.GameObjects.Graphics, x: number, y: number, facing: number, arcDeg: number, range: number, color: number, fill: number, line: number): void {
    const half = (arcDeg * Math.PI) / 360;
    g.fillStyle(color, fill).slice(x, y, range, facing - half, facing + half).fillPath();
    g.lineStyle(2, color, line).slice(x, y, range, facing - half, facing + half).strokePath();
  }

  private drawHandle(g: Phaser.GameObjects.Graphics, x: number, y: number, facing: number): void {
    g.fillStyle(0x000000, 0.5).fillCircle(x + 1.5, y + 2, 13);
    g.fillStyle(Palette.uiAmber, 1).fillCircle(x, y, 12);
    g.lineStyle(2.5, Palette.uiPanel, 1).beginPath().arc(x, y, 6.5, facing + 0.6, facing + Math.PI * 2 - 0.6).strokePath();
    // little arrowhead to hint "rotate"
    const a = facing + 0.6;
    const ax = x + Math.cos(a) * 6.5, ay = y + Math.sin(a) * 6.5;
    g.fillStyle(Palette.uiPanel, 1).fillTriangle(ax, ay, ax + Math.cos(a - 1.2) * 5, ay + Math.sin(a - 1.2) * 5, ax + Math.cos(a + 2) * 4, ay + Math.sin(a + 2) * 4);
  }

  private dashedCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const n = 32;
    for (let i = 0; i < n; i += 2) {
      g.beginPath().arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2).strokePath();
    }
  }
}
