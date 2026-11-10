/**
 * Touch/mouse gestures for the battlefield:
 *   - tap               → select / deselect / move the placement ghost
 *   - drag on a handle  → move ghost, rally flag, or rotate a squad
 *   - drag elsewhere    → pan the camera
 *   - two-finger pinch  → zoom (and pan)
 *   - mouse wheel       → zoom (desktop testing)
 * Touches that start on UI are ignored here (the UI scene handles them).
 */
import Phaser from 'phaser';
import { DPR } from '../app/display';
import type { CameraRig } from './CameraRig';
import type { PointerTarget, UiHitTester } from './types';

interface Touch {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  mode: 'pending' | 'grab' | 'pan' | 'pinch' | 'ignored';
}

const TAP_SLOP = 10; // CSS px a finger may wiggle and still count as a tap
const TAP_TIME = 450; // ms
const TOUCH_RADIUS = 30; // CSS px: how close a finger must be to grab a handle

export class InputRouter {
  private touches = new Map<number, Touch>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private tmp = { x: 0, y: 0 };
  enabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly rig: CameraRig,
    private readonly target: PointerTarget,
    private readonly ui: UiHitTester,
  ) {
    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.rig.zoomAt(dy > 0 ? 0.9 : 1.1, p.x, p.y);
    });
  }

  private get touchRadius(): number {
    return TOUCH_RADIUS / this.rig.zoom;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const t: Touch = { id: p.id, x: p.x, y: p.y, startX: p.x, startY: p.y, startTime: p.downTime || performance.now(), mode: 'pending' };
    this.touches.set(p.id, t);
    if (!this.enabled || this.ui.hitTest(p.x / DPR, p.y / DPR)) {
      t.mode = 'ignored';
      return;
    }
    const active = [...this.touches.values()].filter((q) => q.mode !== 'ignored');
    if (active.length >= 2) {
      // Second finger: switch everything to pinch. Finish any drag cleanly first.
      for (const q of active) {
        if (q.mode === 'grab') {
          const w = this.rig.screenToWorld(q.x, q.y, this.tmp);
          this.target.dragEnd(w.x, w.y);
        }
        q.mode = 'pinch';
      }
      this.startPinch(active[0], active[1]);
      return;
    }
    const w = this.rig.screenToWorld(p.x, p.y, this.tmp);
    if (this.target.pointerDown(w.x, w.y, this.touchRadius)) t.mode = 'grab';
  }

  private startPinch(a: Touch, b: Touch): void {
    this.pinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.pinchMid.x = (a.x + b.x) / 2;
    this.pinchMid.y = (a.y + b.y) / 2;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const t = this.touches.get(p.id);
    if (!t || !p.isDown) return;
    const dx = p.x - t.x, dy = p.y - t.y;
    t.x = p.x;
    t.y = p.y;
    switch (t.mode) {
      case 'grab': {
        const w = this.rig.screenToWorld(p.x, p.y, this.tmp);
        this.target.dragMove(w.x, w.y);
        break;
      }
      case 'pending':
        if (Math.hypot(p.x - t.startX, p.y - t.startY) / DPR > TAP_SLOP) {
          t.mode = 'pan';
          this.rig.panBy(p.x - t.startX, p.y - t.startY);
        }
        break;
      case 'pan':
        this.rig.panBy(dx, dy);
        break;
      case 'pinch': {
        const pair = [...this.touches.values()].filter((q) => q.mode === 'pinch');
        if (pair.length < 2) return;
        const [a, b] = pair;
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.rig.panBy(mx - this.pinchMid.x, my - this.pinchMid.y);
        this.rig.zoomAt(dist / this.pinchDist, mx, my);
        this.pinchDist = dist;
        this.pinchMid.x = mx;
        this.pinchMid.y = my;
        break;
      }
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const t = this.touches.get(p.id);
    if (!t) return;
    this.touches.delete(p.id);
    const w = this.rig.screenToWorld(p.x, p.y, this.tmp);
    if (t.mode === 'grab') {
      this.target.dragEnd(w.x, w.y);
    } else if (t.mode === 'pending') {
      const quick = performance.now() - t.startTime < TAP_TIME;
      if (quick) this.target.tap(w.x, w.y, this.touchRadius);
    } else if (t.mode === 'pinch') {
      // The remaining finger shouldn't suddenly pan or tap.
      for (const q of this.touches.values()) if (q.mode === 'pinch') q.mode = 'ignored';
    }
  }

  /**
   * Edge-scrolling: while dragging something near a screen edge (or over the HUD bars), slide the
   * camera so you can place things anywhere on the map. Returns true if the camera moved.
   */
  edgePan(cssX: number, cssY: number, dt: number, hud: { top: number; bottom: number }): boolean {
    const W = this.rig.viewWidth, H = this.rig.viewHeight;
    const m = 60;
    let vx = 0, vy = 0;
    if (cssX < m) vx = (m - cssX) / m;
    else if (cssX > W - m) vx = -(cssX - (W - m)) / m;
    if (cssY < hud.top + m * 0.5) vy = Math.min(1, (hud.top + m * 0.5 - cssY) / m);
    else if (cssY > H - hud.bottom - m * 0.5) vy = -Math.min(1, (cssY - (H - hud.bottom - m * 0.5)) / m);
    if (!vx && !vy) return false;
    const speed = 520 * dt * DPR;
    return this.rig.panBy(vx * speed, vy * speed);
  }

  /** Per-frame: edge-scroll while a handle/ghost is grabbed on the battlefield. */
  update(dt: number, hud: { top: number; bottom: number }): void {
    for (const t of this.touches.values()) {
      if (t.mode !== 'grab') continue;
      if (this.edgePan(t.x / DPR, t.y / DPR, dt, hud)) {
        const w = this.rig.screenToWorld(t.x, t.y, this.tmp);
        this.target.dragMove(w.x, w.y);
      }
    }
  }

  /** Drop all tracked touches (e.g. when a menu opens). */
  reset(): void {
    this.touches.clear();
  }
}
