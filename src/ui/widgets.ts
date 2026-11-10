/**
 * Minimal UI kit: buttons and panels drawn with Graphics + Text, sized for fingers (≥ 48pt).
 * The UIScene routes touches to buttons itself, which also lets the battlefield know which
 * screen areas belong to the UI.
 */
import Phaser from 'phaser';
import { DPR } from '../app/display';
import { Palette, css } from '../assets/palette';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function text(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color: number = Palette.uiText, weight = '700'): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: weight, color: css(color), resolution: DPR });
}

/** Only re-render text when it actually changes (Text re-rasterizes on every setText). */
export function setText(t: Phaser.GameObjects.Text, value: string): void {
  if (t.text !== value) t.setText(value);
}

export type ButtonStyle = 'primary' | 'secondary' | 'danger' | 'dark' | 'card';

const STYLES: Record<ButtonStyle, { bg: number; fg: number; border: number }> = {
  primary: { bg: Palette.uiAmber, fg: Palette.uiPanel, border: 0xffd27a },
  secondary: { bg: 0x2a2d26, fg: Palette.uiText, border: 0x4a4d44 },
  danger: { bg: 0x5a2420, fg: 0xffd0c8, border: 0x8a3a30 },
  dark: { bg: 0x1b1d18, fg: Palette.uiText, border: 0x3a3d34 },
  card: { bg: 0x22251f, fg: Palette.uiText, border: 0x4a4d44 },
};

export class Button {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;
  pressed = false;
  active = false;
  onTap: () => void = () => {};

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    public w: number,
    public h: number,
    label: string,
    public style: ButtonStyle = 'secondary',
    sub = '',
    fontSize = 17,
  ) {
    this.bg = scene.add.graphics();
    this.label = text(scene, w / 2, sub ? h / 2 - 9 : h / 2, label, fontSize, STYLES[style].fg, '800').setOrigin(0.5);
    this.sub = text(scene, w / 2, h / 2 + 11, sub, 13, STYLES[style].fg, '600').setOrigin(0.5).setAlpha(0.85);
    this.container = scene.add.container(x, y, [this.bg, this.label, this.sub]);
    this.redraw();
  }

  get visible(): boolean {
    return this.container.visible && (this.container.parentContainer?.visible ?? true);
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v);
    if (!v) this.pressed = false;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y);
    return this;
  }

  setEnabled(e: boolean): this {
    if (e !== this.enabled) {
      this.enabled = e;
      this.redraw();
    }
    return this;
  }

  setActive(a: boolean): this {
    if (a !== this.active) {
      this.active = a;
      this.redraw();
    }
    return this;
  }

  setLabel(label: string, sub?: string): this {
    setText(this.label, label);
    if (sub !== undefined) {
      setText(this.sub, sub);
      this.label.setY(sub ? this.h / 2 - 9 : this.h / 2);
    }
    return this;
  }

  setStyle(style: ButtonStyle): this {
    if (style !== this.style) {
      this.style = style;
      this.label.setColor(css(STYLES[style].fg));
      this.sub.setColor(css(STYLES[style].fg));
      this.redraw();
    }
    return this;
  }

  /** Screen-space hit test (accounts for a parent container offset). */
  contains(x: number, y: number): boolean {
    if (!this.visible) return false;
    const m = this.container.getWorldTransformMatrix();
    const lx = x - m.tx, ly = y - m.ty;
    return lx >= -4 && ly >= -4 && lx <= this.w + 4 && ly <= this.h + 4;
  }

  redraw(): void {
    const s = STYLES[this.style];
    const g = this.bg.clear();
    const dy = this.pressed ? 2 : 0;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(2, 4, this.w, this.h, 9);
    g.fillStyle(s.bg, this.enabled ? 1 : 0.45).fillRoundedRect(0, dy, this.w, this.h, 9);
    g.lineStyle(this.active ? 3 : 1.5, this.active ? Palette.fdcAccent : s.border, this.enabled ? 1 : 0.4).strokeRoundedRect(0, dy, this.w, this.h, 9);
    this.label.setAlpha(this.enabled ? 1 : 0.5);
    this.label.y = (this.sub.text ? this.h / 2 - 9 : this.h / 2) + dy;
    this.sub.y = this.h / 2 + 11 + dy;
  }
}

/** A dark rounded panel background. */
export function panelBg(scene: Phaser.Scene, w: number, h: number, alpha = 0.92): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(3, 5, w, h, 12);
  g.fillStyle(Palette.uiPanel, alpha).fillRoundedRect(0, 0, w, h, 12);
  g.lineStyle(1.5, 0x3a3d34, 1).strokeRoundedRect(0, 0, w, h, 12);
  return g;
}
