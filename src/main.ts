import Phaser from 'phaser';
import { DPR, viewportSize } from './app/display';
import { setupPwa } from './app/pwa';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './ui/UIScene';

setupPwa();

const { width, height } = viewportSize();

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#0d0f0c',
  // Canvas at device resolution; CSS-scaled back down by 1/DPR (see app/display.ts).
  scale: {
    mode: Phaser.Scale.NONE,
    width: width * DPR,
    height: height * DPR,
    zoom: 1 / DPR,
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 }, // allows two-finger pinch + one spare
  disableContextMenu: true,
  scene: [BootScene, TitleScene, GameScene, UIScene],
});

// Dev-only handle for automated testing in the browser console.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// Keep the canvas matched to the screen (rotation, split view, Stage Manager on iPad).
let pending = 0;
const onResize = () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const s = viewportSize();
    game.scale.resize(s.width * DPR, s.height * DPR);
    game.scale.setZoom(1 / DPR);
  });
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// Prevent iOS double-tap-to-zoom and pinch-zoom of the page itself.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
