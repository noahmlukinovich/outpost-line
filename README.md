# Outpost Line

A top-down military sci-fi tower defense game for iPad, built as an installable web app (PWA).
Design: see [GAME_DESIGN.md](GAME_DESIGN.md).

**Play:** https://noahmlukinovich.github.io/outpost-line/ (live once GitHub Pages is set up, see below)

**Status:** Milestone 2: one full mission (Firebase Ridgeline, 10 waves) with four squad types
(Rifle, Heavy Weapons, Sniper, Engineers), eight specializations with abilities, Supply Depots,
Reactors (Power → Tech levels), Command Cap and veterancy.

---

## Install on your iPad

1. Open **Safari** on the iPad (it must be Safari; other browsers can't install web apps on iPadOS).
2. Go to https://noahmlukinovich.github.io/outpost-line/
3. Tap the **Share** button (square with an up arrow) → **Add to Home Screen** → **Add**.
4. Launch **Outpost Line** from the home screen. It opens full-screen with no Safari bars.
5. Tap **TAP TO DEPLOY** to turn on sound (iPadOS requires a tap before any audio).

**Offline:** after the first launch the whole game is cached on the iPad. Airplane mode works.

**Updates:** when a new version is deployed, an **"Update ready: tap to reload"** button
appears at the bottom of the screen the next time you open the app. Tap it to update. It never
reloads by itself, so an update can't interrupt a mission.

The tiny line of text at the bottom-left of the title screen shows the version, whether you're
in the installed app or a browser tab, whether offline mode is ready, the screen size, and the FPS.

**Campaign, heroes and tech (M4a):**
- **Title → CAMPAIGN** opens the map of Kestrel's Reach. Missions unlock in order; tap one for its
  briefing (enemies, new tools) and choose your **hero**, then DEPLOY.
- **Heroes** (one per mission, free, no Command Cap): tap the hero (or the portrait under the top
  bar), then tap anywhere, even the road, to move them. They level 1–10 from kills near them,
  have two abilities (buttons next to the portrait; the second unlocks at level 3) and respawn
  at the gate if they fall.
  - **Cmdr. Rhea Kastellan:** Rally Cry (squads fire faster) / Tactical Scan (mark + reveal).
  - **Sgt. "Bulwark" Okonjo** (win Mission 1): Shield Wall / Ground Slam.
  - **Lt. Mara Venn** (win Mission 2): Cloak / Proximity Mines.
- **Stars** (1–3 per mission; Endless gives 1/2/3 for reaching wave 10/20/30) buy permanent
  upgrades in the **Tech Tree**: Infantry, Heavy, Support, Armor, Economy, Command (powers),
  Heroes. Respec is free. Data: `src/data/heroes.ts`, `src/data/tech.ts`.

**Mission 2: Dustline Junction (M3a):** two roads that merge, a flight route (dashed magenta
arrows) and a dropship landing zone. New enemies:
- **Veilstalker**: cloaked. Can't be targeted unless revealed by a **Sensor Pylon** (new building,
  violet range circle) or a Spotter's Thermal Optics; it flickers into view briefly when it strikes.
- **Skyray**: flier that ignores the road. Bullets reach it; **grenades and flames can't**. Rockets
  and flak deal double. Aim some squads at the flight route!
- **Tender**: heals and re-shields nearby aliens. Kill it first.
- **Brood Barge**: dropship that hovers over the drop zone and unloads Skitters and Wardens.
- **Colossus Strider (boss)**: can't be blocked, stomps squads, sheds armor and calls
  reinforcements at 66% and 33% health (marks on its health bar).

**Vehicles & commander powers (M3b):**
- **Armored Car** (card, needs Tech 2, uses 2 Command Cap): tough AP autocannon, can't use cover,
  becomes a smoking wreck when destroyed and is rebuilt. At tier III (Tech 3) it becomes a
  **Siege Tank** (long-range artillery, can't hit fliers) or an **Anti-Air Walker** (flak, double
  damage to fliers and dropships).
- **Commander powers** (round buttons, bottom right; cooldowns shown as a sweep). Tap a power,
  then tap or drag on the map to aim:
  - **Orbital Strike**: lock-on, then a huge beam (hits fliers too).
  - **Airstrike**: drag a line; bombs walk along it (a tap bombs along the nearest road).
  - **EMP**: stuns (big enemies longer), strips shields, reveals cloaked enemies.
  - **Drop Pods**: a tier II Rifle Squad lands for 30 s, ignores Command Cap, can land on the road.
  Tune them in `src/data/powers.ts`.

**Endless mode:** tap **ENDLESS** on the title screen. Waves never stop; each has a theme
(Swarm, Shield line, Armored push, Combined assault), every 5th wave is a **surge**, and from
wave 8 the Choir gets tougher every wave. Your top 5 runs (waves survived, kills) are saved on
the device. Tune it in `src/data/endless.ts`.

---

## How to play (controls)

| Do this | Gesture |
|---|---|
| Place a squad | Tap a card at the bottom, then drag the ghost (or tap where it should go) and tap **✔**. Or drag straight from the card onto the map. Nothing is spent until ✔. |
| Use cover | Drop a squad near a glowing ring (sandbags, trench, ruins, bunker); it snaps in. Cover cuts damage taken and some cover adds range. |
| Select a squad | Tap it. The panel shows stats, **Upgrade**, **Target** priority and **Sell** (tap twice). |
| Aim (rotate the arc) | Drag the round amber handle in front of the selected squad. It snaps in 15° steps. |
| Move the rally point | Drag the blue flag. It stays inside the dashed leash circle. Put close-range squads beside the road to **block** melee enemies. |
| Pan / zoom | Drag empty ground / pinch with two fingers |
| Start / call waves | Tap **START WAVE**. Between waves, tap once for intel, again to **call early** for bonus supplies. |
| Pause, speed, settings | Top-right buttons: pause, 1×/2×, menu (damage numbers, shake, sound, restart). |

**Economy & tech (M2):**
- **Supply Depot** pays supplies at the start of every wave (upgrade it for more).
- **Reactor** provides Power. Power 6 = **Tech 2** (tier III upgrades and specializations),
  Power 15 = **Tech 3** (the strongest abilities). Locked items show 🔒 and what they need.
- **Command Cap** (top bar, people icon) limits how many squads you can field. Buildings are free.
- After tier III a squad picks one of two **specializations**, then buys up to three **abilities**.
- Squads earn **veterancy** stars from kills (+damage, +fire rate, +HP). Selling loses them.

Rules of thumb: Skitters swarm (use Heavy Weapons splash), Wardens have regenerating shields
and shoot back (focus fire, use cover), Ironbacks are heavily armored and go berserk when hurt
(explosives). Squads that get wiped out are **Down** for 12 s, then redeploy. Lost troopers
return on their own when the squad is out of combat. Selling before the next wave starts refunds 100%.

---

## Development

You need **Node.js 22+**. On a Chromebook, turn on the Linux development environment first:
Settings → About ChromeOS → Developers → Linux development environment → Turn on. Then in the
Linux terminal:

```bash
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Get the code and start the dev server:

```bash
git clone https://github.com/noahmlukinovich/outpost-line.git
cd outpost-line
npm install
npm run dev
```

Open http://localhost:5173 in Chrome. Saving a file reloads the game instantly.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on this machine only |
| `npm run dev:lan` | Dev server reachable from other devices on your Wi-Fi |
| `npm test` | Run unit tests |
| `npm run balance` | Simulate mission 1 with scripted builds and print a wave-by-wave report |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build (with the service worker active) |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |

**Art gallery:** with `npm run dev` running, open http://localhost:5173/gallery.html to see every
placeholder sprite enlarged (add `?zoom=6` to get closer). Useful when trying a sprite pack.

### Testing on the iPad over your Wi-Fi (from a Chromebook)

1. Run `npm run dev:lan`.
2. Let the iPad reach the Linux container: Settings → About ChromeOS → Developers → Linux
   development environment → **Port forwarding** → **Add**: port `5173`, TCP. Make sure it's switched on.
3. Find the Chromebook's IP: Settings → Network → Wi-Fi → (your network) → look for the IP address,
   e.g. `192.168.1.42`.
4. On the iPad (same Wi-Fi), open Safari at `http://192.168.1.42:5173`.

This is great for quick iteration. But the **offline/install** features need HTTPS, so they only
work from the GitHub Pages URL, which is how you test the real installed app. (Some school or
office Wi-Fi blocks device-to-device traffic; if the iPad can't connect, that's usually why.)

### The easy path: no local setup

You don't need to run anything locally. Every push to `main` automatically builds and deploys
to GitHub Pages in about 1–2 minutes. Open the app on the iPad and tap **Update ready**.

---

## Deploying (GitHub Pages): one-time setup

1. Create an **empty public** repository named `outpost-line` on GitHub (no README or license,
   we already have them).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` tests, builds and publishes.
   Watch progress under the repo's **Actions** tab.

---

## Project layout

```
src/
  data/       ← BALANCE: units.ts, enemies.ts, cover.ts, balance.ts, waves/, missions.ts
  maps/       ← MAPS: Tiled .tmj files + loader/geometry
  sim/        Game rules only (no graphics): World, entities, RNG, spatial hash, autoplay bot
  render/     Draws the sim: map, units, effects (all pooled)
  input/      Touch gestures → commands; camera pan/zoom (gamepad plugs in here in M5)
  game/       Controller: selection, placement ghost, handles
  ui/         HUD scene and widgets
  save/       Save system (settings + mission stars)
  audio/      Synthesized placeholder sound effects
  assets/     Palette, placeholder art, art registry
  scenes/     Boot, Title, Game
public/assets/manifest.json   ← which art each ID uses (sprite packs)
```

The simulation never imports Phaser: it runs at a fixed 30 steps/second, and the renderer
interpolates between steps. That's why 2× speed, pause and the headless balance tests are easy.

## Editing balance

All numbers live in `src/data/`, with a comment on every field:

- **`units.ts`**: cost, damage, fire rate, range, HP per tier; tech needed; arc width; leash; how many enemies a squad can block.
- **`specs.ts`**: the 8 specializations and their abilities. Abilities are lists of *effects*
  (e.g. `{ kind: 'onHit', status: 'slow', strength: 0.45, duration: 1 }`). Every effect type is listed
  and explained in `types.ts` (search for `export type Effect`), so you can invent new abilities by combining them.
- **`buildings.ts`**: Supply Depot income and Reactor power per tier.
- **`enemies.ts`**: HP, shields (and regen), armor, speed, bounty, how much integrity they cost if they leak, attacks.
- **`cover.ts`**: damage reduction and range bonus per cover type.
- **`balance.ts`**: global rules: Power needed for Tech 2/3, veterancy XP and bonuses, sell refund, wave countdown, call-early bonus, reinforce/down timers, armor pierce per damage type, star thresholds.
- **`waves/outpost01.ts`**: what spawns in each wave, when, and the clear bonus.
- **`endless.ts`**: endless mode: threat budget curve, enemy costs, themes, surge waves, late-game scaling.
- **`missions.ts`**: starting supplies, integrity, Command Cap, which units/buildings are available.

Edit, save, and the dev server reloads. Run `npm run balance` to see how a scripted "good",
"half-hearted" and "lazy" commander fare after your change. If you mistype a field name,
`npm run typecheck` (and the deploy) fails and points to the line.

## Editing maps (Tiled)

Maps are [Tiled](https://www.mapeditor.org/) files (`src/maps/*.tmj`) using object layers only:

| Layer | Objects | Properties |
|---|---|---|
| `paths` | Polylines from spawn to the gate | `width` (float) |
| `zones` | Polygons | `kind` = `blocked` or `buildable`; `look` = `rock`/`water`/`cliff` |
| `cover` | Points | `coverType` = `sandbags`/`trench`/`ruins`/`bunker` |
| `decor` | Points | `prop` = `floodlight`/`crate`/`wreck` |

The loader validates the map on start. `npm test` also checks that every cover point is a legal
placement spot.

## Using a sprite pack

1. Put the files in `public/assets/packs/<pack-name>/`.
2. In `public/assets/manifest.json`, point an art ID at them:
   ```json
   "enemy.skitter": { "type": "image", "url": "packs/my-pack/bug.png", "scale": 0.5, "rotation": 90 }
   ```
   or, for an atlas, add it under `"atlases"` and use `{ "type": "atlas", "atlas": "name", "frame": "bug.png" }`.
   `rotation` fixes sprites that face up instead of right; `scale` sizes them (units are ~24 units wide).
3. Reload. Anything missing or broken falls back to the built-in placeholder.
