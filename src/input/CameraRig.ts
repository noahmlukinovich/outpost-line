/**
 * World camera: pan, pinch-zoom and fit-to-screen, kept inside the map with room for the HUD.
 * Coordinates: "screen" = canvas pixels (CSS px × DPR), "world" = map units.
 */
import Phaser from 'phaser';
import { DPR } from '../app/display';

export interface HudInsets {
  top: number;
  bottom: number;
}

export class CameraRig {
  /** User zoom (1 = one world unit per CSS pixel). */
  zoom = 1;
  minZoom = 0.5;
  maxZoom = 2.2;

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    private readonly mapW: number,
    private readonly mapH: number,
    private hud: HudInsets,
  ) {
    this.fit();
  }

  private get viewW(): number {
    return this.cam.width / DPR;
  }

  private get viewH(): number {
    return this.cam.height / DPR;
  }

  get viewWidth(): number {
    return this.viewW;
  }

  get viewHeight(): number {
    return this.viewH;
  }

  /** Smoothly move the camera so world point (wx, wy) ends up at CSS screen point (sx, sy). */
  glideTo(wx: number, wy: number, sx: number, sy: number): void {
    const cur = this.worldToScreen(wx, wy);
    this.glide = { dx: sx * DPR - cur.x, dy: sy * DPR - cur.y };
  }

  private glide: { dx: number; dy: number } | null = null;

  /** Per-frame update for smooth camera glides. */
  update(dt: number): void {
    if (!this.glide) return;
    const k = Math.min(1, dt * 8);
    const mx = this.glide.dx * k, my = this.glide.dy * k;
    this.panBy(mx, my);
    this.glide.dx -= mx;
    this.glide.dy -= my;
    if (Math.abs(this.glide.dx) + Math.abs(this.glide.dy) < 1) this.glide = null;
  }

  /**
   * The smallest zoom that still fills the whole screen with map (no empty bars), and the zoom
   * that would show the whole map between the HUD bars. We start a little closer than "whole map"
   * but never zoom out past "fill the screen".
   */
  private zoomLimits(): { fill: number; fit: number } {
    const fill = Math.max(this.viewW / this.mapW, this.viewH / this.mapH);
    const fit = Math.min(this.viewW / this.mapW, (this.viewH - this.hud.top - this.hud.bottom) / this.mapH);
    return { fill, fit };
  }

  fit(): void {
    const cam = this.cam;
    cam.setSize(cam.scene.scale.width, cam.scene.scale.height);
    const { fill } = this.zoomLimits();
    this.minZoom = fill;
    this.maxZoom = Math.max(2.2, fill * 2.6);
    this.setZoom(fill);
    this.centerOn(this.mapW / 2, this.mapH / 2);
  }

  resize(hud: HudInsets): void {
    this.hud = hud;
    const c = this.screenToWorld(this.cam.width / 2, this.cam.height / 2);
    this.cam.setSize(this.cam.scene.scale.width, this.cam.scene.scale.height);
    this.minZoom = this.zoomLimits().fill;
    this.setZoom(Phaser.Math.Clamp(this.zoom, this.minZoom, this.maxZoom));
    this.centerOn(c.x, c.y);
  }

  private setZoom(z: number): void {
    this.zoom = z;
    this.cam.setZoom(z * DPR);
  }

  centerOn(x: number, y: number): void {
    this.cam.scrollX = x - this.cam.width / 2;
    this.cam.scrollY = y - this.cam.height / 2;
    this.clamp();
  }

  screenToWorld(px: number, py: number, out = { x: 0, y: 0 }): { x: number; y: number } {
    const cam = this.cam;
    out.x = cam.scrollX + cam.width / 2 + (px - cam.width / 2) / cam.zoom;
    out.y = cam.scrollY + cam.height / 2 + (py - cam.height / 2) / cam.zoom;
    return out;
  }

  worldToScreen(wx: number, wy: number, out = { x: 0, y: 0 }): { x: number; y: number } {
    const cam = this.cam;
    out.x = (wx - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2;
    out.y = (wy - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2;
    return out;
  }

  /** Pan by a screen-pixel delta (finger movement). Returns true if the camera actually moved. */
  panBy(dx: number, dy: number): boolean {
    const x0 = this.cam.scrollX, y0 = this.cam.scrollY;
    this.cam.scrollX -= dx / this.cam.zoom;
    this.cam.scrollY -= dy / this.cam.zoom;
    this.clamp();
    return Math.abs(this.cam.scrollX - x0) + Math.abs(this.cam.scrollY - y0) > 0.01;
  }

  /** Zoom by `factor`, keeping the world point under screen point (px, py) fixed. */
  zoomAt(factor: number, px: number, py: number): void {
    const before = this.screenToWorld(px, py);
    this.setZoom(Phaser.Math.Clamp(this.zoom * factor, this.minZoom, this.maxZoom));
    const after = this.screenToWorld(px, py);
    this.cam.scrollX += before.x - after.x;
    this.cam.scrollY += before.y - after.y;
    this.clamp();
  }

  /** Keep the map on screen, with extra margin so edges can be scrolled out from under the HUD. */
  private clamp(): void {
    const cam = this.cam;
    const z = this.zoom;
    const visW = this.viewW / z, visH = this.viewH / z;
    const padX = 40 / z;
    const padTop = (this.hud.top + 10) / z, padBottom = (this.hud.bottom + 10) / z;
    let cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
    const minX = visW / 2 - padX, maxX = this.mapW - visW / 2 + padX;
    cx = minX > maxX ? this.mapW / 2 : Phaser.Math.Clamp(cx, minX, maxX);
    const minY = visH / 2 - padTop, maxY = this.mapH - visH / 2 + padBottom;
    cy = minY > maxY ? this.mapH / 2 + (padBottom - padTop) / 2 : Phaser.Math.Clamp(cy, minY, maxY);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }
}
