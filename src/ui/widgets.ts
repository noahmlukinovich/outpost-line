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

/** Anything the UIScene can route taps to. */
export interface Tappable {
  readonly container: Phaser.GameObjects.Container;
  enabled: boolean;
  pressed: boolean;
  onTap: () => void;
  readonly visible: boolean;
  contains(x: number, y: number): boolean;
  redraw(): void;
  setVisible(v: boolean): this;
}

export type ActionState = 'buy' | 'locked' | 'owned' | 'poor';

/**
 * A wide list button: title on the left, cost on the right, a wrapped description below.
 * Used for upgrades, specializations and abilities.
 */
export class ActionButton implements Tappable {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly cost: Phaser.GameObjects.Text;
  private readonly desc: Phaser.GameObjects.Text;
  enabled = true;
  pressed = false;
  state: ActionState = 'buy';
  accent: number = Palette.uiAmber;
  onTap: () => void = () => {};
  h = 60;

  constructor(scene: Phaser.Scene, public w: number) {
    this.bg = scene.add.graphics();
    this.title = text(scene, 12, 9, '', 16, Palette.uiText, '800');
    this.cost = text(scene, w - 12, 9, '', 16, Palette.uiAmber, '800').setOrigin(1, 0);
    this.desc = text(scene, 12, 31, '', 12, Palette.uiDim, '600').setWordWrapWidth(w - 24).setLineSpacing(1);
    this.container = scene.add.container(0, 0, [this.bg, this.title, this.cost, this.desc]);
  }

  get visible(): boolean {
    return this.container.visible && (this.container.parentContainer?.visible ?? true);
  }

  /** Smaller title for narrow columns (tech tree). */
  compact(): this {
    this.title.setFontSize(13).setWordWrapWidth(this.w - 30);
    this.isCompact = true;
    return this;
  }

  private isCompact = false;
  private descY = 31;

  setVisible(v: boolean): this {
    this.container.setVisible(v);
    if (!v) this.pressed = false;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y);
    return this;
  }

  /** Update content; returns the button height (depends on description length). */
  set(title: string, cost: string, desc: string, state: ActionState, accent: number = Palette.uiAmber): number {
    setText(this.title, title);
    setText(this.cost, cost);
    setText(this.desc, desc);
    this.descY = this.isCompact ? 9 + this.title.height + 3 : 31;
    const h = Math.max(54, this.descY + 9 + this.desc.height);
    if (state !== this.state || accent !== this.accent || h !== this.h) {
      this.state = state;
      this.accent = accent;
      this.h = h;
      this.enabled = state === 'buy';
      this.redraw();
    }
    return h;
  }

  contains(x: number, y: number): boolean {
    if (!this.visible) return false;
    const m = this.container.getWorldTransformMatrix();
    const lx = x - m.tx, ly = y - m.ty;
    return lx >= 0 && ly >= 0 && lx <= this.w && ly <= this.h;
  }

  redraw(): void {
    const g = this.bg.clear();
    const dy = this.pressed ? 2 : 0;
    const s = this.state;
    const fill = s === 'buy' ? 0x2c3024 : s === 'owned' ? 0x1f2a22 : 0x1e201b;
    const border = s === 'buy' ? this.accent : s === 'owned' ? 0x7be08a : 0x3a3d34;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(2, 3, this.w, this.h, 8);
    g.fillStyle(fill, 1).fillRoundedRect(0, dy, this.w, this.h, 8);
    g.lineStyle(s === 'buy' ? 2 : 1.5, border, 1).strokeRoundedRect(0, dy, this.w, this.h, 8);
    this.title.setAlpha(s === 'locked' ? 0.55 : 1).setY(9 + dy);
    this.cost.setAlpha(s === 'locked' || s === 'poor' ? 0.55 : 1).setY(9 + dy)
      .setColor(css(s === 'owned' ? 0x7be08a : s === 'poor' ? 0xff8a7a : Palette.uiAmber));
    this.desc.setY(this.descY + dy);
  }
}
