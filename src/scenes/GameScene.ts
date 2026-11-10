/**
 * The battle. Owns the simulation (World) and drives it with a fixed timestep:
 * real time is accumulated and the World steps exactly 30×/second (×2 at double speed), and the
 * renderer interpolates between steps. The HUD lives in a separate UIScene drawn on top.
 */
import Phaser from 'phaser';
import { DPR } from '../app/display';
import { sfx } from '../audio/Sfx';
import { getMission } from '../data/missions';
import { Controller } from '../game/Controller';
import { CameraRig } from '../input/CameraRig';
import { InputRouter } from '../input/InputRouter';
import { WorldRenderer } from '../render/WorldRenderer';
import { save } from '../save/SaveSystem';
import { World } from '../sim/World';
import type { UIScene } from '../ui/UIScene';

export const HUD = { top: 66, bottom: 104 };

export interface GameSceneData {
  missionId: string;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  view!: WorldRenderer;
  controller!: Controller;
  rig!: CameraRig;
  router!: InputRouter;
  missionId = 'outpost01';
  paused = false;
  speed = 1;
  private acc = 0;
  private resultSaved = false;
  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.paused = true;
      sfx.suspend();
    } else sfx.resume();
  };

  constructor() {
    super('Game');
  }

  create(data: GameSceneData): void {
    this.missionId = data?.missionId ?? 'outpost01';
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.resultSaved = false;

    this.world = new World(getMission(this.missionId), (Date.now() & 0xffffff) + 1);
    this.view = new WorldRenderer(this, this.world);
    this.applySettings();
    this.controller = new Controller(this, this.world);
    this.rig = new CameraRig(this.cameras.main, this.world.map.width, this.world.map.height, HUD);

    this.scene.launch('UI', { gs: this });
    const ui = this.scene.get('UI') as UIScene;
    this.router = new InputRouter(this, this.rig, this.controller, { hitTest: (x, y) => ui.hitTest(x, y) });

    this.scale.on('resize', this.onResize, this);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.scene.stop('UI');
    });
  }

  applySettings(): void {
    const s = save.settings;
    this.view.fx.damageNumbers = s.damageNumbers;
    this.view.fx.screenShake = s.screenShake;
    sfx.setEnabled(s.sound);
  }

  private onResize(): void {
    this.rig.resize(HUD);
  }

  restart(): void {
    this.scene.restart({ missionId: this.missionId });
  }

  quit(): void {
    this.scene.stop('UI');
    this.scene.start('Title');
  }

  /** Called from the UI when a card is tapped: start placing at the middle of the view. */
  beginPlacementAtViewCenter(unitId: string): void {
    const c = this.rig.screenToWorld(this.scale.width / 2, this.scale.height / 2);
    this.controller.beginPlacement(unitId, c.x, c.y);
  }

  /** Move the ghost to a screen point given in CSS pixels (dragging from a card). */
  moveGhostToScreen(cssX: number, cssY: number): void {
    const w = this.rig.screenToWorld(cssX * DPR, cssY * DPR);
    this.controller.moveGhost(w.x, w.y);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    const world = this.world;
    let gameDt = 0;
    if (!this.paused && !world.isOver) {
      gameDt = dt * this.speed;
      this.acc += gameDt;
      let steps = 0;
      while (this.acc >= world.dt && steps < 8) {
        world.step();
        this.acc -= world.dt;
        steps++;
      }
      if (steps === 8) this.acc = 0; // device hiccup: drop time rather than spiral
    }
    const alpha = Math.min(1, this.acc / world.dt);
    this.view.selected = this.controller.selected;
    this.view.update(alpha, this.paused ? 0 : world.isOver ? dt : gameDt, !!this.controller.ghost);
    this.controller.update(dt);

    if (world.isOver && !this.resultSaved) {
      this.resultSaved = true;
      this.controller.cancelPlacement();
      this.controller.select(null);
      if (world.state === 'won') save.recordMission(this.missionId, world.stars, world.integrity);
    }
  }
}
