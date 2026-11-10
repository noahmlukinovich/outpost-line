import Phaser from 'phaser';
import { generatePlaceholderArt } from '../assets/placeholderArt';

/** Prepares textures (placeholder art now; manifest-driven sprite packs from M1) then starts the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generatePlaceholderArt(this);
    this.makeVignette();
    this.scene.start('Title');
  }

  private makeVignette(): void {
    const size = 256;
    const tex = this.textures.createCanvas('fx.vignette', size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
}
