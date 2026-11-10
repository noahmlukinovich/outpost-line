/**
 * Dev-only art gallery: open http://localhost:5173/gallery.html to see every generated sprite
 * enlarged, with its art ID. Handy when tweaking placeholder art or checking a sprite pack.
 */
import Phaser from 'phaser';
import { addArt } from '../assets/art';
import { generatePlaceholderArt } from '../assets/placeholderArt';
import { SoldierLooks, WEAPON_POINTS, weaponOf } from '../assets/soldiers';
import { WEAPON_FX } from '../render/weaponFx';
import { FLASH_ORIGIN } from '../assets/fxArt';

const IDS = [
  'hero.kastellan', 'hero.okonjo', 'hero.venn', 'unit.rifle', 'unit.assault', 'unit.marksman', 'unit.heavy', 'unit.loader', 'unit.rocket', 'unit.gatling',
  'unit.sniper', 'unit.spotter', 'unit.antimateriel', 'unit.engineer', 'unit.medic', 'unit.turret',
  'enemy.skitter', 'enemy.warden', 'enemy.ironback', 'enemy.veilstalker', 'enemy.skyray', 'enemy.tender', 'enemy.broodbarge', 'enemy.colossus', 'bld.sensor', 'veh.car.hull', 'veh.car.turret', 'veh.tank.hull', 'veh.tank.turret', 'veh.walker.hull', 'veh.walker.turret', 'fx.pod', 'bld.depot', 'bld.reactor',
  'cover.sandbags', 'cover.trench', 'cover.ruins', 'cover.bunker', 'prop.gate',
];

class Gallery extends Phaser.Scene {
  /** ?mode=weapons: every soldier frozen mid-shot (flash, tracer, casing) to check placement. */
  weapons(): void {
    const ids = Object.keys(SoldierLooks);
    const z = 4, cols = 3, cw = 420, ch = 150;
    ids.forEach((id, i) => {
      const cx = (i % cols) * cw + 70, cy = Math.floor(i / cols) * ch + 70;
      const img = addArt(this, id, cx, cy);
      img.setScale(img.scale * z);
      const kind = weaponOf(id);
      const pts = WEAPON_POINTS[kind], fx = WEAPON_FX[kind];
      const mx = cx + (pts.muzzle[0] - 12) * z, my = cy + (pts.muzzle[1] - 14) * z;
      const tex = fx.flash[0];
      const o = FLASH_ORIGIN[tex] ?? 0;
      const w = this.textures.get(tex).getSourceImage().width * (1 - o);
      this.add.image(mx, my, 'fx.light').setDisplaySize(fx.glow * z * 0.5, fx.glow * z * 0.5).setTint(fx.glowColor).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);
      this.add.image(mx, my, tex).setOrigin(o, 0.5).setScale((fx.flashLen * z) / w).setTint(fx.flashTint).setBlendMode(Phaser.BlendModes.ADD);
      if (fx.tracerLen) this.add.image(mx + fx.flashLen * z + 60, my, 'fx.tracer2').setOrigin(1, 0.5).setScale((fx.tracerLen * z * 0.5) / 128, (fx.tracerWidth * 2 * z * 0.5) / 8).setTint(fx.tracerColor).setBlendMode(Phaser.BlendModes.ADD);
      const ex = cx + (pts.eject[0] - 12) * z, ey = cy + (pts.eject[1] - 14) * z;
      if (fx.casing) this.add.image(ex + 10, ey + 26, fx.casing === 'big' ? 'fx.casing.big' : fx.casing === 'shell' ? 'fx.casing.shell' : 'fx.casing').setScale((z / 3) * 0.55).setRotation(0.7);
      this.add.text(cx - 40, cy + 50, id, { fontSize: '13px', color: '#e8dcc0' });
    });
  }

  create(): void {
    generatePlaceholderArt(this);
    if (new URLSearchParams(location.search).get('mode') === 'weapons') return this.weapons();
    const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3);
    const cols = 6, cell = 70 * zoom;
    IDS.forEach((id, i) => {
      const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2;
      const img = addArt(this, id, x, y);
      img.setScale(img.scale * zoom);
      this.add.text(x, y + cell / 2 - 18, id, { fontSize: '14px', color: '#e8dcc0' }).setOrigin(0.5);
    });
  }
}

new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: 6 * 210, height: 6 * 210, backgroundColor: '#2d3127', scene: [Gallery] });
