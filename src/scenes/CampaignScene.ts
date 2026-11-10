/**
 * Campaign map: mission nodes across Kestrel's Reach, stars earned, and the mission briefing
 * (with hero selection). Also links to the Tech Tree.
 */
import Phaser from 'phaser';
import { fitCamera, logicalSize, safeAreaInsets } from '../app/display';
import { addArt } from '../assets/art';
import { Palette, css } from '../assets/palette';
import { getBuilding } from '../data/buildings';
import { getEnemy } from '../data/enemies';
import { HERO_ORDER, Heroes } from '../data/heroes';
import { Missions } from '../data/missions';
import type { MissionDef } from '../data/types';
import { getUnit } from '../data/units';
import { save } from '../save/SaveSystem';
import { TapRouter } from '../ui/router';
import { Button, panelBg, setText, text, type Tappable } from '../ui/widgets';

/** Future missions shown as locked "coming soon" nodes. */
const COMING: [number, number, string][] = [
  [0.56, 0.62, 'Mission 3'],
  [0.68, 0.38, 'Mission 4'],
  [0.82, 0.62, 'Mission 5'],
];

export class CampaignScene extends Phaser.Scene {
  private W = 0;
  private H = 0;
  private router!: TapRouter;
  private briefing: { container: Phaser.GameObjects.Container; buttons: Tappable[] } | null = null;

  constructor() {
    super('Campaign');
  }

  create(): void {
    fitCamera(this.cameras.main);
    ({ width: this.W, height: this.H } = logicalSize(this.game));
    const inset = safeAreaInsets();
    this.router = new TapRouter(this);
    this.router.only = () => this.briefing?.buttons ?? null;
    this.briefing = null;

    this.add.tileSprite(0, 0, this.W, this.H, 'env.ground').setOrigin(0).setTint(0x8a8070);
    this.drawRegions();
    this.add.image(0, 0, 'fx.vignette').setOrigin(0).setDisplaySize(this.W, this.H);

    // Header
    const top = 12 + inset.top;
    text(this, this.W / 2, top + 22, "KESTREL'S REACH", 26, Palette.uiAmber, '900').setOrigin(0.5).setLetterSpacing(6).setShadow(0, 3, '#000', 8, false, true);
    const back = this.router.add(new Button(this, 12 + inset.left, top, 92, 46, '◀ BACK', 'dark', '', 15));
    back.onTap = () => this.scene.start('Title');
    const stars = save.availableStars(), total = save.totalStars();
    const tech = this.router.add(new Button(this, this.W - 12 - inset.right - 200, top, 200, 46, 'TECH TREE', 'primary', `★ ${stars} to spend · ${total} earned`, 15));
    tech.onTap = () => this.scene.start('Tech');

    // Route lines between nodes
    const g = this.add.graphics();
    const campaign = save.campaign();
    const pts: [number, number][] = campaign.map((m) => this.pos(m)).concat(COMING.map(([x, y]) => [x * this.W, y * this.H] as [number, number]));
    for (let i = 1; i < pts.length; i++) this.dashed(g, pts[i - 1], pts[i], i <= campaign.length - 1 ? 0xf2a93b : 0x5a5a50);

    campaign.forEach((m, i) => this.node(m, i + 1));
    for (const [x, y, label] of COMING) this.lockedNode(x * this.W, y * this.H, label, 'Coming in M4b');
    const endless = Missions.find((m) => m.endless);
    if (endless) this.node(endless, 0);

    text(this, this.W / 2, this.H - 22 - inset.bottom, 'Tap a mission for its briefing', 14, Palette.uiDim, '700').setOrigin(0.5);
  }

  private pos(m: MissionDef): [number, number] {
    const p = m.campaignPos ?? [0.5, 0.5];
    return [p[0] * this.W, p[1] * this.H];
  }

  private drawRegions(): void {
    const g = this.add.graphics();
    const W = this.W, H = this.H;
    // Stylized terrain blobs and a river, just for atmosphere.
    g.fillStyle(0x3a3426, 0.5).fillEllipse(W * 0.22, H * 0.62, W * 0.34, H * 0.42);
    g.fillStyle(0x34302a, 0.5).fillEllipse(W * 0.42, H * 0.38, W * 0.3, H * 0.36);
    g.fillStyle(0x2a2c2e, 0.5).fillEllipse(W * 0.68, H * 0.52, W * 0.34, H * 0.5);
    g.fillStyle(0x3a1830, 0.45).fillEllipse(W * 0.86, H * 0.26, W * 0.26, H * 0.3);
    g.lineStyle(6, 0x1c2a33, 0.8).beginPath().moveTo(W * 0.05, H * 0.2).lineTo(W * 0.3, H * 0.25).lineTo(W * 0.5, H * 0.75).lineTo(W * 0.7, H * 0.95).strokePath();
    for (const m of Missions) {
      if (!m.region || !m.campaignPos) continue;
      text(this, m.campaignPos[0] * W, m.campaignPos[1] * H - 62, m.region.toUpperCase(), 11, Palette.uiDim, '800').setOrigin(0.5).setLetterSpacing(3);
    }
  }

  private dashed(g: Phaser.GameObjects.Graphics, a: [number, number], b: [number, number], color: number): void {
    const n = Math.max(2, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
    g.lineStyle(3, color, 0.7);
    for (let i = 0; i < n; i += 2) {
      const k0 = i / n, k1 = Math.min(1, (i + 1) / n);
      g.lineBetween(a[0] + (b[0] - a[0]) * k0, a[1] + (b[1] - a[1]) * k0, a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1);
    }
  }

  private node(m: MissionDef, number: number): void {
    const [x, y] = this.pos(m);
    const unlocked = save.missionUnlocked(m.id);
    const endless = !!m.endless;
    const stars = endless ? save.endlessStars(m.id) : save.mission(m.id)?.stars ?? 0;
    const btn = this.router.add(new Button(this, x - 36, y - 36, 72, 72, endless ? '∞' : String(number), unlocked ? (endless ? 'card' : 'primary') : 'dark', '', 28));
    if (endless) btn.label.setColor(css(0x7fd4e8));
    btn.onTap = () => (unlocked ? this.openBriefing(m) : undefined);
    btn.setEnabled(unlocked);
    text(this, x, y + 44, m.name.replace('Endless: ', 'Endless · '), 14, unlocked ? Palette.uiText : Palette.uiDim, '800').setOrigin(0.5).setShadow(0, 2, '#000', 4, false, true);
    text(this, x, y + 64, unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒 Win the previous mission', unlocked ? 16 : 12, Palette.uiAmber, '800').setOrigin(0.5);
  }

  private lockedNode(x: number, y: number, label: string, sub: string): void {
    const g = this.add.graphics();
    g.fillStyle(0x1b1d18, 0.85).fillCircle(x, y, 30);
    g.lineStyle(2, 0x3a3d34, 1).strokeCircle(x, y, 30);
    text(this, x, y, '?', 24, Palette.uiDim, '900').setOrigin(0.5);
    text(this, x, y + 42, label, 13, Palette.uiDim, '800').setOrigin(0.5);
    text(this, x, y + 60, sub, 11, Palette.uiDim, '600').setOrigin(0.5);
  }

  // ---------------------------------------------------------------- briefing

  private openBriefing(m: MissionDef): void {
    this.briefing?.container.destroy();
    const pw = Math.min(560, this.W - 40), ph = Math.min(540, this.H - 40);
    const c = this.add.container((this.W - pw) / 2, (this.H - ph) / 2);
    const dim = this.add.rectangle(-c.x, -c.y, this.W, this.H, 0x000000, 0.6).setOrigin(0);
    c.add([dim, panelBg(this, pw, ph, 0.97)]);
    c.add(text(this, 20, 18, m.name.toUpperCase(), 22, Palette.uiAmber, '900').setLetterSpacing(2));
    c.add(text(this, 20, 50, m.briefing, 14, Palette.uiText, '600').setWordWrapWidth(pw - 40));

    // Intel: enemies and new tools.
    const enemies = new Set<string>();
    for (const w of m.waves) for (const g of w.groups) enemies.add(getEnemy(g.enemy).name);
    const prev = save.campaign()[save.campaign().findIndex((q) => q.id === m.id) - 1];
    const newUnits = m.units.filter((u) => !prev?.units.includes(u)).map((u) => getUnit(u).name);
    const newBld = m.buildings.filter((b) => !prev?.buildings.includes(b)).map((b) => getBuilding(b).name);
    const lines = [
      m.endless ? 'Waves never stop. Wave 10 / 20 / 30 earn 1 / 2 / 3 stars.' : `${m.waves.length} waves · Integrity ${m.integrity} · Command Cap ${m.commandCap}`,
      enemies.size ? `Enemies: ${[...enemies].join(', ')}` : '',
      newUnits.length || newBld.length ? `New: ${[...newUnits, ...newBld].join(', ')}` : '',
      m.endless && save.endlessRuns(m.id)[0] ? `Best run: wave ${save.endlessRuns(m.id)[0].waves}` : '',
    ].filter(Boolean);
    const intel = text(this, 20, 96, lines.join('\n'), 13, Palette.uiDim, '700').setWordWrapWidth(pw - 40).setLineSpacing(4);
    c.add(intel);

    // Hero selection.
    const hy = 110 + intel.height + 10;
    c.add(text(this, 20, hy, 'CHOOSE YOUR HERO', 14, Palette.uiAmber, '900').setLetterSpacing(2));
    const buttons: Tappable[] = [];
    const heroInfo = text(this, 20, hy + 128, '', 13, Palette.uiText, '600').setWordWrapWidth(pw - 40);
    c.add(heroInfo);
    const cardW = (pw - 40 - 16) / 3;
    const heroButtons: { id: string; btn: Button }[] = [];
    const refresh = () => {
      for (const { id, btn } of heroButtons) btn.setActive(save.selectedHero === id);
      const h = Heroes[save.selectedHero];
      setText(heroInfo, `${h.name}: ${h.bio}\n• ${h.abilities[0].name}: ${h.abilities[0].desc}\n• ${h.abilities[1].name} (LV ${h.abilities[1].level}): ${h.abilities[1].desc}`);
    };
    HERO_ORDER.forEach((id, i) => {
      const h = Heroes[id];
      const ok = save.heroUnlocked(h);
      const req = h.unlockedBy ? Missions.find((q) => q.id === h.unlockedBy)?.name : '';
      const btn = new Button(this, 20 + i * (cardW + 8), hy + 26, cardW, 92, '', ok ? 'card' : 'dark', '', 12);
      const img = addArt(this, h.art, cardW / 2, 36).setRotation(-Math.PI / 2);
      img.setScale(img.scale * 1.9);
      if (!ok) img.setTint(0x333333);
      btn.container.add([img, text(this, cardW / 2, 74, ok ? h.name.replace('Cmdr. ', '').replace('Sgt. ', '').replace('Lt. ', '') : `🔒 Win ${req}`, 11, ok ? Palette.uiText : Palette.uiDim, '800').setOrigin(0.5)]);
      btn.setEnabled(ok);
      btn.onTap = () => {
        save.selectedHero = id;
        refresh();
      };
      c.add(btn.container);
      buttons.push(btn);
      heroButtons.push({ id, btn });
    });
    if (!save.heroUnlocked(Heroes[save.selectedHero])) save.selectedHero = 'kastellan';
    refresh();

    const close = new Button(this, 20, ph - 74, 140, 56, 'CLOSE', 'secondary', '', 16);
    close.onTap = () => {
      c.destroy();
      this.briefing = null;
    };
    const deploy = new Button(this, pw - 20 - 220, ph - 74, 220, 56, 'DEPLOY', 'primary', '', 20);
    deploy.onTap = () => this.scene.start('Game', { missionId: m.id, hero: save.selectedHero });
    c.add([close.container, deploy.container]);
    buttons.push(close, deploy);
    this.briefing = { container: c, buttons };
  }
}
