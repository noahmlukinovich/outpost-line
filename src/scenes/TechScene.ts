/**
 * Global tech tree: spend stars on permanent upgrades. Nodes unlock top to bottom per branch.
 * Respec (free) refunds everything.
 */
import Phaser from 'phaser';
import { fitCamera, logicalSize, safeAreaInsets } from '../app/display';
import { Palette, css } from '../assets/palette';
import { sfx } from '../audio/Sfx';
import { TECH_BRANCHES, Tech } from '../data/tech';
import { save } from '../save/SaveSystem';
import { TapRouter } from '../ui/router';
import { ActionButton, Button, setText, text } from '../ui/widgets';

export class TechScene extends Phaser.Scene {
  private W = 0;
  private H = 0;
  private router!: TapRouter;
  private header!: Phaser.GameObjects.Text;
  private nodes: { id: string; btn: ActionButton }[] = [];
  private toastText!: Phaser.GameObjects.Text;
  private toastT = 0;

  constructor() {
    super('Tech');
  }

  create(): void {
    fitCamera(this.cameras.main);
    ({ width: this.W, height: this.H } = logicalSize(this.game));
    const inset = safeAreaInsets();
    this.router = new TapRouter(this);
    this.nodes = [];
    this.add.rectangle(0, 0, this.W, this.H, 0x12140f).setOrigin(0);
    this.add.image(0, 0, 'fx.vignette').setOrigin(0).setDisplaySize(this.W, this.H);

    const top = 12 + inset.top;
    const back = this.router.add(new Button(this, 12 + inset.left, top, 92, 46, '◀ BACK', 'dark', '', 15));
    back.onTap = () => this.scene.start('Campaign');
    text(this, this.W / 2, top + 14, 'GLOBAL TECH', 24, Palette.uiAmber, '900').setOrigin(0.5).setLetterSpacing(5);
    this.header = text(this, this.W / 2, top + 40, '', 14, Palette.uiText, '700').setOrigin(0.5);
    const respec = this.router.add(new Button(this, this.W - 12 - inset.right - 130, top, 130, 46, 'RESPEC', 'danger', 'free refund', 14));
    respec.onTap = () => {
      save.respec();
      this.toast('All stars refunded');
      this.refresh();
    };

    const cols = TECH_BRANCHES.length;
    const left = 12 + inset.left, gap = 6;
    const colW = (this.W - left * 2 - gap * (cols - 1)) / cols;
    TECH_BRANCHES.forEach((branch, ci) => {
      const x = left + ci * (colW + gap);
      text(this, x + colW / 2, top + 72, branch.toUpperCase(), 13, Palette.fdcAccent, '900').setOrigin(0.5).setLetterSpacing(2);
      let y = top + 90;
      for (const node of Tech.filter((t) => t.branch === branch)) {
        const btn = this.router.add(new ActionButton(this, colW));
        btn.compact();
        btn.setPosition(x, y);
        btn.onTap = () => {
          if (save.buyTech(node.id)) {
            sfx.upgrade();
            this.toast(`${node.name} unlocked`);
          } else {
            this.toast(save.checkTech(node.id));
            sfx.error();
          }
          this.refresh();
        };
        this.nodes.push({ id: node.id, btn });
        y += 110;
      }
    });
    this.toastText = text(this, this.W / 2, this.H - 30 - inset.bottom, '', 16, Palette.uiText, '800').setOrigin(0.5);
    this.refresh();
  }

  private refresh(): void {
    setText(this.header, `★ ${save.availableStars()} to spend  ·  ${save.totalStars()} earned  ·  stars come from missions and Endless`);
    for (const { id, btn } of this.nodes) {
      const node = Tech.find((t) => t.id === id)!;
      const reason = save.checkTech(id);
      const state = reason === 'Owned' ? 'owned' : reason === '' ? 'buy' : reason.startsWith('Requires') ? 'locked' : 'poor';
      btn.set(node.name, reason === 'Owned' ? '✓' : '', `${reason === 'Owned' ? '' : `${node.cost}★ · `}${node.desc}`, state, Palette.uiAmber);
      btn.enabled = true; // always tappable: tells you why if you can't buy it
    }
  }

  private toast(msg: string): void {
    setText(this.toastText, msg);
    this.toastT = 2;
  }

  update(_t: number, dms: number): void {
    this.toastT -= dms / 1000;
    this.toastText.setAlpha(Phaser.Math.Clamp(this.toastT * 2, 0, 1)).setColor(css(Palette.uiText));
  }
}
