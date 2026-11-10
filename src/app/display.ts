/**
 * Display helpers.
 *
 * Retina strategy: the canvas is rendered at full device resolution (CSS size × DPR) so lines
 * and text stay crisp on iPad. Each scene's camera is zoomed by DPR, so game code works in CSS
 * pixels ("points"), the same unit Apple uses for touch-target guidelines (≥44–48pt).
 */
import Phaser from 'phaser';

/** Device pixel ratio, capped at 2 (iPads are 2; higher only costs GPU fill-rate). */
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

export function viewportSize(): { width: number; height: number } {
  const el = document.documentElement;
  return { width: el.clientWidth, height: el.clientHeight };
}

/** Safe-area insets (notch / rounded corners / home indicator), in CSS pixels. */
export function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

/** Make a camera work in CSS pixels: origin top-left, zoomed by DPR, covering the canvas. */
export function fitCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
  const game = cam.scene.game;
  cam.setOrigin(0, 0);
  cam.setSize(game.scale.width, game.scale.height);
  cam.setZoom(DPR);
}

/** Logical (CSS-pixel) size of the game view. */
export function logicalSize(game: Phaser.Game): { width: number; height: number } {
  return { width: game.scale.width / DPR, height: game.scale.height / DPR };
}

/** True when launched from the iPad home screen (installed PWA) rather than a Safari tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
