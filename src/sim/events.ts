/**
 * Things the simulation tells the outside world about. The renderer and audio implement this to
 * make effects; the simulation never knows about them. Methods take plain arguments (no event
 * objects) so firing hundreds of shots per second allocates nothing.
 */
import type { Building, Enemy, Projectile, Squad, Trooper, Turret } from './entities';

export interface SimEvents {
  shot?(squad: Squad, trooper: Trooper, toX: number, toY: number, hit: boolean): void;
  turretShot?(squad: Squad, turret: Turret, toX: number, toY: number): void;
  shellFired?(squad: Squad, trooper: Trooper, shell: Projectile): void;
  flame?(squad: Squad, trooper: Trooper, angle: number, range: number, arcDeg: number): void;
  explosion?(x: number, y: number, radius: number, kind: 'shell' | 'rocket'): void;
  enemyDamaged?(enemy: Enemy, amount: number, shieldHit: boolean): void;
  shieldBroken?(enemy: Enemy): void;
  enemyKilled?(enemy: Enemy, bounty: number): void;
  enemyLeaked?(enemy: Enemy): void;
  enemyBerserk?(enemy: Enemy): void;
  enemySpawned?(enemy: Enemy): void;
  enemyShot?(enemy: Enemy, squad: Squad, trooper: Trooper): void;
  enemyMelee?(enemy: Enemy, squad: Squad, trooper: Trooper): void;
  trooperLost?(squad: Squad, trooper: Trooper): void;
  trooperRestored?(squad: Squad, trooper: Trooper): void;
  squadDown?(squad: Squad): void;
  squadRestored?(squad: Squad, revived: boolean): void;
  squadPlaced?(squad: Squad): void;
  squadUpgraded?(squad: Squad): void;
  squadSpecialized?(squad: Squad): void;
  abilityBought?(squad: Squad, abilityName: string): void;
  squadPromoted?(squad: Squad): void;
  squadRemoved?(squad: Squad, refund: number): void;
  buildingPlaced?(b: Building): void;
  buildingUpgraded?(b: Building): void;
  buildingRemoved?(b: Building, refund: number): void;
  income?(b: Building, amount: number): void;
  techChanged?(tech: number): void;
  waveStarted?(index: number, earlyBonus: number): void;
  waveCleared?(index: number, bonus: number): void;
  gameOver?(won: boolean): void;
}
