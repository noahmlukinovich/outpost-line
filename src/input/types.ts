/**
 * The contract between input devices and the game. Touch (InputRouter) implements gestures on top
 * of it today; a gamepad cursor (M5) will call the same methods, so game logic never cares
 * where input came from.
 */
export interface PointerTarget {
  /** A press began at a world point. Return true if it grabbed something draggable (ghost, flag, handle). */
  pointerDown(x: number, y: number, touchRadius: number): boolean;
  /** A grabbed thing is being dragged to a world point. */
  dragMove(x: number, y: number): void;
  /** The drag finished. */
  dragEnd(x: number, y: number): void;
  /** A quick tap that didn't drag or grab. */
  tap(x: number, y: number, touchRadius: number): void;
}

/** Anything that can tell whether a screen point (CSS px) is covered by UI. */
export interface UiHitTester {
  hitTest(x: number, y: number): boolean;
}
