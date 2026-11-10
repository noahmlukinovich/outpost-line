// Renders public/icons/icon.svg into the PNG sizes iOS and the web manifest need.
// Run with: npm run icons   (uses the Playwright/Chromium that ships with the dev container)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icons/icon.svg', 'utf8');
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  // Maskable icons get cropped to a circle/squircle by some launchers, so add a safe margin.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<body style="margin:0;background:#0d0f0c;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: `public/icons/${t.file}`, omitBackground: false });
  console.log('wrote', t.file);
}
await browser.close();
