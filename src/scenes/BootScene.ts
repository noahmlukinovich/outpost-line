import Phaser from 'phaser';
import { queueManifestArt, registerArt, type Manifest } from '../assets/art';
import { generatePlaceholderArt } from '../assets/placeholderArt';

/**
 * Prepares all art: generates the vector placeholders, then loads anything listed in
 * public/assets/manifest.json (sprite packs) on top of them.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.json('manifest', 'assets/manifest.json');
  }

  create(): void {
    generatePlaceholderArt(this);
    this.makeVignette();
    const manifest = this.cache.json.get('manifest') as Manifest | undefined;
    if (manifest) queueManifestArt(this, manifest);
    this.load.once('complete', () => {
      registerArt(this, manifest);
      this.scene.start('Title');
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn(`[art] failed to load ${file.src}`));
    this.load.start();
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
