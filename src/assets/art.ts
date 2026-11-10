/**
 * Art registry: turns an art ID ("enemy.skitter") into something Phaser can draw.
 *
 * public/assets/manifest.json decides where each ID's art comes from:
 *   - not listed, or { "type": "generated" }  → built-in vector placeholder
 *   - { "type": "image", "url": "packs/x/alien.png", "scale": 0.5, "rotation": 90 }
 *   - { "type": "atlas", "atlas": "kenney", "frame": "alien_03.png", "scale": 0.5, "rotation": 90 }
 *     with "atlases": { "kenney": { "image": "packs/kenney/sheet.png", "json": "packs/kenney/sheet.json" } }
 *
 * `rotation` (degrees) fixes sprites drawn facing up/down instead of right.
 * `scale` sizes the sprite so it matches the placeholder (unit sprites are ~24 world units wide).
 * If a file fails to load, the placeholder is used instead, so the game never breaks.
 */
import Phaser from 'phaser';
import { ART_SCALE } from './placeholderArt';

export interface ArtEntry {
  type: 'generated' | 'image' | 'atlas';
  url?: string;
  atlas?: string;
  frame?: string;
  scale?: number;
  rotation?: number;
}

export interface Manifest {
  art: Record<string, ArtEntry>;
  atlases?: Record<string, { image: string; json: string }>;
}

export interface ArtRef {
  key: string;
  frame?: string;
  scale: number;
  /** Radians to add to the sprite's rotation. */
  rotation: number;
}

const refs = new Map<string, ArtRef>();

/** Queue manifest files for loading. Call in a scene's preload after the manifest JSON is loaded. */
export function queueManifestArt(scene: Phaser.Scene, manifest: Manifest): void {
  for (const [name, a] of Object.entries(manifest.atlases ?? {})) {
    scene.load.atlas(`atlas:${name}`, `assets/${a.image}`, `assets/${a.json}`);
  }
  for (const [id, e] of Object.entries(manifest.art)) {
    if (e.type === 'image' && e.url) scene.load.image(`art:${id}`, `assets/${e.url}`);
  }
}

/** Build the lookup table once loading is done. Placeholders must already be generated. */
export function registerArt(scene: Phaser.Scene, manifest: Manifest | undefined): void {
  refs.clear();
  for (const [id, e] of Object.entries(manifest?.art ?? {})) {
    const rotation = Phaser.Math.DegToRad(e.rotation ?? 0);
    if (e.type === 'image' && scene.textures.exists(`art:${id}`)) {
      refs.set(id, { key: `art:${id}`, scale: e.scale ?? 1, rotation });
    } else if (e.type === 'atlas' && e.atlas && e.frame) {
      const key = `atlas:${e.atlas}`;
      if (scene.textures.exists(key) && scene.textures.get(key).has(e.frame)) {
        refs.set(id, { key, frame: e.frame, scale: e.scale ?? 1, rotation });
      } else console.warn(`[art] ${id}: frame "${e.frame}" not found in atlas "${e.atlas}", using placeholder`);
    } else if (e.type !== 'generated') {
      console.warn(`[art] ${id}: could not load, using placeholder`);
    }
  }
}

/** Look up how to draw an art ID. Falls back to the generated placeholder texture of the same name. */
export function art(id: string): ArtRef {
  let r = refs.get(id);
  if (!r) {
    r = { key: id, scale: ART_SCALE, rotation: 0 };
    refs.set(id, r);
  }
  return r;
}

/** Create an image for an art ID with the right texture, frame and scale applied. */
export function addArt(scene: Phaser.Scene, id: string, x = 0, y = 0): Phaser.GameObjects.Image {
  const r = art(id);
  return scene.add.image(x, y, r.key, r.frame).setScale(r.scale);
}
