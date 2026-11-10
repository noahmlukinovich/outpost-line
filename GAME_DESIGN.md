# OUTPOST LINE — Game Design Document

> Working title. A top-down military sci-fi tower defense game for iPad (installable PWA).
> All factions, units, names and art are original.
>
> Status: **v0.8. M0–M3 and M4a built** (heroes, campaign map, stars, global tech tree; M4b adds missions 3–5) (new enemies, boss, Sensor Pylon, Mission 2), plus an effects pass and Endless mode. Fliers: bullets can hit them, grenades/flames can't, rockets/flak deal double. Items marked **[Q#]** are open questions (listed at the end).
> Items marked *(proposal)* fill gaps in the brief and can be changed.

---

## 1. Pitch

The **Frontier Defense Command (FDC)** holds the last outposts on the colony world of
Kestrel's Reach. An alien alliance called **the Choir** comes in waves. The Choir is several
species linked by a psionic "song": swarming beasts, shielded warrior-castes, armored
war-beasts, cloaked hunters and living airships.

You place marine squads anywhere you can build, fight over a few precious cover positions,
aim each squad's firing arc, and grow a small outpost economy (Supplies, Power, Command Cap).
Then you watch the defense hold, or break.

**Pillars**
1. **Positioning is the puzzle.** Free placement, facing arcs and limited cover make *where* and
   *which way* as important as *what*.
2. **Every enemy asks a question.** Each enemy type has a clear counter. Wave previews tell you
   what's coming so you can plan.
3. **Readable and punchy.** Door Kickers-style clarity (crisp silhouettes, visible arcs, hard
   light) with lots of juice (tracers, flashes, shake, shield pops).
4. **Tweakable.** All numbers live in data files you can edit.

---

## 2. Platform and tech

| Decision | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Catches mistakes at build time; data files get autocompletion and type checks. |
| Engine | **Phaser 4** (4.2.x) | Phaser 4 is now the current release: nearly the same API as Phaser 3, with a faster renderer and a better lighting/filter system for the Door Kickers look. |
| Build | **Vite** + **vite-plugin-pwa** | Instant dev reloads, simple static build, generates the service worker and manifest for us. |
| Hosting | **GitHub Pages** (`noahmlukinovich/outpost-line`, public) via a GitHub Actions workflow | Free HTTPS (needed for PWA install and offline mode); deploys on every push to `main`. |
| Saves | Small `SaveSystem` module over **localStorage** (versioned JSON, with migrations) | Save data is tiny (a few KB). localStorage is simplest; the module hides it, so switching to IndexedDB later only touches one file. |
| Tests | **Vitest** for simulation/data tests | The simulation is plain TS (see §9), so balance math and wave logic can be unit-tested without a browser. |
| Audio | Procedural placeholder SFX via WebAudio (sfxr-style generator) | No licensing issues; can be replaced through the asset manifest later. |

**iPad specifics**
- Manifest: `display: fullscreen`, `orientation: landscape`, plus Apple meta tags
  (`apple-mobile-web-app-capable`, status-bar style, touch icons). The UI respects
  safe-area insets so nothing hides under rounded corners.
- iOS only allows audio after a user gesture, so the title screen has a "Tap to deploy" button
  that also unlocks audio.
- Pinch-zoom/double-tap-zoom of the *page* is disabled so gestures go to the game.
- **Target devices:** iPad Pro (M5) and **iPad mini** (the mini's ~1024×768pt landscape screen is the
  layout baseline: HUD must fit and units must stay readable there).
- **Testing over local network (dev machine: Chromebook, Linux dev environment):** `npm run dev:lan` plus
  ChromeOS port forwarding for port 5173; see README. Gameplay works
  over plain `http://192.168.x.x:5173`, but **service workers and install need HTTPS**. To test
  those during development we'll use one of two options (set up in M1):
  (a) a free temporary HTTPS tunnel (e.g. `cloudflared`), the easiest; or
  (b) `mkcert` with its root certificate installed on the iPad, which takes more setup but works offline.
  For day-to-day work: plain LAN HTTP for fast iteration, GitHub Pages for "real install" testing.

**Performance budget (60 fps on recent iPad)**
- Object pools for enemies, projectiles, tracers, particles, damage numbers and decals. No
  `new` in the per-frame hot path.
- A spatial hash grid for target lookups instead of checking every squad against every enemy.
- Texture atlases (one or a few) to keep WebGL draw calls low.
- Fixed simulation tick (see §9), so 2x speed runs more ticks and does not need bigger time steps.
- A dev-only performance overlay (FPS, entity counts, pool usage).

---

## 3. Core loop

```
Mission start → Build phase (place/upgrade, wave preview)
     → Wave (fight; place/upgrade/use powers anytime; call next wave early for a bonus)
     → Wave cleared (wave bonus + Depot payouts) → repeat → Victory / Defeat
→ Stars → Campaign map → Global tech tree → next mission
```

- **Lives:** the outpost has **Integrity** (default 20). Each enemy that reaches the exit costs
  integrity based on its size (Swarmer 1, Brute 3, Boss 20). At 0 you lose.
- **Stars** *(proposal, Kingdom Rush-style):* win = 1★, integrity ≥ 50% = 2★, integrity ≥ 90% = 3★.
  Challenge modes award their own badge/star.
- **Speed:** Pause, 1x, 2x (maybe 3x later). You can still place and upgrade while paused.
- **Call wave early:** a countdown ring at each spawn point. Tapping it starts the wave now and pays
  bonus Supplies scaled by the time remaining, and shortens commander power cooldowns a little.

---

## 4. Map and placement

### 4.1 Map contents (all defined in data)
- **Paths:** one or more polylines from spawn points to the exit, optionally branching (waves
  assign each group to a path). The path corridor has a width and is never buildable.
- **Flight lanes:** separate polylines for fliers (often straight-ish lines that cut corners).
- **Terrain zones:** polygons tagged `buildable`, `blocked` (cliffs, water, wrecks), `slow`
  (mud/rubble that slows enemies, *proposal*).
- **Cover points:** fixed positions with a type, radius and bonuses (see 4.3).
- **Decor:** props, lights and shadow casters (visual only).
- **Exit / outpost gate:** the base. Enemies that reach it cost integrity.

### 4.2 Free placement
- Each unit has a circular **footprint**. Placement is valid if the footprint is fully inside a
  buildable zone, clear of the path corridor, and not overlapping another footprint.
- While placing, a ghost shows **green/red** validity, the range circle and the firing arc. Cover
  points glow when the ghost is near them and **snap** the ghost into the cover slot.
- Touch flow: tap a unit card → drag the ghost (it floats above your finger so you can see it)
  → lift to preview → tap ✔ to confirm or ✖ to cancel. Accidental finger lifts never spend money.

### 4.3 Cover points
| Cover | Damage reduction | Range bonus | Notes |
|---|---|---|---|
| Sandbags | 25% | +0% | Common, cheap to fight over |
| Trench | 35% | +0% | Also hides squad from Brute charge targeting (*proposal*) |
| Ruins | 30% | +10% | Elevated rubble |
| Bunker | 50% | +15% | Rare, 1–2 per map, best spots |

- One squad per cover point. Cover is drawn with a strong silhouette and an outline that shows
  when it's empty, so it stands out at a glance.
- Vehicles (Motor Pool) **can't use cover**, but they have built-in armor.
- *(proposal)* Some cover is **destructible**: heavy enemy fire/explosions degrade bunkers →
  ruins → rubble over a mission. **[Q3]**

### 4.4 Facing, arcs and rally points
- Every squad has a **facing** and a **firing arc** (e.g. Rifle 140°, Sniper 60°, Heavy 100°,
  Engineers 360° for heal/turret logic). It only shoots targets inside the arc **and** range. The arc
  is drawn as a soft translucent cone, Door Kickers-style.
- **Rotate:** select a squad → drag the rotation handle on the arc's edge. Snaps to 15° steps.
  The arc goes wide when the squad is selected and fades to a subtle wedge otherwise.
- **Rally point:** a squad is anchored where you placed it. Its troopers stand at a **rally point**
  you can drag anywhere buildable within a **leash radius** of the anchor. This lets you
  shuffle a squad into nearby cover, tuck it behind a wall, or (for close-range units) step right
  up to the path to **block**. **[Q1]**
- *(proposal)* **Blocking:** melee enemies (Brutes, some Swarmers) stop to fight a squad whose
  rally point is within ~1 tile of the path, like Kingdom Rush barracks. Ranged enemies keep
  walking and shoot squads in range as they pass.

---

## 5. Resources and economy

| Resource | Sources | Spent on |
|---|---|---|
| **Supplies** | Kills, wave-clear bonus, call-early bonus, Supply Depots | Units, upgrades, abilities, buildings |
| **Power** | Reactors (each gives +N power; upgradeable) | Not spent: **total Power is a threshold** that unlocks tiers |
| **Command Cap** | Base cap from mission + global tech; *(proposal)* Command Relay building | Each squad uses 1–3 cap (vehicles more) |

- **Power tiers** *(proposal)*: Tier 1 = 0, Tier 2 (upgrades III and specializations) = 10 power,
  Tier 3 (Motor Pool, spec abilities tier 2) = 25 power. Reactors cost Supplies and a
  building footprint but use no Command Cap. This sets up the classic "eco vs. defense" choice.
- **Supply Depot:** pays out at the end of each cleared wave (I/II/III: 25/45/70, *placeholder*).
  Buying it early is a gamble that pays off later.
- **Selling:** 70% refund of everything spent (100% if sold during the same build phase it was
  placed, so mistakes can be undone without penalty, *proposal*).
- Buildings (Depots, Reactors) are enemy-free targets in M1/M2. Later, some enemies (Stalkers)
  could target them. **[Q4]**

---

## 6. Combat model

Simple enough to reason about, deep enough for real counters. All values are in data.

- **Damage types:** `ballistic`, `ap` (armor-piercing), `explosive`, `fire`, `energy`.
- **Armor** (enemy stat, 0–100%): reduces incoming damage by `armor × (1 − pierce)`, where
  `pierce` comes from the weapon/damage type (ballistic 0, ap 0.8, explosive 0.4, …).
- **Shields:** a separate HP pool on top of health. Shields absorb damage first, regenerate after
  N seconds without being hit, and take multipliers by damage type (energy ×1.5, AP sniper ×2,
  fire ×0.5). Shield break = big blue shatter effect and a short stun.
- **Status effects:** slow, stun, burn (DoT), suppressed (lower enemy fire rate), marked (+X% damage taken),
  revealed (for cloaked units). All pooled, all data-driven.
- **Squads have HP** (shown as trooper pips). Cover reduces damage taken. Lost troopers
  **reinforce** for free over time when out of combat. A fully wiped squad is "Down" and
  re-deploys after a timer (it isn't lost). **[Q2]**
- **Targeting priority** per squad (tap to cycle): *First* (closest to exit), *Strongest*,
  *Weakest*, *Closest*, *Flier* (where applicable).
- **Veterancy:** squads earn XP from kills and assists. Ranks ★/★★/★★★ give +5% damage, +5% rate of fire,
  +10% HP each *(placeholder)*. Selling loses veterancy.

---

## 7. Content

### 7.1 FDC squads (player units)

Every unit: **I → II → III** (III needs Tier 2), then **branches** into one of two specializations,
each with **2–3 purchasable abilities** (passive or auto-cast; a few are tap-to-use).

| Base unit | Role | Spec A | Spec B |
|---|---|---|---|
| **Rifle Squad** (4 troopers) | Cheap generalist, decent vs. light | **Assault Team**: short range, high DPS. *Incinerator* (fire cone DoT, auto-cast), *Breach Charges* (stun grenade), *Hold the Line* (block more enemies) | **Marksman Team**: long range, AP rounds. *Tungsten Rounds* (+pierce), *Overwatch* (first shot on new target crits), *Steady Aim* (+range in cover) |
| **Heavy Weapons** (2-crew) | Area/sustained fire | **Rocket Team**: anti-armor splash, **hits fliers**. *Tandem Warheads*, *Lock-On Salvo* (multi-target vs. fliers), *Cluster Payload* | **Gatling Team**: suppression, slows swarms. *Spin-Up* (rate builds while firing), *Shredder Belts* (slow), *Suppressive Fire* (enemy fire rate −50% in arc) |
| **Sniper** (1 + spotter) | Single-target, very long range, narrow arc | **Spotter Team**: *Mark Target* (+25% dmg taken), *Thermal Optics* (**reveals cloaked** in radius), *Call Correction* (marked kills refund supplies) | **Anti-Materiel**: piercing shots through lines. *Shield Breaker* (×3 vs. shields), *Overpenetration* (hits +2 enemies), *Heavy Caliber* (stun brutes) |
| **Engineers** (3) | Support, light self-defense | **Medic Post**: heals squads in radius. *Field Surgery* (faster reinforce), *Stim Packs* (rate of fire aura), *Combat Medic* (revive Down squad instantly, cooldown) | **Turret Crew**: deploys auto-turrets nearby. *Twin Turrets*, *Repair Drones* (repairs vehicles/turrets), *Flak Kit* (turrets hit fliers) |
| **Motor Pool** (Tier 3, building that fields a vehicle) | Heavy late-game | **Siege Tank**: slow, huge AoE, can't hit fliers. *Bunker Buster*, *Siege Mode* (+range, can't rotate), *Reactive Armor* | **AA Walker**: shreds fliers and dropships. *Flak Burst*, *Interceptor Pods* (hit dropships before unload), *Target Uplink* (nearby squads +range vs. fliers) |

Plus buildings: **Supply Depot** (I–III), **Reactor** (I–III), *(proposal)* **Command Relay** (+cap).

### 7.2 The Choir (enemies)

| Enemy | Role / question it asks | Counter |
|---|---|---|
| **Skitter** (swarmer) | Cheap, fast, comes in packs of 10–30 | Splash: Gatling, Rocket, Incinerator, Siege |
| **Warden** (shielded warrior) | Regenerating energy shield, ranged | Burst/AP to break the shield, then focus fire. Anti-Materiel, EMP |
| **Ironback** (armored brute) | 70% armor, melee; **berserk** under 30% HP (+speed, +damage) | AP: Marksman, Rocket, Anti-Materiel. Block it away from soft squads |
| **Veilstalker** (cloaked) | Untargetable unless revealed; picks off squads | Spotter's Thermal Optics, *(proposal)* a cheap Sensor Pylon building, EMP pulse reveals |
| **Skyray** (flier) | Ignores ground path, follows flight lanes | Rocket, AA Walker, Flak turrets, Marksman (*small bonus*) |
| **Tender** (alien engineer) | Heals and re-shields nearby Choir | Snipe it first (priority targeting), long range |
| **Brood Barge** (dropship) | Flies in, **unloads a squad mid-path** at a drop point | Kill before unload (AA, Interceptor Pods) or cover drop zones |
| **Bosses** | **Colossus Strider** (giant walker; stomps squads, sheds armor plates in phases); **Hive Carrier** (flying, spawns Skyrays) | Mixed defense, commander powers |

*(proposal)* A few elite variants (e.g. "Psion Warden" with a shield aura) can add late-campaign variety
without new mechanics.

### 7.3 Commander powers (cooldown, upgradeable in tech tree)
- **Orbital Strike:** tap a point → short delay with a target marker → massive AoE.
- **Drop-Pod Reinforcements:** tap a buildable point → a temporary Rifle squad (lasts 30 s,
  ignores Command Cap).
- **Airstrike:** draw a line → bombing run along it after a short delay.
- **EMP:** tap a point → stuns vehicles/bosses, strips shields, reveals cloak in radius.

### 7.4 Heroes (M4)
One per mission, chosen before deployment. Moved directly (tap hero → tap destination, or drag).
Levels 1–10 during the mission (XP from kills), and respawns after death.
- **Cmdr. Rhea Kastellan:** command-style hero. Rally Cry (aura rate of fire), Tactical Scan (reveal/mark).
- **Sgt. "Bulwark" Okonjo:** a heavy tank-style hero. Shield Wall (blocks a path segment), Ground Slam.
- **Lt. Mara Venn:** recon-style hero. Long-range rifle, cloak, places mines.
- More heroes are unlocked over the campaign.

---

## 8. Progression and modes (M4–M5)
- **Campaign map:** a node map of ~12–15 missions across 3 regions, each 1–3★. New units and heroes unlock at
  set missions (e.g. Sniper after mission 2, Motor Pool after mission 8).
- **Global tech tree:** stars buy permanent upgrades. One branch per unit family, plus
  Economy, Commander Powers and Heroes. Respec is free (no penalty for experimenting, *proposal*).
- **Challenge modes per map** (unlocked after a 3★ win): **Heroic** (tougher waves, integrity 1) and
  **Iron** (one big wave, fixed budget, no call-early, limited unit types).
- **Endless Survival:** scaling waves on select maps, with a local high-score table.
- **Settings:** damage numbers on/off, screen shake intensity, SFX/music volume, left-handed UI mirror,
  reduce motion.

---

## 9. Architecture

**Key decision:** the *simulation* (game state and rules) is plain TypeScript with no Phaser
dependency. Phaser only *draws* that state and turns input into commands. This keeps logic
testable, makes 2x speed and pause trivial, and lets input methods (touch, gamepad) share one
command interface.

```
src/
  data/           ← YOU EDIT THESE: units.ts, enemies.ts, upgrades.ts, waves/, powers.ts, balance.ts
  maps/           ← map JSON (Tiled-compatible) + loader/validator
  sim/            ← pure game logic: World, systems (movement, targeting, combat, status,
                    economy, waves), pools, spatial hash, seeded RNG. No Phaser imports.
  render/         ← Phaser scenes/views that mirror sim entities; effects (tracers, flashes, shake)
  input/          ← InputRouter → "intents" (select, place, rotate, drag rally, pan/zoom)
                    adapters: TouchInput (M1), GamepadInput (M5, virtual cursor)
  ui/             ← HUD, build menu, unit panel, wave preview, menus (Phaser UI scene)
  assets/         ← asset manifest + placeholder art generator + audio
  save/           ← SaveSystem (versioned, migratable)
  app/            ← boot, scene flow, PWA registration
```

- **Fixed timestep:** sim runs at 30 ticks/sec. Rendering interpolates at display rate. 2x speed =
  2 ticks per tick interval. Seeded RNG means the same wave plays out the same way, which helps
  balance testing.
- **Commands:** UI and input never change state directly. They send commands like
  `PlaceUnit`, `Upgrade`, `Rotate`, `MoveRally`, `Sell`, `CastPower`, `CallWave` to the sim. The sim
  validates them, so invalid actions (not enough supplies, blocked spot) are rejected in one place.
- **Events:** the sim emits events (`EnemyKilled`, `ShieldBroken`, `ShotFired`, …). The renderer and
  audio subscribe to them for effects, so juice never touches game rules.

### 9.1 Data files (balance)
Typed TS config objects, e.g.:
```ts
export const units = {
  rifle: {
    name: 'Rifle Squad', cost: 70, cap: 1, footprint: 18, arc: 140, troopers: 4,
    tiers: [
      { range: 140, damage: 6, rof: 2.0, dmgType: 'ballistic', hp: 40 },
      { cost: 60, range: 150, damage: 9, rof: 2.2, hp: 50 },
      { cost: 110, power: 10, range: 160, damage: 13, rof: 2.4, hp: 60 },
    ],
    specs: ['assault', 'marksman'],
  },
} satisfies Record<string, UnitDef>;
```
Why TS instead of raw JSON: comments explaining each number, autocompletion, and the build
fails with a clear message if you mistype a field. A dev-mode check also validates cross
references (e.g. a wave referencing an enemy ID that doesn't exist).

### 9.2 Map format (Tiled-compatible)
Maps are Tiled `.tmj` (JSON) files using **object layers** only (no tile art required):
- `paths` layer: polylines named `path_a`, `path_b` (properties: `width`)
- `flight` layer: polylines
- `zones` layer: polygons with property `kind = buildable | blocked | slow`
- `cover` layer: points with `coverType = sandbags | trench | ruins | bunker`
- `spawns`, `exit`, `drop_points`, `decor`, `lights` layers
- A background image layer (or generated ground)

You'll be able to open these in [Tiled](https://www.mapeditor.org/) (free) and drag points around.
A loader converts them into the sim's map model and validates them (e.g. cover not on a path).
Waves are separate data files per map (`waves/outpost-01.ts`), so maps and balance stay decoupled.

### 9.3 Asset pipeline
`assets/manifest.json` maps every **art ID** (`unit.rifle.t1`, `enemy.skitter`, `fx.muzzle`,
`sfx.rifle_shot`) to a source:
```json
{ "enemy.skitter": { "type": "atlas", "atlas": "kenney_aliens", "frame": "alien_03.png",
                     "scale": 0.5, "rotationOffset": 90, "shadow": true } }
```
- Source types: `generated` (built-in vector placeholder), `image`, `atlas`, `spritesheet` (+ animations), `sound`.
- Placeholder art is drawn in code with Phaser Graphics and baked into textures at boot,
  so it goes through **exactly the same path** as real sprites. To use a sprite pack, drop files into
  `public/assets/packs/<pack>/` and edit the manifest. No code changes.
- Missing art falls back to the placeholder, so the game never breaks.

### 9.4 Look and feel (placeholder art direction)
- **Palette:** desaturated ground (olive/ash/rust per map biome); FDC units in **cool white/slate
  with cyan accents**; Choir in **bio-magenta/amber with glowing cores**; UI in amber-on-charcoal
  military HUD style.
- **Lighting:** dark ambient overlay + additive light sprites (floodlights, muzzle flashes,
  burning wrecks, glowing alien cores); every unit casts an offset soft shadow; firing arcs as
  lit cones. A vignette frames the battlefield.
- **Juice list:** muzzle flashes, tracers (pooled line sprites), shell casings, hit sparks, white
  hit-flash on damage, shield shimmer + shatter, explosions with scorch decals that fade, screen
  shake (scaled, toggleable), floating damage numbers (toggleable), kill pop + supply coin fly-to-HUD,
  slow-mo flash on boss kill.

---

## 10. Controls

**Touch (M1)**
| Action | Gesture |
|---|---|
| Place unit | Tap card in build bar → drag ghost → ✔ |
| Select | Tap unit (opens radial/side panel: upgrade, spec, abilities, sell, targeting) |
| Rotate | Drag the arc handle |
| Move rally point | Drag the rally flag (stays within leash circle) |
| Pan / zoom | One-finger drag on empty ground / two-finger pinch |
| Commander power | Tap power button → tap target (or draw line for Airstrike) |
| Speed / pause | Top-right buttons |

All touch targets are at least 48 pt. Info panels slide in from the side so your hand doesn't cover the map.

**Gamepad (M5):** a virtual cursor (left stick), A = tap, B = cancel, right stick = pan,
ZL/ZR = zoom, L/R = cycle selected squad, X = upgrade, Y = powers wheel, +/− = pause/speed.
Input is abstracted from M1, so this is an added adapter, not a rewrite.

---

## 11. Milestones

Your suggested order is good. My changes: **an M0 setup step**, so the deploy/install pipeline works
from day one; **selling and save settings moved earlier** since they're cheap; and **destructible
cover** deferred to M5.

| # | Goal | Contents | You can test |
|---|---|---|---|
| **M0** ✅ | Pipeline | Vite+TS+Phaser project, PWA (manifest, service worker, icons), GitHub Pages deploy action, empty "Tap to deploy" scene, README | Install on iPad home screen, launches full-screen landscape, works in airplane mode |
| **M1** ✅ | Core loop | Map 1 (Tiled JSON), sim core (fixed tick, pools, spatial hash), free placement + cover, facing arcs + rotate, rally points, **Rifle + Heavy Weapons I→III**, **Skitter / Warden / Ironback**, supplies, 10 waves with preview, call-early, integrity, win/lose, pause/1x/2x, selling, pan/zoom, core juice + placeholder SFX, asset manifest, settings saved | A full mission with real decisions |
| **M2** ✅ | Depth | Specializations + abilities for Rifle/Heavy, **Sniper + Engineers**, Power/Reactors + tiers, Supply Depots, Command Cap, veterancy, targeting priorities | Economy vs. defense choices; spec builds feel different |
| **M3** ✅ | Threats | Veilstalker, Skyray, Tender, Brood Barge, Colossus boss, Motor Pool + both vehicles, 4 commander powers, map 2 | Each enemy forces a counter; boss fight |
| **M4** (a ✅, b next) | Campaign | Hero system + 2–3 heroes, campaign map, stars, global tech tree, full SaveSystem, unlock flow, maps 3–5 | Play a multi-mission arc, progress persists |
| **M5** | Breadth and polish | More maps (to ~12), Heroic/Iron, Endless + high scores, gamepad, Hive Carrier boss, destructible cover, art/audio pass, sprite-pack swap demo, performance pass | "Feels like a real game" |

At the end of each milestone you get: what changed, how to run it locally and on the iPad, and a
**"what to look for" checklist**. I'll commit at each working step.

---

## 12. Open questions

- ~~[Q1] Rally point meaning~~ **Decided:** anchor + leash; troopers stand at the rally point; close-range squads can block.
- ~~[Q2] Squad losses~~ **Decided:** squads go "Down" temporarily when wiped and redeploy after a timer.
- **[Q3] Destructible cover:** want it (in M5), or should cover stay permanent for clearer planning?
- **[Q4] Should any enemies attack buildings** (Depots/Reactors), or do only squads and the gate take damage?
- ~~[Q5] GitHub~~ **Decided:** `noahmlukinovich/outpost-line` (public, for free Pages).
- ~~[Q6] Devices~~ **Decided:** Chromebook for dev; iPad mini + iPad Pro M5 for play.
- **[Q7] Title:** happy with "Outpost Line", or do you have a name in mind?
- **[Q8] Difficulty feel:** Kingdom Rush (forgiving, chill) or Bloons-late-game (punishing)? I'd
  default to KR-like on Normal, with Heroic for the hardcore.
- **[Q9] Music:** placeholder silence/ambient drone is fine for now? (Real music can be added through the manifest.)
