/**
 * Dev-only art gallery: open http://localhost:5173/gallery.html to see every generated sprite
 * enlarged, with its art ID. Handy when tweaking placeholder art or checking a sprite pack.
 */
import Phaser from 'phaser';
import { addArt } from '../assets/art';
import { generatePlaceholderArt } from '../assets/placeholderArt';

const IDS = [
  'unit.rifle', 'unit.assault', 'unit.marksman', 'unit.heavy', 'unit.loader', 'unit.rocket', 'unit.gatling',
  'unit.sniper', 'unit.spotter', 'unit.antimateriel', 'unit.engineer', 'unit.medic', 'unit.turret',
  'enemy.skitter', 'enemy.warden', 'enemy.ironback', 'bld.depot', 'bld.reactor',
  'cover.sandbags', 'cover.trench', 'cover.ruins', 'cover.bunker', 'prop.gate',
];

class Gallery extends Phaser.Scene {
  create(): void {
    generatePlaceholderArt(this);
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

new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: 6 * 210, height: 4 * 210, backgroundColor: '#2d3127', scene: [Gallery] });
