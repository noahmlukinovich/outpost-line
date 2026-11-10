# Outpost Line

A top-down military sci-fi tower defense game for iPad, built as an installable web app (PWA).
Design: see [GAME_DESIGN.md](GAME_DESIGN.md).

**Play:** https://noahmlukinovich.github.io/outpost-line/ (live once GitHub Pages is set up, see below)

**Status:** Milestone 0: project setup, offline install and deploy pipeline. The title screen runs
a small live skirmish to check the art style, effects, audio and performance on your iPad.

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
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build (with the service worker active) |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |

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
  main.ts            Game setup, screen-size handling
  app/               Display (retina/safe areas), PWA/service worker
  assets/            Palette + placeholder art generator (later: sprite manifest)
  audio/             Placeholder synthesized sound effects
  core/              Shared utilities (object pool)
  scenes/            Phaser scenes (Boot, Title)
public/icons/        App icons (SVG source + generated PNGs)
GAME_DESIGN.md       The design document
```

Coming in M1, per the design doc: `src/data/` (balance files you edit), `src/maps/`, `src/sim/`
(game rules), `src/render/`, `src/input/`, `src/ui/`, `src/save/`.

## Editing balance

From Milestone 1, all unit, enemy and wave numbers live in `src/data/*.ts`, with comments
explaining each field. Edit a number and save: the dev server reloads, or push to deploy.
