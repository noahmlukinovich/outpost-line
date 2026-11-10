/**
 * Draws the static battlefield: ground, road, blocked terrain, cover points, props, the gate and
 * the spawn breach. Built once per mission.
 */
import Phaser from 'phaser';
import { addArt } from '../assets/art';
import { Palette } from '../assets/palette';
import { getCover } from '../data/cover';
import type { World } from '../sim/World';
import { Depth } from './depth';

export class MapView {
  /** Pulsing outlines on empty cover points. */
  private coverRings: { ring: Phaser.GameObjects.Image; index: number }[] = [];
  private breach!: Phaser.GameObjects.Image;
  private lamps: Phaser.GameObjects.Image[] = [];
  private flicker = 0;
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.build();
  }

  private build(): void {
    const { scene, world } = this;
    const map = world.map;

    // Ground continues well past the playable area (dimmed), so the screen never shows empty bars.
    const pad = 700;
    scene.add.tileSprite(-pad, -pad, map.width + pad * 2, map.height + pad * 2, 'env.ground').setOrigin(0, 0).setDepth(Depth.ground);
    const edge = scene.add.graphics().setDepth(Depth.overlay);
    edge.fillStyle(0x080907, 0.55);
    edge.fillRect(-pad, -pad, map.width + pad * 2, pad).fillRect(-pad, map.height, map.width + pad * 2, pad);
    edge.fillRect(-pad, 0, pad, map.height).fillRect(map.width, 0, pad, map.height);
    // Soft inner edge so the boundary reads as "the edge of the battlefield".
    for (let i = 0; i < 6; i++) {
      edge.lineStyle(6, 0x080907, 0.08 * (6 - i));
      edge.strokeRect(i * 6, i * 6, map.width - i * 12, map.height - i * 12);
    }

    this.drawRoad();
    this.drawFlightRoutes();
    this.drawZones();

    // Cover points.
    for (const c of map.cover) {
      const def = getCover(c.type);
      const facing = world.suggestFacing(c.x, c.y);
      scene.add.image(c.x + 4, c.y + 6, 'fx.shadow').setDisplaySize(def.radius * 3, def.radius * 3).setAlpha(0.7).setDepth(Depth.shadow);
      const img = addArt(scene, def.art, c.x, c.y).setDepth(Depth.cover);
      img.rotation = facing;
      if (c.type === 'sandbags') img.setPosition(c.x + Math.cos(facing) * 10, c.y + Math.sin(facing) * 10);
      const ring = scene.add.image(c.x, c.y, 'fx.ring').setDisplaySize(def.radius * 2.2, def.radius * 2.2)
        .setTint(Palette.fdcAccent).setAlpha(0.35).setDepth(Depth.decal);
      this.coverRings.push({ ring, index: c.index });
    }

    // Props and lights.
    for (const d of map.decor) {
      if (d.prop === 'floodlight') {
        const angle = Math.atan2(map.height / 2 - d.y, map.width / 2 - d.x);
        addArt(scene, 'prop.floodlight', d.x, d.y).setRotation(angle).setDepth(Depth.prop);
        const lamp = scene.add.image(d.x + Math.cos(angle) * 120, d.y + Math.sin(angle) * 120, 'fx.light')
          .setDisplaySize(380, 380).setTint(0xffe2b0).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.light);
        this.lamps.push(lamp);
      } else if (d.prop === 'crate') {
        addArt(scene, 'prop.crate', d.x, d.y).setRotation((d.x * 7) % 3).setDepth(Depth.prop);
      } else if (d.prop === 'wreck') {
        scene.add.image(d.x + 5, d.y + 6, 'fx.shadow').setDisplaySize(90, 60).setDepth(Depth.shadow);
        addArt(scene, 'prop.wreck', d.x, d.y).setRotation((d.y * 13) % 6).setDepth(Depth.prop);
      }
    }

    // Gate at the road's exit and the breach at its start.
    const path = world.map.paths[0];
    const p = { x: 0, y: 0 };
    let gateDist = path.length;
    for (let d = path.length; d > 0; d -= 4) {
      path.sample(d, p);
      if (p.x > 30 && p.y > 30 && p.x < map.width - 30 && p.y < map.height - 30) {
        gateDist = d;
        break;
      }
    }
    const heading = path.sample(gateDist, p);
    scene.add.image(p.x + 6, p.y + 8, 'fx.shadow').setDisplaySize(80, 180).setDepth(Depth.shadow);
    addArt(scene, 'prop.gate', p.x, p.y).setRotation(heading).setDepth(Depth.prop);
    scene.add.image(p.x, p.y, 'fx.light').setDisplaySize(300, 300).setTint(0x9fe8ff).setAlpha(0.12)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.light);

    let breachDist = 0;
    for (let d = 0; d < path.length; d += 4) {
      path.sample(d, p);
      if (p.x > 40 && p.y > 40 && p.x < map.width - 40 && p.y < map.height - 40) {
        breachDist = d;
        break;
      }
    }
    path.sample(breachDist, p);
    this.breach = scene.add.image(p.x, p.y, 'fx.light').setDisplaySize(220, 220).setTint(0xff3fc0)
      .setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.light);
  }

  private drawRoad(): void {
    const g = this.scene.add.graphics().setDepth(Depth.road);
    for (const path of this.world.map.paths) {
      const pts = path.points;
      const stroke = (width: number, color: number, alpha: number) => {
        g.lineStyle(width, color, alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
        g.fillStyle(color, alpha);
        for (const q of pts) g.fillCircle(q.x, q.y, width / 2); // rounded joints
      };
      stroke(path.width + 18, 0x2d2a1f, 0.55); // shoulder
      stroke(path.width, 0x3e3626, 1); // dirt
      stroke(path.width - 16, 0x463d2b, 1);
      // Tire ruts
      for (const off of [-12, 12]) {
        g.lineStyle(3, 0x2f291d, 0.8);
        g.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const x = pts[i].x - Math.sin(ang) * off, y = pts[i].y + Math.cos(ang) * off;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
      // Direction chevrons so the route reads at a glance.
      const p = { x: 0, y: 0 };
      g.lineStyle(3, 0x5a4e36, 0.6);
      for (let d = 60; d < path.length - 40; d += 110) {
        const h = path.sample(d, p);
        const c = Math.cos(h), s = Math.sin(h);
        g.beginPath();
        g.moveTo(p.x - c * 7 - s * 9, p.y - s * 7 + c * 9);
        g.lineTo(p.x + c * 5, p.y + s * 5);
        g.lineTo(p.x - c * 7 + s * 9, p.y - s * 7 - c * 9);
        g.strokePath();
      }
    }
  }

  /** Flight routes as faint dashed magenta lines with arrows, and drop zones as hazard circles. */
  private drawFlightRoutes(): void {
    const g = this.scene.add.graphics().setDepth(Depth.decal);
    const p = { x: 0, y: 0 };
    for (const route of this.world.map.flights) {
      for (let d = 0; d < route.length; d += 24) {
        const h = route.sample(d, p);
        g.lineStyle(2, 0xff6ae0, 0.18).lineBetween(p.x, p.y, p.x + Math.cos(h) * 12, p.y + Math.sin(h) * 12);
      }
      for (let d = 80; d < route.length - 40; d += 180) {
        const h = route.sample(d, p);
        const c = Math.cos(h), s = Math.sin(h);
        g.lineStyle(2.5, 0xff6ae0, 0.3);
        g.beginPath().moveTo(p.x - c * 8 - s * 8, p.y - s * 8 + c * 8).lineTo(p.x + c * 4, p.y + s * 4).lineTo(p.x - c * 8 + s * 8, p.y - s * 8 - c * 8).strokePath();
      }
    }
    for (const d of this.world.map.drops) {
      g.lineStyle(2, 0xff6ae0, 0.35).strokeCircle(d.x, d.y, 34);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.lineBetween(d.x + Math.cos(a) * 26, d.y + Math.sin(a) * 26, d.x + Math.cos(a) * 34, d.y + Math.sin(a) * 34);
      }
    }
  }

  private drawZones(): void {
    const g = this.scene.add.graphics().setDepth(Depth.terrain);
    for (const z of this.world.map.zones) {
      if (z.kind !== 'blocked') continue;
      const pts = z.poly.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      const shifted = pts.map((p) => new Phaser.Math.Vector2(p.x + 8, p.y + 10));
      if (z.look === 'water') {
        g.fillStyle(0x10181d, 1).fillPoints(pts, true);
        const inner = this.shrink(pts, 0.82);
        g.fillStyle(0x16242c, 1).fillPoints(inner, true);
        g.lineStyle(2, 0x2c4450, 0.8).strokePoints(pts, true);
      } else {
        const base = z.look === 'cliff' ? 0x2b2721 : 0x3a3830;
        const top = z.look === 'cliff' ? 0x38322a : 0x4a473d;
        g.fillStyle(0x000000, 0.45).fillPoints(shifted, true);
        g.fillStyle(base, 1).fillPoints(pts, true);
        g.fillStyle(top, 1).fillPoints(this.shrink(pts, 0.7, -4), true);
        g.lineStyle(2, 0x1a1814, 1).strokePoints(pts, true);
        if (z.look === 'cliff') {
          g.lineStyle(1, 0x1a1814, 0.6);
          const c = this.centroid(pts);
          for (const p of pts) g.lineBetween(p.x, p.y, p.x + (c.x - p.x) * 0.3, p.y + (c.y - p.y) * 0.3);
        }
      }
    }
  }

  private centroid(pts: Phaser.Math.Vector2[]): Phaser.Math.Vector2 {
    const c = new Phaser.Math.Vector2();
    for (const p of pts) c.add(p);
    return c.scale(1 / pts.length);
  }

  private shrink(pts: Phaser.Math.Vector2[], k: number, dy = 0): Phaser.Math.Vector2[] {
    const c = this.centroid(pts);
    return pts.map((p) => new Phaser.Math.Vector2(c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k + dy));
  }

  /** Per-frame: pulse empty cover rings (brighter while placing), breach glow. */
  update(dt: number, placing: boolean): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    for (const { ring, index } of this.coverRings) {
      const occupied = !!this.world.coverOccupiedBy(this.world.map.cover[index]);
      ring.setVisible(!occupied);
      ring.setAlpha(placing ? 0.45 + 0.45 * pulse : 0.18 + 0.12 * pulse);
    }
    this.breach.setAlpha(0.25 + 0.15 * Math.sin(this.t * 2.3));
    // Floodlights hum with a gentle flicker, and now and then stutter.
    this.flicker -= dt;
    const stutter = this.flicker < 0 && this.flicker > -0.18;
    if (this.flicker < -0.18) this.flicker = 4 + Math.random() * 8;
    for (let i = 0; i < this.lamps.length; i++) {
      const base = 0.15 + 0.012 * Math.sin(this.t * 23 + i * 7);
      this.lamps[i].setAlpha(stutter && i === 0 ? base * (Math.random() < 0.5 ? 0.3 : 1) : base);
    }
  }
}
