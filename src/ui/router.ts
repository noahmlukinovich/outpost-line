/**
 * Routes taps to a list of buttons in a scene (press visuals, tap-on-release, disabled buzz).
 * The HUD has its own copy of this logic; menus/screens use this helper.
 */
import Phaser from 'phaser';
import { DPR } from '../app/display';
import { sfx } from '../audio/Sfx';
import type { Tappable } from './widgets';

export class TapRouter {
  private pressed = new Map<number, Tappable>();
  buttons: Tappable[] = [];
  /** Optional filter: when it returns a list, only those buttons are live (modals). */
  only: (() => Tappable[] | null) | null = null;

  constructor(scene: Phaser.Scene) {
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      const x = p.x / DPR, y = p.y / DPR;
      const list = this.only?.() ?? this.buttons;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (!b.contains(x, y)) continue;
        b.pressed = true;
        b.redraw();
        this.pressed.set(p.id, b);
        return;
      }
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const b = this.pressed.get(p.id);
      this.pressed.delete(p.id);
      if (!b) return;
      b.pressed = false;
      b.redraw();
      if (!b.contains(p.x / DPR, p.y / DPR) || !b.visible) return;
      if (!b.enabled) {
        sfx.error();
        return;
      }
      sfx.click();
      b.onTap();
    });
  }

  add<T extends Tappable>(b: T): T {
    this.buttons.push(b);
    return b;
  }
}
