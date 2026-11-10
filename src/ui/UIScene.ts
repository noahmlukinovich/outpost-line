/**
 * The HUD, drawn on top of the battle in CSS-pixel coordinates.
 *
 * It reads game state every frame (supplies, wave, selection…) and sends commands to the
 * GameScene / World. All touches on UI are handled here; the battlefield ignores them.
 */
import Phaser from 'phaser';
import { DPR, fitCamera, logicalSize, safeAreaInsets } from '../app/display';
import { addArt } from '../assets/art';
import { Palette, css } from '../assets/palette';
import { sfx } from '../audio/Sfx';
import { getCover } from '../data/cover';
import { getEnemy } from '../data/enemies';
import type { TargetMode, UnitDef } from '../data/types';
import { getUnit } from '../data/units';
import type { UiHitTester } from '../input/types';
import { save } from '../save/SaveSystem';
import type { Squad } from '../sim/entities';
import { HUD, type GameScene } from '../scenes/GameScene';
import { Button, panelBg, setText, text } from './widgets';

interface CardDrag {
  pointerId: number;
  unitId: string;
  startX: number;
  startY: number;
  dragging: boolean;
}

const TARGET_LABEL: Record<TargetMode, string> = { first: 'First', strongest: 'Strongest', weakest: 'Weakest', closest: 'Closest' };
const ROMAN = ['I', 'II', 'III'];

export class UIScene extends Phaser.Scene implements UiHitTester {
  private gs!: GameScene;
  private W = 0;
  private H = 0;
  private inset = { top: 0, right: 0, bottom: 0, left: 0 };
  private buttons: Button[] = [];
  private pressed = new Map<number, Button>();
  private rects: { r: Phaser.Geom.Rectangle; visible: () => boolean }[] = [];
  private modal: 'none' | 'menu' | 'end' = 'none';

  // HUD
  private suppliesText!: Phaser.GameObjects.Text;
  private integrityText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private speedBtn!: Button;
  private pauseBtn!: Button;
  private pausedBanner!: Phaser.GameObjects.Text;
  private damageOverlay!: Phaser.GameObjects.Image;
  private damageFlash = 0;
  private lastIntegrity = 0;

  // Build bar
  private cards: { btn: Button; def: UnitDef }[] = [];
  private cardDrag: CardDrag | null = null;

  // Placement
  private okBtn!: Button;
  private cancelBtn!: Button;
  private reasonText!: Phaser.GameObjects.Text;

  // Wave
  private waveBtn!: Button;
  private waveBar!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Container;
  private previewBody!: Phaser.GameObjects.Container;
  private previewBg!: Phaser.GameObjects.Graphics;
  private previewTitle!: Phaser.GameObjects.Text;
  private previewFor = -1;
  private previewTimer = 0;
  private previewRect = new Phaser.Geom.Rectangle();

  // Squad panel
  private panel!: Phaser.GameObjects.Container;
  private panelRect = new Phaser.Geom.Rectangle();
  private panelTitle!: Phaser.GameObjects.Text;
  private panelInfo!: Phaser.GameObjects.Text;
  private upgradeBtn!: Button;
  private targetBtn!: Button;
  private sellBtn!: Button;
  private closeBtn!: Button;
  private panelSide: 'left' | 'right' = 'right';
  private sellArmed = 0;

  // Toast
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer = 0;

  // Menu / end
  private menu!: Phaser.GameObjects.Container;
  private menuButtons: Button[] = [];
  private toggles: { btn: Button; key: 'damageNumbers' | 'screenShake' | 'sound'; label: string }[] = [];
  private end!: Phaser.GameObjects.Container;
  private endButtons: Button[] = [];
  private endTitle!: Phaser.GameObjects.Text;
  private endInfo!: Phaser.GameObjects.Text;
  private endStars!: Phaser.GameObjects.Graphics;
  private dim!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('UI');
  }

  create(data: { gs: GameScene }): void {
    this.gs = data.gs;
    fitCamera(this.cameras.main);
    ({ width: this.W, height: this.H } = logicalSize(this.game));
    this.inset = safeAreaInsets();
    this.buttons = [];
    this.rects = [];
    this.cards = [];
    this.pressed.clear();
    this.modal = 'none';
    this.previewFor = -1;
    this.lastIntegrity = this.gs.world.integrity;

    this.damageOverlay = this.add.image(0, 0, 'fx.vignette').setOrigin(0).setDisplaySize(this.W, this.H).setTint(0xff2020).setAlpha(0);
    this.buildTopBar();
    this.buildBuildBar();
    this.buildPlacement();
    this.buildWave();
    this.buildSquadPanel();
    this.toastText = text(this, this.W / 2, HUD.top + 30, '', 20, Palette.uiText, '800').setOrigin(0.5).setAlpha(0)
      .setShadow(0, 2, '#000', 6, false, true);
    this.pausedBanner = text(this, this.W / 2, this.H / 2 - 40, 'PAUSED', 44, Palette.uiAmber, '900').setOrigin(0.5)
      .setShadow(0, 3, '#000', 10, false, true).setLetterSpacing(8).setVisible(false);
    this.buildMenu();
    this.buildEnd();

    this.gs.controller.onChange = () => this.onSelectionChange();
    this.gs.view.onIntegrityHit = () => (this.damageFlash = 1);
    const w = this.gs.world;
    const prevCleared = w.events.waveCleared?.bind(w.events);
    w.events.waveCleared = (i, bonus) => {
      prevCleared?.(i, bonus);
      if (bonus > 0) this.toast(`Wave ${i + 1} cleared  +${bonus} supplies`);
    };
    const prevStart = w.events.waveStarted?.bind(w.events);
    w.events.waveStarted = (i, bonus) => {
      prevStart?.(i, bonus);
      this.toast(bonus > 0 ? `Wave ${i + 1} called early  +${bonus}` : `Wave ${i + 1} incoming`);
      this.hidePreview();
    };

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    if (w.state === 'prep') this.showPreview(0, 0);
    this.onSelectionChange();
  }

  private onResize(): void {
    // Rebuild the HUD at the new size; game state lives in the GameScene, so nothing is lost.
    this.scene.restart({ gs: this.gs });
  }

  // ================================================================== layout

  private addButton(b: Button): Button {
    this.buttons.push(b);
    return b;
  }

  private buildTopBar(): void {
    const x = 12 + this.inset.left, y = 10 + this.inset.top;
    const bg = panelBg(this, 380, 46, 0.85);
    bg.setPosition(x, y);
    this.rects.push({ r: new Phaser.Geom.Rectangle(x, y, 380, 46), visible: () => true });
    addArt(this, 'icon.supplies', x + 22, y + 23);
    this.suppliesText = text(this, x + 38, y + 23, '', 22, Palette.uiAmber, '800').setOrigin(0, 0.5);
    addArt(this, 'icon.integrity', x + 140, y + 23);
    this.integrityText = text(this, x + 156, y + 23, '', 22, Palette.fdcAccent, '800').setOrigin(0, 0.5);
    addArt(this, 'icon.wave', x + 248, y + 23);
    this.waveText = text(this, x + 264, y + 23, '', 20, Palette.uiText, '800').setOrigin(0, 0.5);

    const bw = 58, bh = 46, gap = 8;
    let rx = this.W - 12 - this.inset.right - bw;
    const menuBtn = this.addButton(new Button(this, rx, y, bw, bh, '☰', 'dark', '', 22));
    menuBtn.onTap = () => this.openMenu();
    rx -= bw + gap;
    this.speedBtn = this.addButton(new Button(this, rx, y, bw, bh, '1×', 'dark', '', 19));
    this.speedBtn.onTap = () => {
      this.gs.speed = this.gs.speed === 1 ? 2 : 1;
      if (this.gs.paused) this.gs.paused = false;
    };
    rx -= bw + gap;
    this.pauseBtn = this.addButton(new Button(this, rx, y, bw, bh, '❚❚', 'dark', '', 17));
    this.pauseBtn.onTap = () => (this.gs.paused = !this.gs.paused);
  }

  private buildBuildBar(): void {
    const w = this.gs.world;
    const cw = 186, ch = 74, gap = 10;
    const y = this.H - ch - 12 - this.inset.bottom;
    let x = 12 + this.inset.left;
    for (const def of w.buildable) {
      const btn = this.addButton(new Button(this, x, y, cw, ch, def.name, 'card', '', 16));
      const icon = addArt(this, def.leadArt ?? def.art, 30, ch / 2).setScale(1.1).setRotation(-Math.PI / 2);
      const cost = text(this, 56, ch / 2 + 13, '', 16, Palette.uiAmber, '800').setOrigin(0, 0.5);
      btn.container.add([icon, cost]);
      btn.label.setOrigin(0, 0.5).setPosition(56, ch / 2 - 12);
      btn.label.setFontSize(15);
      setText(cost, `⛁ ${def.tiers[0].cost}`);
      // Card labels don't use the default centered layout, so keep them put on redraw.
      const redraw = btn.redraw.bind(btn);
      btn.redraw = () => {
        redraw();
        btn.label.setPosition(56, ch / 2 - 12 + (btn.pressed ? 2 : 0));
      };
      btn.redraw();
      this.cards.push({ btn, def });
      x += cw + gap;
    }
  }

  private buildPlacement(): void {
    this.okBtn = this.addButton(new Button(this, 0, 0, 60, 56, '✔', 'primary', '', 26)).setVisible(false);
    this.okBtn.onTap = () => {
      if (this.gs.controller.confirmPlacement()) this.cardDrag = null;
      else this.toast(this.gs.controller.ghost?.check.reason || 'Cannot place here');
    };
    this.cancelBtn = this.addButton(new Button(this, 0, 0, 60, 56, '✖', 'danger', '', 22)).setVisible(false);
    this.cancelBtn.onTap = () => this.gs.controller.cancelPlacement();
    this.reasonText = text(this, 0, 0, '', 15, 0xffb0a0, '700').setOrigin(0.5, 1).setShadow(0, 2, '#000', 4, false, true);
  }

  private buildWave(): void {
    this.waveBtn = this.addButton(new Button(this, 0, 0, 150, 58, 'START', 'primary', '', 18));
    this.waveBtn.onTap = () => this.onWaveTap();
    this.waveBar = this.add.graphics();

    this.preview = this.add.container(0, 0).setVisible(false);
    this.previewBg = this.add.graphics();
    this.previewTitle = text(this, 14, 12, '', 15, Palette.uiAmber, '800');
    this.previewBody = this.add.container(0, 0);
    this.preview.add([this.previewBg, this.previewTitle, this.previewBody]);
    this.rects.push({ r: this.previewRect, visible: () => this.preview.visible });
  }

  private buildSquadPanel(): void {
    const pw = 286, ph = 318;
    this.panel = this.add.container(0, 0).setVisible(false);
    const bg = panelBg(this, pw, ph);
    this.panelTitle = text(this, 16, 16, '', 19, Palette.uiAmber, '900');
    this.panelInfo = text(this, 16, 48, '', 14, Palette.uiText, '600').setLineSpacing(5);
    this.closeBtn = this.addButton(new Button(this, pw - 52, 8, 44, 40, '✕', 'dark', '', 17));
    this.closeBtn.onTap = () => this.gs.controller.select(null);
    this.upgradeBtn = this.addButton(new Button(this, 14, 158, pw - 28, 62, 'UPGRADE', 'primary', '', 17));
    this.upgradeBtn.onTap = () => this.onUpgrade();
    this.targetBtn = this.addButton(new Button(this, 14, 232, (pw - 38) / 2, 66, 'TARGET', 'secondary', 'First', 15));
    this.targetBtn.onTap = () => {
      const s = this.gs.controller.selected;
      if (s) {
        this.gs.world.cycleTargetMode(s);
        sfx.click();
      }
    };
    this.sellBtn = this.addButton(new Button(this, 24 + (pw - 38) / 2, 232, (pw - 38) / 2, 66, 'SELL', 'danger', '', 15));
    this.sellBtn.onTap = () => this.onSell();
    this.panel.add([bg, this.panelTitle, this.panelInfo, this.closeBtn.container, this.upgradeBtn.container, this.targetBtn.container, this.sellBtn.container]);
    this.panelRect.setSize(pw, ph);
    this.rects.push({ r: this.panelRect, visible: () => this.panel.visible });
  }

  private buildMenu(): void {
    this.dim = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.6).setOrigin(0).setVisible(false);
    const pw = 340, ph = 420;
    this.menu = this.add.container((this.W - pw) / 2, (this.H - ph) / 2).setVisible(false);
    const bg = panelBg(this, pw, ph, 0.97);
    const title = text(this, pw / 2, 32, 'COMMAND MENU', 20, Palette.uiAmber, '900').setOrigin(0.5).setLetterSpacing(3);
    this.menu.add([bg, title]);
    let y = 64;
    const mk = (label: string, style: 'primary' | 'secondary' | 'danger', fn: () => void) => {
      const b = new Button(this, 20, y, pw - 40, 50, label, style, '', 16);
      b.onTap = fn;
      this.menu.add(b.container);
      this.menuButtons.push(b);
      y += 58;
      return b;
    };
    const toggle = (key: 'damageNumbers' | 'screenShake' | 'sound', label: string) => {
      const b = mk(label, 'secondary', () => {
        save.setSetting(key, !save.settings[key]);
        this.gs.applySettings();
        this.refreshToggles();
      });
      this.toggles.push({ btn: b, key, label });
    };
    toggle('damageNumbers', 'Damage numbers');
    toggle('screenShake', 'Screen shake');
    toggle('sound', 'Sound');
    mk('Restart mission', 'danger', () => this.gs.restart());
    mk('Quit to title', 'danger', () => this.gs.quit());
    mk('Resume', 'primary', () => this.closeMenu());
    this.refreshToggles();
  }

  private refreshToggles(): void {
    for (const t of this.toggles) t.btn.setLabel(`${t.label}:  ${save.settings[t.key] ? 'ON' : 'OFF'}`);
  }

  private buildEnd(): void {
    const pw = 380, ph = 300;
    this.end = this.add.container((this.W - pw) / 2, (this.H - ph) / 2).setVisible(false);
    const bg = panelBg(this, pw, ph, 0.97);
    this.endTitle = text(this, pw / 2, 40, '', 28, Palette.uiAmber, '900').setOrigin(0.5).setLetterSpacing(4);
    this.endStars = this.add.graphics();
    this.endInfo = text(this, pw / 2, 160, '', 16, Palette.uiText, '600').setOrigin(0.5).setAlign('center');
    const retry = new Button(this, 20, ph - 76, (pw - 52) / 2, 56, 'RETRY', 'secondary', '', 17);
    retry.onTap = () => this.gs.restart();
    const quit = new Button(this, 32 + (pw - 52) / 2, ph - 76, (pw - 52) / 2, 56, 'TITLE', 'primary', '', 17);
    quit.onTap = () => this.gs.quit();
    this.endButtons = [retry, quit];
    this.end.add([bg, this.endTitle, this.endStars, this.endInfo, retry.container, quit.container]);
  }

  // ================================================================== modals

  private openMenu(): void {
    this.modal = 'menu';
    this.gs.paused = true;
    this.gs.router.reset();
    this.dim.setVisible(true);
    this.menu.setVisible(true);
    this.refreshToggles();
  }

  private closeMenu(): void {
    this.modal = 'none';
    this.gs.paused = false;
    this.dim.setVisible(false);
    this.menu.setVisible(false);
  }

  private showEnd(): void {
    const w = this.gs.world;
    this.modal = 'end';
    this.dim.setVisible(true);
    this.menu.setVisible(false);
    this.end.setVisible(true);
    const won = w.state === 'won';
    this.endTitle.setText(won ? 'OUTPOST HELD' : 'OUTPOST LOST').setColor(css(won ? Palette.uiAmber : 0xff6a5a));
    this.endInfo.setText(
      won
        ? `Integrity ${w.integrity}/${w.maxIntegrity}\nBest: ${Math.max(w.stars, save.mission(w.mission.id)?.stars ?? 0)}★`
        : `Survived ${Math.max(0, w.wavesStarted - 1)} of ${w.totalWaves} waves\nThe Choir broke through.`,
    );
    const g = this.endStars.clear();
    const stars = w.stars;
    for (let i = 0; i < 3; i++) {
      const cx = 380 / 2 + (i - 1) * 64, cy = 100;
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 26 : 11;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      g.fillStyle(i < stars ? Palette.uiAmber : 0x3a3d34, 1).fillPoints(pts, true);
      g.lineStyle(2, 0x000000, 0.5).strokePoints(pts, true);
    }
  }

  // ================================================================== input

  hitTest(x: number, y: number): boolean {
    if (this.modal !== 'none') return true;
    for (const b of this.buttons) if (b.contains(x, y)) return true;
    for (const r of this.rects) if (r.visible() && r.r.contains(x, y)) return true;
    return false;
  }

  private activeButtons(): Button[] {
    if (this.modal === 'menu') return this.menuButtons;
    if (this.modal === 'end') return this.endButtons;
    return this.buttons;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    const x = p.x / DPR, y = p.y / DPR;
    if (this.modal === 'none' && this.preview.visible && this.previewRect.contains(x, y)) {
      this.hidePreview();
      return;
    }
    const list = this.activeButtons();
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (!b.contains(x, y)) continue;
      const card = this.cards.find((c) => c.btn === b);
      if (card) {
        this.cardDrag = { pointerId: p.id, unitId: card.def.id, startX: x, startY: y, dragging: false };
      }
      b.pressed = true;
      b.redraw();
      this.pressed.set(p.id, b);
      return;
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.cardDrag;
    if (!d || d.pointerId !== p.id || !p.isDown) return;
    const x = p.x / DPR, y = p.y / DPR;
    if (!d.dragging && Math.hypot(x - d.startX, y - d.startY) > 12) {
      if (!this.canAfford(d.unitId)) return;
      d.dragging = true;
      const b = this.pressed.get(p.id);
      if (b) {
        b.pressed = false;
        b.redraw();
        this.pressed.delete(p.id);
      }
      if (this.gs.controller.ghost?.unitId !== d.unitId) this.gs.beginPlacementAtViewCenter(d.unitId);
    }
    // The ghost floats above the finger so you can see where it's going.
    if (d.dragging) this.gs.moveGhostToScreen(x, y - 64);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const x = p.x / DPR, y = p.y / DPR;
    const d = this.cardDrag;
    if (d && d.pointerId === p.id && d.dragging) {
      this.cardDrag = null;
      // Dropped back onto the build bar → cancel.
      if (y > this.H - HUD.bottom) this.gs.controller.cancelPlacement();
      return;
    }
    const b = this.pressed.get(p.id);
    this.pressed.delete(p.id);
    if (!b) return;
    b.pressed = false;
    b.redraw();
    if (d && d.pointerId === p.id) {
      this.cardDrag = null;
      this.onCardTap(d.unitId);
      return;
    }
    if (b.contains(x, y) && b.visible) {
      if (!b.enabled) {
        sfx.error();
        return;
      }
      sfx.click();
      b.onTap();
    }
  }

  // ================================================================== actions

  private canAfford(unitId: string): boolean {
    const cost = getUnit(unitId).tiers[0].cost;
    if (this.gs.world.supplies >= cost) return true;
    this.toast(`Need ⛁ ${cost} supplies`);
    sfx.error();
    return false;
  }

  private onCardTap(unitId: string): void {
    const c = this.gs.controller;
    if (c.ghost?.unitId === unitId) {
      c.cancelPlacement();
      return;
    }
    if (!this.canAfford(unitId)) return;
    sfx.click();
    this.gs.beginPlacementAtViewCenter(unitId);
  }

  private onUpgrade(): void {
    const s = this.gs.controller.selected;
    if (!s) return;
    const cost = this.gs.world.upgradeCost(s);
    if (cost === null) return;
    if (!this.gs.world.upgrade(s)) {
      this.toast(`Need ⛁ ${cost} supplies`);
      sfx.error();
    }
  }

  private onSell(): void {
    const s = this.gs.controller.selected;
    if (!s) return;
    // Two taps to sell, so a stray finger can't sell a veteran squad.
    if (this.sellArmed <= 0) {
      this.sellArmed = 2.5;
      return;
    }
    this.sellArmed = 0;
    this.gs.world.sell(s);
    this.gs.controller.select(null);
  }

  private onWaveTap(): void {
    const w = this.gs.world;
    if (!w.canCallWave) return;
    const next = w.wavesStarted;
    if (w.state === 'prep' || (this.preview.visible && this.previewFor === next)) {
      w.callWave();
      this.hidePreview();
    } else {
      this.showPreview(next, 5);
    }
  }

  private showPreview(waveIndex: number, seconds: number): void {
    const w = this.gs.world;
    if (waveIndex >= w.totalWaves) return;
    this.previewFor = waveIndex;
    this.previewTimer = seconds; // 0 = stay open
    this.previewBody.removeAll(true);
    const counts = new Map<string, number>();
    for (const g of w.mission.waves[waveIndex].groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
    const pw = 320;
    let y = 40;
    for (const [id, n] of counts) {
      const def = getEnemy(id);
      const icon = addArt(this, def.art, 30, y + 20);
      icon.setScale(icon.scale * Math.min(1.3, 26 / (def.radius * 2)) * 1.4);
      const name = text(this, 58, y + 4, `${n}× ${def.name}`, 16, Palette.uiText, '800');
      const hint = text(this, 58, y + 25, def.hint, 12, Palette.uiDim, '600').setWordWrapWidth(pw - 72);
      this.previewBody.add([icon, name, hint]);
      y += 32 + hint.height;
    }
    setText(this.previewTitle, `WAVE ${waveIndex + 1} INTEL`);
    const ph = y + 12;
    this.previewBg.clear();
    const bg = panelBg(this, pw, ph, 0.94);
    this.previewBg.destroy();
    this.previewBg = bg;
    this.preview.addAt(bg, 0);
    this.preview.setSize(pw, ph);
    this.previewRect.setSize(pw, ph);
    this.preview.setVisible(true);
  }

  private hidePreview(): void {
    this.preview.setVisible(false);
    this.previewFor = -1;
  }

  toast(message: string): void {
    setText(this.toastText, message);
    this.toastTimer = 2.2;
  }

  private onSelectionChange(): void {
    this.sellArmed = 0;
    const s = this.gs.controller.selected;
    this.panel.setVisible(!!s && this.modal === 'none');
    if (s) {
      const p = this.gs.rig.worldToScreen(s.x, s.y);
      this.panelSide = p.x / DPR > this.W * 0.55 ? 'left' : 'right';
      this.updatePanel(0);
    }
  }

  // ================================================================== per-frame

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const gs = this.gs;
    const w = gs.world;

    // Top bar
    setText(this.suppliesText, `${Math.floor(w.supplies)}`);
    setText(this.integrityText, `${w.integrity}/${w.maxIntegrity}`);
    setText(this.waveText, `WAVE ${Math.max(1, w.wavesStarted)}/${w.totalWaves}`);
    this.speedBtn.setLabel(`${gs.speed}×`).setActive(gs.speed > 1);
    this.pauseBtn.setLabel(gs.paused ? '▶' : '❚❚').setActive(gs.paused);
    this.pausedBanner.setVisible(gs.paused && this.modal === 'none');
    if (w.integrity < this.lastIntegrity) this.damageFlash = 1;
    this.lastIntegrity = w.integrity;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    this.damageOverlay.setAlpha(this.damageFlash * 0.8);
    this.integrityText.setColor(this.damageFlash > 0.3 ? '#ff6a5a' : css(Palette.fdcAccent));

    // Cards
    const ghost = gs.controller.ghost;
    for (const c of this.cards) {
      c.btn.setEnabled(w.supplies >= c.def.tiers[0].cost && !w.isOver);
      c.btn.setActive(ghost?.unitId === c.def.id);
    }

    this.updatePlacementUi();
    this.updateWaveUi(dt);
    this.updatePanel(dt);

    // Toast
    this.toastTimer -= dt;
    this.toastText.setAlpha(Phaser.Math.Clamp(this.toastTimer * 2, 0, 1));

    if (w.isOver && this.modal !== 'end') this.showEnd();
  }

  private updatePlacementUi(): void {
    const gh = this.gs.controller.ghost;
    const show = !!gh && this.modal === 'none' && !this.cardDrag?.dragging;
    this.okBtn.setVisible(show);
    this.cancelBtn.setVisible(show);
    this.reasonText.setVisible(!!gh && !gh.check.ok);
    if (!gh) return;
    const p = this.gs.rig.worldToScreen(gh.check.x, gh.check.y);
    const sx = p.x / DPR, sy = p.y / DPR;
    // Buttons sit beside the ghost, flipped to whichever side has room.
    const right = sx < this.W - 170;
    const bx = right ? sx + 46 : sx - 46 - 60;
    const by = Phaser.Math.Clamp(sy - 60, HUD.top + 8, this.H - HUD.bottom - 130);
    this.okBtn.setPosition(bx, by).setEnabled(gh.check.ok);
    this.cancelBtn.setPosition(bx, by + 66);
    setText(this.reasonText, gh.check.reason);
    this.reasonText.setPosition(sx, sy - 44);
  }

  private updateWaveUi(dt: number): void {
    const gs = this.gs, w = gs.world;
    const can = w.canCallWave && this.modal === 'none';
    this.waveBtn.setVisible(can);
    this.waveBar.clear();
    if (this.preview.visible && this.previewTimer > 0) {
      this.previewTimer -= dt;
      if (this.previewTimer <= 0 && w.state !== 'prep') this.hidePreview();
    }
    if (!can) {
      this.hidePreview();
      return;
    }
    // Anchor near the enemy breach (start of the road), clamped on screen.
    const start = w.map.paths[0].points[0];
    const second = w.map.paths[0].points[1];
    const ax = Phaser.Math.Clamp(start.x, 60, w.map.width - 60) + (second.x - start.x) * 0.05;
    const ay = Phaser.Math.Clamp(start.y, 60, w.map.height - 60);
    const p = gs.rig.worldToScreen(ax, ay);
    const bw = this.waveBtn.w, bh = this.waveBtn.h;
    const panelRight = this.panel.visible && this.panelSide === 'right';
    const maxX = this.W - bw - 12 - this.inset.right - (panelRight ? 300 : 0);
    const x = Phaser.Math.Clamp(p.x / DPR - bw / 2, 12 + this.inset.left, maxX);
    const y = Phaser.Math.Clamp(p.y / DPR + 30, HUD.top + 8, this.H - HUD.bottom - bh - 10);
    this.waveBtn.setPosition(x, y);
    const next = w.wavesStarted + 1;
    if (w.state === 'prep') {
      this.waveBtn.setLabel(`START WAVE ${next}`, 'tap when ready');
    } else {
      const armed = this.preview.visible && this.previewFor === w.wavesStarted;
      this.waveBtn.setLabel(armed ? `CALL NOW` : `WAVE ${next} ▸`, armed ? `+${w.callEarlyBonus} supplies` : `${Math.ceil(w.countdown)}s · tap for intel`);
      // Countdown bar under the button.
      const k = Phaser.Math.Clamp(w.countdown / w.countdownTotal, 0, 1);
      this.waveBar.fillStyle(0x000000, 0.6).fillRoundedRect(x, y + bh + 6, bw, 6, 3);
      this.waveBar.fillStyle(Palette.uiAmber, 1).fillRoundedRect(x, y + bh + 6, bw * k, 6, 3);
    }
    // Intel panel next to the button (below it, or above if near the bottom).
    const pw = this.previewRect.width, ph = this.previewRect.height;
    let px = Phaser.Math.Clamp(x + bw - pw, 12, this.W - pw - 12);
    let py = y + bh + 18;
    if (py + ph > this.H - HUD.bottom) py = y - ph - 10;
    if (this.panel.visible && this.panelSide === 'right' && px + pw > this.W - 300) px = this.W - 300 - pw;
    this.preview.setPosition(px, py);
    this.previewRect.setPosition(px, py);
  }

  private updatePanel(dt: number): void {
    const s = this.gs.controller.selected;
    const show = !!s && this.modal === 'none' && !this.gs.controller.ghost;
    this.panel.setVisible(show);
    if (!s || !show) return;
    const w = this.gs.world;
    const pw = 286;
    const px = this.panelSide === 'right' ? this.W - pw - 12 - this.inset.right : 12 + this.inset.left;
    const py = HUD.top + 10;
    this.panel.setPosition(px, py);
    this.panelRect.setPosition(px, py);

    setText(this.panelTitle, `${s.def.name.toUpperCase()}  ${ROMAN[s.tier]}`);
    setText(this.panelInfo, this.describe(s));

    const cost = w.upgradeCost(s);
    if (cost === null) {
      this.upgradeBtn.setLabel('MAX TIER', 'Specializations unlock in M2').setEnabled(false);
    } else {
      this.upgradeBtn.setLabel(`UPGRADE → ${ROMAN[s.tier + 1]}   ⛁ ${cost}`, s.def.tiers[s.tier + 1].blurb).setEnabled(w.supplies >= cost && !w.isOver);
    }
    this.targetBtn.setLabel('TARGET', TARGET_LABEL[s.targetMode]);
    this.sellArmed = Math.max(0, this.sellArmed - dt);
    this.sellBtn.setLabel(this.sellArmed > 0 ? 'CONFIRM?' : 'SELL', `+⛁ ${w.sellValue(s)}`);
  }

  private describe(s: Squad): string {
    const w = this.gs.world;
    const tier = s.def.tiers[s.tier];
    const wpn = tier.weapon;
    const alive = s.troopers.filter((t) => t.alive).length;
    const dps = s.def.crewServed ? wpn.damage * wpn.rof : wpn.damage * wpn.rof * s.def.troopers;
    const lines = [
      `${wpn.damageType === 'explosive' ? 'Explosive' : 'Ballistic'} · ${Math.round(dps)} dmg/s${wpn.splashRadius ? ' · splash' : ''}`,
      `Range ${Math.round(w.rangeOf(s))} · Arc ${s.def.arcDeg}°`,
      `Troopers ${alive}/${s.def.troopers} · ${tier.trooperHp} hp each`,
      s.cover ? `In ${getCover(s.cover.type).name}: −${Math.round(getCover(s.cover.type).damageReduction * 100)}% damage` : 'No cover (drag the flag into some)',
      s.down ? `DOWN: back in ${Math.ceil(s.downTimer)}s` : `Kills ${s.kills}`,
    ];
    return lines.join('\n');
  }
}
