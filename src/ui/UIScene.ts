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
import { Balance } from '../data/balance';
import { getBuilding } from '../data/buildings';
import { getCover } from '../data/cover';
import { getEnemy } from '../data/enemies';
import type { TargetMode } from '../data/types';
import { getUnit } from '../data/units';
import type { UiHitTester } from '../input/types';
import { trooperArt } from '../render/WorldRenderer';
import { save } from '../save/SaveSystem';
import type { Building, Squad } from '../sim/entities';
import { specsOf } from '../sim/stats';
import { HUD, type GameScene } from '../scenes/GameScene';
import { ActionButton, Button, panelBg, setText, text, type Tappable } from './widgets';
import { Powers } from '../data/powers';
import type { PowerId } from '../data/types';

interface CardDrag {
  pointerId: number;
  id: string;
  startX: number;
  startY: number;
  dragging: boolean;
}

interface Card {
  btn: Button;
  id: string;
  cost: number;
  isUnit: boolean;
  costText: Phaser.GameObjects.Text;
}

const TARGET_LABEL: Record<TargetMode, string> = { first: 'First', strongest: 'Strongest', weakest: 'Weakest', closest: 'Closest' };
const ROMAN = ['I', 'II', 'III'];
const PANEL_W = 300;

export class UIScene extends Phaser.Scene implements UiHitTester {
  private gs!: GameScene;
  private W = 0;
  private H = 0;
  private inset = { top: 0, right: 0, bottom: 0, left: 0 };
  private buttons: Tappable[] = [];
  private pressed = new Map<number, Tappable>();
  private rects: { r: Phaser.Geom.Rectangle; visible: () => boolean }[] = [];
  private modal: 'none' | 'menu' | 'end' = 'none';

  // HUD
  private suppliesText!: Phaser.GameObjects.Text;
  private integrityText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private capText!: Phaser.GameObjects.Text;
  private speedBtn!: Button;
  private pauseBtn!: Button;
  private pausedBanner!: Phaser.GameObjects.Text;
  private damageOverlay!: Phaser.GameObjects.Image;
  private damageFlash = 0;
  private lastIntegrity = 0;

  // Build bar
  private cards: Card[] = [];
  private cardDrag: CardDrag | null = null;
  private dragPos = { x: 0, y: 0 };

  // Commander powers
  private powerBtns: { id: PowerId; btn: Button; sweep: Phaser.GameObjects.Graphics; secs: Phaser.GameObjects.Text }[] = [];

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

  // Selection panel
  private panel!: Phaser.GameObjects.Container;
  private panelBgG!: Phaser.GameObjects.Graphics;
  private panelRect = new Phaser.Geom.Rectangle();
  private panelTitle!: Phaser.GameObjects.Text;
  private panelSub!: Phaser.GameObjects.Text;
  private panelInfo!: Phaser.GameObjects.Text;
  private actions: ActionButton[] = [];
  private targetBtn!: Button;
  private sellBtn!: Button;
  private closeBtn!: Button;
  private panelSide: 'left' | 'right' = 'right';
  private panelH = 0;
  private sellArmed = 0;

  // Boss bar
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;

  // Toast
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer = 0;

  // Menu / end
  private menu!: Phaser.GameObjects.Container;
  private menuButtons: Button[] = [];
  private toggles: { btn: Button; key: 'damageNumbers' | 'screenShake' | 'sound' | 'effectsHigh'; label: string }[] = [];
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
    this.powerBtns = [];
    this.actions = [];
    this.menuButtons = [];
    this.toggles = [];
    this.pressed.clear();
    this.modal = 'none';
    this.previewFor = -1;
    this.cardDrag = null;
    this.lastIntegrity = this.gs.world.integrity;

    this.damageOverlay = this.add.image(0, 0, 'fx.vignette').setOrigin(0).setDisplaySize(this.W, this.H).setTint(0xff2020).setAlpha(0);
    this.buildTopBar();
    this.buildBuildBar();
    this.buildPowers();
    this.buildPlacement();
    this.buildWave();
    this.buildPanel();
    this.toastText = text(this, this.W / 2, HUD.top + 30, '', 20, Palette.uiText, '800').setOrigin(0.5).setAlpha(0)
      .setShadow(0, 2, '#000', 6, false, true);
    this.bossBar = this.add.graphics();
    this.bossName = text(this, this.W / 2, HUD.top + 4, '', 14, 0xff8a6a, '900').setOrigin(0.5, 0).setLetterSpacing(3).setVisible(false);
    this.pausedBanner = text(this, this.W / 2, this.H / 2 - 40, 'PAUSED', 44, Palette.uiAmber, '900').setOrigin(0.5)
      .setShadow(0, 3, '#000', 10, false, true).setLetterSpacing(8).setVisible(false);
    this.buildMenu();
    this.buildEnd();

    this.gs.controller.onChange = () => this.onSelectionChange();
    this.gs.controller.onError = (r) => this.toast(r);
    this.gs.view.onIntegrityHit = () => (this.damageFlash = 1);
    this.gs.view.onNotice = (t) => this.toast(t);
    const w = this.gs.world;
    const ev = w.events;
    const prevCleared = ev.waveCleared?.bind(ev);
    ev.waveCleared = (i, bonus) => {
      prevCleared?.(i, bonus);
      if (bonus > 0) this.toast(`Wave ${i + 1} cleared  +${bonus} supplies`);
    };
    const prevStart = ev.waveStarted?.bind(ev);
    ev.waveStarted = (i, bonus) => {
      prevStart?.(i, bonus);
      const inc = i > 0 ? w.income : 0;
      this.toast(`${bonus > 0 ? `Wave ${i + 1} called early  +${bonus}` : `Wave ${i + 1} incoming`}${inc ? `  ·  depots +${inc}` : ''}`);
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

  private addButton<T extends Tappable>(b: T): T {
    this.buttons.push(b);
    return b;
  }

  private buildTopBar(): void {
    const x = 10 + this.inset.left, y = 10 + this.inset.top;
    const items: { icon: string; color: number; w: number; set: (t: Phaser.GameObjects.Text) => void }[] = [
      { icon: 'icon.supplies', color: Palette.uiAmber, w: 96, set: (t) => (this.suppliesText = t) },
      { icon: 'icon.integrity', color: Palette.fdcAccent, w: 92, set: (t) => (this.integrityText = t) },
      { icon: 'icon.wave', color: Palette.uiText, w: 70, set: (t) => (this.waveText = t) },
      { icon: 'icon.power', color: 0x9fe8ff, w: 92, set: (t) => (this.powerText = t) },
      { icon: 'icon.cap', color: Palette.uiText, w: 70, set: (t) => (this.capText = t) },
    ];
    const total = items.reduce((a, i) => a + i.w, 0) + 16;
    panelBg(this, total, 46, 0.85).setPosition(x, y);
    this.rects.push({ r: new Phaser.Geom.Rectangle(x, y, total, 46), visible: () => true });
    let cx = x + 10;
    for (const it of items) {
      addArt(this, it.icon, cx + 11, y + 23);
      it.set(text(this, cx + 26, y + 23, '', 19, it.color, '800').setOrigin(0, 0.5));
      cx += it.w;
    }

    const bw = 56, bh = 46, gap = 8;
    let rx = this.W - 10 - this.inset.right - bw;
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
    const cw = 80, ch = 84, gap = 6;
    const y = this.H - ch - 10 - this.inset.bottom;
    let x = 10 + this.inset.left;
    const ids = [...w.mission.units, ...w.mission.buildings];
    ids.forEach((id, i) => {
      const isUnit = w.mission.units.includes(id);
      if (!isUnit && i === w.mission.units.length) x += 10; // gap between squads and buildings
      const name = isUnit ? getUnit(id).name : getBuilding(id).name;
      const cost = isUnit ? getUnit(id).tiers[0].cost : getBuilding(id).tiers[0].cost;
      const btn = this.addButton(new Button(this, x, y, cw, ch, '', 'card', '', 12));
      const hull = isUnit ? getUnit(id).vehicleHull : undefined;
      const iconId = hull ?? (isUnit ? trooperArt({ def: getUnit(id), spec: null }, 0) : getBuilding(id).art);
      const icon = addArt(this, iconId, cw / 2, 30);
      if (hull) {
        icon.setRotation(-Math.PI / 2).setScale(icon.scale * 0.95);
        const tur = addArt(this, getUnit(id).art, cw / 2, 30).setRotation(-Math.PI / 2);
        tur.setScale(tur.scale * 0.95);
        btn.container.add(tur);
      } else if (isUnit) {
        icon.setRotation(-Math.PI / 2).setScale(icon.scale * 1.55);
      } else icon.setScale(icon.scale * 0.62);
      const label = text(this, cw / 2, 58, name.replace(' Squad', '').replace(' Weapons', '').replace(' Team', ''), 11, Palette.uiText, '700').setOrigin(0.5);
      const costText = text(this, cw / 2, 73, `⛁ ${cost}`, 13, Palette.uiAmber, '800').setOrigin(0.5);
      btn.container.add([icon, label, costText]);
      this.cards.push({ btn, id, cost, isUnit, costText });
      x += cw + gap;
    });
  }

  private buildPowers(): void {
    const ids = this.gs.world.powerIds;
    const size = 60, gap = 8;
    let x = this.W - 10 - this.inset.right - ids.length * (size + gap) + gap;
    const y = this.H - size - 10 - this.inset.bottom;
    const icons: Record<PowerId, string> = { orbital: 'icon.orbital', airstrike: 'fx.jet', emp: 'icon.emp', droppod: 'fx.pod' };
    for (const id of ids) {
      const btn = this.addButton(new Button(this, x, y, size, size, '', 'dark', '', 12));
      const icon = addArt(this, icons[id], size / 2, size / 2 - 4);
      icon.setScale(icon.scale * (id === 'airstrike' ? 0.9 : id === 'droppod' ? 1.6 : 1.3)).setRotation(id === 'airstrike' ? -Math.PI / 2 : 0);
      const sweep = this.add.graphics();
      const secs = text(this, size / 2, size - 11, '', 12, Palette.uiText, '800').setOrigin(0.5);
      btn.container.add([icon, sweep, secs]);
      btn.onTap = () => {
        const w = this.gs.world;
        if (w.powerCd[id] > 0) {
          this.toast(`${Powers[id].name}: ready in ${Math.ceil(w.powerCd[id])}s`);
          return;
        }
        this.gs.controller.beginPower(id);
        if (this.gs.controller.power === id) this.toast(id === 'airstrike' ? 'Drag a line on the map for the bombing run (tap = along the road)' : `${Powers[id].name}: tap or drag on the map to aim`);
      };
      this.powerBtns.push({ id, btn, sweep, secs });
      x += size + gap;
    }
  }

  private updatePowers(): void {
    const w = this.gs.world;
    for (const p of this.powerBtns) {
      const cd = w.powerCd[p.id];
      const frac = cd / Powers[p.id].cooldown;
      const g = p.sweep.clear();
      if (cd > 0) {
        g.fillStyle(0x000000, 0.6).slice(30, 30, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac), false).fillPath();
        setText(p.secs, `${Math.ceil(cd)}s`);
      } else setText(p.secs, w.isOver ? '' : 'READY');
      p.secs.setColor(cd > 0 ? css(Palette.uiText) : css(Palette.fdcAccent));
      p.btn.setActive(this.gs.controller.power === p.id);
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

  private buildPanel(): void {
    this.panel = this.add.container(0, 0).setVisible(false);
    this.panelBgG = this.add.graphics();
    this.panelTitle = text(this, 14, 12, '', 18, Palette.uiAmber, '900');
    this.panelSub = text(this, 14, 36, '', 12, Palette.uiDim, '700').setWordWrapWidth(PANEL_W - 70);
    this.panelInfo = text(this, 14, 56, '', 13, Palette.uiText, '600').setLineSpacing(3);
    this.closeBtn = this.addButton(new Button(this, PANEL_W - 50, 8, 42, 40, '✕', 'dark', '', 17));
    this.closeBtn.onTap = () => this.gs.controller.select(null);
    this.panel.add([this.panelBgG, this.panelTitle, this.panelSub, this.panelInfo, this.closeBtn.container]);
    for (let i = 0; i < 3; i++) {
      const a = this.addButton(new ActionButton(this, PANEL_W - 24));
      this.panel.add(a.container);
      this.actions.push(a);
    }
    const half = (PANEL_W - 34) / 2;
    this.targetBtn = this.addButton(new Button(this, 12, 0, half, 54, 'TARGET', 'secondary', 'First', 14));
    this.targetBtn.onTap = () => {
      const s = this.gs.controller.selectedSquad;
      if (s) this.gs.world.cycleTargetMode(s);
    };
    this.sellBtn = this.addButton(new Button(this, 22 + half, 0, half, 54, 'SELL', 'danger', '', 14));
    this.sellBtn.onTap = () => this.onSell();
    this.panel.add([this.targetBtn.container, this.sellBtn.container]);
    this.rects.push({ r: this.panelRect, visible: () => this.panel.visible });
  }

  private buildMenu(): void {
    this.dim = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.6).setOrigin(0).setVisible(false);
    const pw = 340, ph = 478;
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
    const toggle = (key: 'damageNumbers' | 'screenShake' | 'sound' | 'effectsHigh', label: string) => {
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
    toggle('effectsHigh', 'Effects');
    mk('Restart mission', 'danger', () => this.gs.restart());
    mk('Quit to title', 'danger', () => this.gs.quit());
    mk('Resume', 'primary', () => this.closeMenu());
    this.refreshToggles();
  }

  private refreshToggles(): void {
    for (const t of this.toggles) {
      const on = save.settings[t.key];
      t.btn.setLabel(`${t.label}:  ${t.key === 'effectsHigh' ? (on ? 'HIGH' : 'LOW') : on ? 'ON' : 'OFF'}`);
    }
  }

  private buildEnd(): void {
    const pw = 400, ph = 340;
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
    this.gs.recordResult();
    this.modal = 'end';
    this.dim.setVisible(true);
    this.menu.setVisible(false);
    this.end.setVisible(true);
    if (w.endless) {
      this.showEndlessEnd();
      return;
    }
    const won = w.state === 'won';
    this.endTitle.setText(won ? 'OUTPOST HELD' : 'OUTPOST LOST').setColor(css(won ? Palette.uiAmber : 0xff6a5a));
    this.endInfo.setText(
      won
        ? `Integrity ${w.integrity}/${w.maxIntegrity}\nBest: ${Math.max(w.stars, save.mission(w.mission.id)?.stars ?? 0)}★`
        : `Survived ${w.wavesCleared} of ${w.totalWaves} waves\nThe Choir broke through.`,
    );
    const g = this.endStars.clear();
    for (let i = 0; i < 3; i++) {
      const cx = 400 / 2 + (i - 1) * 64, cy = 100;
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 26 : 11;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      g.fillStyle(i < w.stars ? Palette.uiAmber : 0x3a3d34, 1).fillPoints(pts, true);
      g.lineStyle(2, 0x000000, 0.5).strokePoints(pts, true);
    }
  }

  private showEndlessEnd(): void {
    const w = this.gs.world;
    const rank = this.gs.endlessRank;
    this.endTitle.setText(rank === 0 ? 'NEW RECORD!' : 'OUTPOST FELL').setColor(css(rank === 0 ? Palette.uiAmber : 0xff6a5a));
    this.endStars.clear();
    const runs = save.endlessRuns(w.mission.id);
    const lines = [`You held for ${w.wavesCleared} waves · ${w.kills} kills`, '', 'BEST RUNS'];
    runs.forEach((r, i) => {
      const d = new Date(r.date);
      lines.push(`${i === rank ? '▶ ' : ''}${i + 1}.  Wave ${r.waves}  ·  ${r.kills} kills  ·  ${d.toLocaleDateString()}`);
    });
    this.endInfo.setText(lines.join('\n')).setY(140).setFontSize(15).setLineSpacing(4);
  }

  // ================================================================== input

  hitTest(x: number, y: number): boolean {
    if (this.modal !== 'none') return true;
    for (const b of this.buttons) if (b.contains(x, y)) return true;
    for (const r of this.rects) if (r.visible() && r.r.contains(x, y)) return true;
    return false;
  }

  private activeButtons(): Tappable[] {
    if (this.modal === 'menu') return this.menuButtons;
    if (this.modal === 'end') return this.endButtons;
    return this.buttons;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    const x = p.x / DPR, y = p.y / DPR;
    const list = this.activeButtons();
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (!b.contains(x, y)) continue;
      const card = this.cards.find((c) => c.btn === b);
      if (card) this.cardDrag = { pointerId: p.id, id: card.id, startX: x, startY: y, dragging: false };
      b.pressed = true;
      b.redraw();
      this.pressed.set(p.id, b);
      return;
    }
    if (this.modal === 'none' && this.preview.visible && this.previewRect.contains(x, y)) this.hidePreview();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.cardDrag;
    if (!d || d.pointerId !== p.id || !p.isDown) return;
    const x = p.x / DPR, y = p.y / DPR;
    if (!d.dragging && Math.hypot(x - d.startX, y - d.startY) > 12) {
      if (!this.canPlace(d.id)) return;
      d.dragging = true;
      const b = this.pressed.get(p.id);
      if (b) {
        b.pressed = false;
        b.redraw();
        this.pressed.delete(p.id);
      }
      if (this.gs.controller.ghost?.unitId !== d.id) this.gs.beginPlacementAtViewCenter(d.id);
    }
    if (d.dragging) {
      // The ghost floats above the finger so you can see where it's going.
      this.dragPos.x = x;
      this.dragPos.y = y;
      this.gs.moveGhostToScreen(x, y - 64);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const x = p.x / DPR, y = p.y / DPR;
    const d = this.cardDrag;
    if (d && d.pointerId === p.id && d.dragging) {
      this.cardDrag = null;
      // Dropped back onto the build bar → cancel.
      if (y > this.H - HUD.bottom + 10 && x < this.cards[this.cards.length - 1].btn.container.x + 100) this.gs.controller.cancelPlacement();
      return;
    }
    const b = this.pressed.get(p.id);
    this.pressed.delete(p.id);
    if (!b) return;
    b.pressed = false;
    b.redraw();
    if (d && d.pointerId === p.id) {
      this.cardDrag = null;
      this.onCardTap(d.id);
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

  /** Can this card be placed right now? Shows why not. */
  private canPlace(id: string): boolean {
    const card = this.cards.find((c) => c.id === id)!;
    const w = this.gs.world;
    if (card.isUnit && w.capUsed + getUnit(id).cap > w.capMax) {
      this.toast(`Command Cap full (${w.capUsed}/${w.capMax}). Sell a squad first`);
      sfx.error();
      return false;
    }
    if (w.supplies < card.cost) {
      this.toast(`Need ⛁ ${card.cost} supplies`);
      sfx.error();
      return false;
    }
    return true;
  }

  private onCardTap(id: string): void {
    const c = this.gs.controller;
    if (c.ghost?.unitId === id) {
      c.cancelPlacement();
      return;
    }
    if (!this.canPlace(id)) return;
    sfx.click();
    this.gs.beginPlacementAtViewCenter(id);
  }

  private onSell(): void {
    const p = this.gs.controller.selected;
    if (!p) return;
    // Two taps to sell, so a stray finger can't sell a veteran squad.
    if (this.sellArmed <= 0) {
      this.sellArmed = 2.5;
      return;
    }
    this.sellArmed = 0;
    this.gs.world.sell(p);
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
    const def = w.waveDef(waveIndex);
    this.previewFor = waveIndex;
    this.previewTimer = seconds; // 0 = stay open
    this.previewBody.removeAll(true);
    const counts = new Map<string, number>();
    for (const g of def.groups) counts.set(g.enemy, (counts.get(g.enemy) ?? 0) + g.count);
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
    setText(this.previewTitle, `WAVE ${waveIndex + 1}${def.theme ? ` · ${def.theme.toUpperCase()}` : ''}  ·  tap to close`);
    this.previewTitle.setColor(css(def.surge ? 0xff8a6a : Palette.uiAmber));
    const ph = y + 12;
    this.previewBg.destroy();
    this.previewBg = panelBg(this, pw, ph, 0.94);
    this.preview.addAt(this.previewBg, 0);
    this.previewRect.setSize(pw, ph);
    this.preview.setVisible(true);
  }

  private hidePreview(): void {
    this.preview.setVisible(false);
    this.previewFor = -1;
  }

  toast(message: string): void {
    setText(this.toastText, message);
    this.toastTimer = 2.4;
  }

  private onSelectionChange(): void {
    this.sellArmed = 0;
    const sel = this.gs.controller.selected;
    this.panel.setVisible(!!sel && this.modal === 'none');
    if (!sel) return;
    const p = this.gs.rig.worldToScreen(sel.x, sel.y);
    const sx = p.x / DPR, sy = p.y / DPR;
    this.panelSide = sx > this.W * 0.5 ? 'left' : 'right';
    this.updatePanel(0);
    // Keep the selection visible: if it ended up under the panel or a HUD bar, glide the camera.
    const panelL = this.panelSide === 'right' ? this.W - PANEL_W - 20 : PANEL_W + 20;
    const clearL = this.panelSide === 'right' ? 20 : panelL;
    const clearR = this.panelSide === 'right' ? panelL : this.W - 20;
    const top = HUD.top + 60, bottom = this.H - HUD.bottom - 80;
    const tx = Phaser.Math.Clamp(sx, clearL + 60, clearR - 60);
    const ty = Phaser.Math.Clamp(sy, top, bottom);
    if (Math.abs(tx - sx) > 2 || Math.abs(ty - sy) > 2) this.gs.rig.glideTo(sel.x, sel.y, tx, ty);
  }

  // ================================================================== per-frame

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const gs = this.gs;
    const w = gs.world;

    // Top bar
    setText(this.suppliesText, `${Math.floor(w.supplies)}`);
    setText(this.integrityText, `${w.integrity}/${w.maxIntegrity}`);
    setText(this.waveText, w.endless ? `${Math.max(1, w.wavesStarted)}` : `${Math.max(1, w.wavesStarted)}/${w.totalWaves}`);
    setText(this.powerText, `${w.power} T${w.tech}`);
    setText(this.capText, `${w.capUsed}/${w.capMax}`);
    this.capText.setColor(w.capUsed >= w.capMax ? '#ff8a7a' : css(Palette.uiText));
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
      const capped = c.isUnit && w.capUsed + getUnit(c.id).cap > w.capMax;
      c.btn.setEnabled(w.supplies >= c.cost && !capped && !w.isOver);
      c.btn.setActive(ghost?.unitId === c.id);
      setText(c.costText, capped ? 'CAP FULL' : `⛁ ${c.cost}`);
    }

    // Edge-scroll while dragging a ghost from a card.
    if (this.cardDrag?.dragging) {
      if (gs.router.edgePan(this.dragPos.x, this.dragPos.y, dt, HUD)) gs.moveGhostToScreen(this.dragPos.x, this.dragPos.y - 64);
    }

    this.updatePowers();
    this.updatePlacementUi();
    this.updateWaveUi(dt);
    this.updatePanel(dt);

    this.updateBossBar();
    this.toastText.setY(this.bossName.visible ? HUD.top + 62 : HUD.top + 30);

    this.toastTimer -= dt;
    this.toastText.setAlpha(Phaser.Math.Clamp(this.toastTimer * 2, 0, 1));

    if (w.isOver && this.modal !== 'end') this.showEnd();
  }

  private updateBossBar(): void {
    const g = this.bossBar.clear();
    const boss = this.gs.world.enemies.find((e) => e.alive && e.def.phases);
    this.bossName.setVisible(!!boss);
    if (!boss) return;
    const w = Math.min(420, this.W - 200), x = (this.W - w) / 2, y = HUD.top + 22;
    setText(this.bossName, boss.def.name.toUpperCase());
    g.fillStyle(0x000000, 0.7).fillRoundedRect(x - 3, y - 3, w + 6, 14, 4);
    g.fillStyle(0x5a1a1a, 1).fillRect(x, y, w, 8);
    g.fillStyle(0xe0475f, 1).fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 8);
    for (const at of boss.def.phases!.at) g.fillStyle(0xffffff, 0.8).fillRect(x + w * at - 1, y - 2, 2, 12);
  }

  private updatePlacementUi(): void {
    const gh = this.gs.controller.ghost;
    const show = !!gh && this.modal === 'none' && !this.cardDrag?.dragging && !this.gs.controller.dragging;
    this.okBtn.setVisible(show);
    this.cancelBtn.setVisible(show);
    this.reasonText.setVisible(!!gh && !gh.check.ok);
    if (!gh) return;
    const p = this.gs.rig.worldToScreen(gh.check.x, gh.check.y);
    const sx = p.x / DPR, sy = p.y / DPR;
    const right = sx < this.W - 170;
    const bx = right ? sx + 50 : sx - 50 - 60;
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
    const ax = Phaser.Math.Clamp(start.x, 60, w.map.width - 60);
    const ay = Phaser.Math.Clamp(start.y, 60, w.map.height - 60);
    const p = gs.rig.worldToScreen(ax, ay);
    const bw = this.waveBtn.w, bh = this.waveBtn.h;
    const panelRight = this.panel.visible && this.panelSide === 'right';
    const maxX = this.W - bw - 10 - this.inset.right - (panelRight ? PANEL_W + 14 : 0);
    const x = Phaser.Math.Clamp(p.x / DPR - bw / 2, 10 + this.inset.left, maxX);
    const y = Phaser.Math.Clamp(p.y / DPR + 30, HUD.top + 8, this.H - HUD.bottom - bh - 10);
    this.waveBtn.setPosition(x, y);
    const next = w.wavesStarted + 1;
    if (w.state === 'prep') {
      this.waveBtn.setLabel(`START WAVE ${next}`, 'tap when ready');
    } else {
      const armed = this.preview.visible && this.previewFor === w.wavesStarted;
      this.waveBtn.setLabel(armed ? `CALL NOW` : `WAVE ${next} ▸`, armed ? `+${w.callEarlyBonus} supplies` : `${Math.ceil(w.countdown)}s · tap for intel`);
      const k = Phaser.Math.Clamp(w.countdown / w.countdownTotal, 0, 1);
      this.waveBar.fillStyle(0x000000, 0.6).fillRoundedRect(x, y + bh + 6, bw, 6, 3);
      this.waveBar.fillStyle(Palette.uiAmber, 1).fillRoundedRect(x, y + bh + 6, bw * k, 6, 3);
    }
    const pw = this.previewRect.width, ph = this.previewRect.height;
    let px = Phaser.Math.Clamp(x + bw - pw, 10, this.W - pw - 10);
    let py = y + bh + 18;
    if (py + ph > this.H - HUD.bottom) py = y - ph - 10;
    if (this.panel.visible && this.panelSide === 'right' && px + pw > this.W - PANEL_W - 20) px = this.W - PANEL_W - 24 - pw;
    this.preview.setPosition(px, py);
    this.previewRect.setPosition(px, py);
  }

  // ---------------------------------------------------------------- selection panel

  private updatePanel(dt: number): void {
    const sel = this.gs.controller.selected;
    const show = !!sel && this.modal === 'none' && !this.gs.controller.ghost;
    this.panel.setVisible(show);
    if (!sel || !show) return;
    this.sellArmed = Math.max(0, this.sellArmed - dt);

    let y = sel.kind === 'squad' ? this.fillSquadPanel(sel) : this.fillBuildingPanel(sel);
    // Sell (and target) row.
    this.sellBtn.setLabel(this.sellArmed > 0 ? 'CONFIRM?' : 'SELL', `+⛁ ${this.gs.world.sellValue(sel)}`);
    this.targetBtn.setVisible(sel.kind === 'squad');
    if (sel.kind === 'squad') this.targetBtn.setLabel('TARGET', TARGET_LABEL[sel.targetMode]);
    this.targetBtn.setPosition(12, y);
    this.sellBtn.setPosition(sel.kind === 'squad' ? 22 + (PANEL_W - 34) / 2 : 12, y);
    this.sellBtn.w = sel.kind === 'squad' ? (PANEL_W - 34) / 2 : PANEL_W - 24;
    this.sellBtn.label.setX(this.sellBtn.w / 2);
    this.sellBtn.sub.setX(this.sellBtn.w / 2);
    y += 54 + 12;

    // Panel geometry.
    const maxH = this.H - HUD.top - 10 - HUD.bottom;
    const h = Math.min(y, maxH);
    if (h !== this.panelH) {
      this.panelH = h;
      const g = this.panelBgG.clear();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(3, 5, PANEL_W, h, 12);
      g.fillStyle(Palette.uiPanel, 0.94).fillRoundedRect(0, 0, PANEL_W, h, 12);
      g.lineStyle(1.5, 0x3a3d34, 1).strokeRoundedRect(0, 0, PANEL_W, h, 12);
      this.sellBtn.redraw();
    }
    const px = this.panelSide === 'right' ? this.W - PANEL_W - 10 - this.inset.right : 10 + this.inset.left;
    const py = HUD.top + 8;
    this.panel.setPosition(px, py);
    this.panelRect.setTo(px, py, PANEL_W, h);
  }

  private fillSquadPanel(s: Squad): number {
    const w = this.gs.world;
    const title = s.spec ? s.spec.name : s.def.name;
    setText(this.panelTitle, `${title.toUpperCase()}  ${ROMAN[s.tier]}${s.rank ? '  ' + '★'.repeat(s.rank) : ''}`);
    const nextRank = Balance.veterancyXp[s.rank];
    setText(this.panelSub, `${s.spec ? s.spec.blurb : s.def.role}${nextRank ? `  ·  XP ${s.xp}/${nextRank}` : '  ·  Max veterancy'}`);
    setText(this.panelInfo, this.describe(s));
    this.panelInfo.setY(40 + this.panelSub.height);
    let y = this.panelInfo.y + this.panelInfo.height + 10;

    const place = (i: number, title: string, cost: string, desc: string, state: 'buy' | 'locked' | 'owned' | 'poor', accent?: number) => {
      const a = this.actions[i];
      a.setVisible(true).setPosition(12, y);
      y += a.set(title, cost, desc, state, accent) + 8;
    };
    let used = 0;
    const up = w.checkUpgrade(s);
    if (up) {
      const next = s.def.tiers[s.tier + 1];
      const state = up.ok ? 'buy' : up.reason.startsWith('Needs') ? 'locked' : 'poor';
      place(used++, `Upgrade to ${ROMAN[s.tier + 1]}`, `⛁ ${up.cost}`, state === 'locked' ? `🔒 ${up.reason}. ${next.blurb}` : next.blurb, state);
      this.actions[used - 1].onTap = () => this.buy(() => w.upgrade(s), up.reason);
    } else if (!s.spec) {
      for (const spec of specsOf(s.def)) {
        const c = w.checkSpecialize(s, spec);
        const state = c.ok ? 'buy' : c.reason.startsWith('Needs') ? 'locked' : 'poor';
        place(used++, spec.name, `⛁ ${spec.cost}`, state === 'locked' ? `🔒 ${c.reason}. ${spec.blurb}` : spec.blurb, state, Palette.fdcAccent);
        this.actions[used - 1].onTap = () => this.buy(() => w.specialize(s, spec.id), c.reason);
      }
    } else {
      for (const a of s.spec.abilities) {
        const c = w.checkAbility(s, a);
        const owned = s.abilities.includes(a.id);
        const state = owned ? 'owned' : c.ok ? 'buy' : c.reason.startsWith('Needs') ? 'locked' : 'poor';
        place(used++, a.name, owned ? '✓ OWNED' : `⛁ ${a.cost}`, state === 'locked' ? `🔒 ${c.reason}. ${a.desc}` : a.desc, state, Palette.fdcAccent);
        this.actions[used - 1].onTap = () => this.buy(() => w.buyAbility(s, a.id), c.reason);
      }
    }
    for (let i = used; i < this.actions.length; i++) this.actions[i].setVisible(false);
    return y;
  }

  private fillBuildingPanel(b: Building): number {
    const w = this.gs.world;
    const tier = b.def.tiers[b.tier];
    setText(this.panelTitle, `${b.def.name.toUpperCase()}  ${ROMAN[b.tier]}`);
    setText(this.panelSub, b.def.role);
    const lines = [
      tier.income ? `Pays ⛁ ${tier.income} at the start of every wave` : '',
      tier.power ? `Provides ⚡ ${tier.power} Power (you have ${w.power}, Tech ${w.tech})` : '',
      tier.power ? `Tech 2 at ⚡${Balance.techPower[0]}, Tech 3 at ⚡${Balance.techPower[1]}` : '',
      tier.detect ? `Reveals cloaked enemies within ${tier.detect}` : '',
      'Uses no Command Cap. Enemies ignore it.',
    ].filter(Boolean);
    setText(this.panelInfo, lines.join('\n'));
    this.panelInfo.setY(40 + this.panelSub.height);
    let y = this.panelInfo.y + this.panelInfo.height + 10;
    const up = w.checkUpgrade(b);
    for (const a of this.actions) a.setVisible(false);
    if (up) {
      const a = this.actions[0];
      a.setVisible(true).setPosition(12, y);
      y += a.set(`Upgrade to ${ROMAN[b.tier + 1]}`, `⛁ ${up.cost}`, b.def.tiers[b.tier + 1].blurb, up.ok ? 'buy' : 'poor') + 8;
      a.onTap = () => this.buy(() => w.upgrade(b), up.reason);
    }
    return y;
  }

  private buy(fn: () => boolean, reason: string): void {
    if (!fn()) {
      this.toast(reason || 'Not available');
      sfx.error();
    }
  }

  private describe(s: Squad): string {
    const w = this.gs.world;
    const st = s.stats;
    const alive = s.troopers.filter((t) => t.alive).length;
    const shooters = s.def.crewServed ? 1 : s.def.troopers;
    const dps = st.damage * st.rof * shooters;
    const type = st.damageType === 'ap' ? 'Armor-piercing' : st.damageType === 'explosive' ? 'Explosive' : 'Ballistic';
    const cover = s.cover ? getCover(s.cover.type) : null;
    const lines = [
      `${type} · ${Math.round(dps)} dmg/s${st.splash ? ' · splash' : ''} · range ${Math.round(w.rangeOf(s))}`,
      `Troopers ${alive}/${s.def.troopers} · ${Math.round(st.hp)} hp · blocks ${st.blockCap}`,
      s.def.vehicleHull ? `Vehicle: −${Math.round(st.armor * 100)}% damage (armor), can't use cover` : cover ? `In ${cover.name}: −${Math.round(cover.damageReduction * 100)}% damage taken` : 'No cover: drag the flag into some',
      st.projectile === 'shell' ? "Grenades can't hit fliers" : st.antiAir ? 'Anti-air: double damage to fliers' : 'Can hit fliers',
    ];
    if (st.turretCount) lines.push(`${st.turretCount} turrets · ${Math.round((st.turretWeapon?.damage ?? 0) * st.turretDamage * (st.turretWeapon?.rof ?? 0))} dmg/s each`);
    if (st.aura) lines.push(`Aura: ${[st.aura.heal ? `heal ${st.aura.heal}/s` : '', st.aura.rof > 1 ? `+${Math.round((st.aura.rof - 1) * 100)}% fire rate` : '', st.aura.reinforce > 1 ? 'fast reinforce' : ''].filter(Boolean).join(', ')}`);
    if (s.down) lines.push(`DOWN: back in ${Math.ceil(s.downTimer)}s`);
    else lines.push(`Kills ${s.kills}`);
    return lines.join('\n');
  }
}
