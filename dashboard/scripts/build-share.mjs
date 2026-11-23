#!/usr/bin/env node
/**
 * Pack the built dashboard into one self-contained HTML file, for sharing where a URL can't reach:
 * colleagues open web/dist/TestNova.html directly, with no server or network.
 *
 *   npm --prefix dashboard/web run share
 *
 * Inlines the bundle, the stylesheet, the fonts and the favicon. It carries the same test titles
 * and defect ids as the dashboard, so share it only with people who may see those.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };
const dataUri = (file) => `data:${MIME[extname(file)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, href) => {
  // Vite writes asset urls from the site root, or relative to the stylesheet with a relative base
  const asset = (u) => (u.startsWith('/') ? join(dist, u) : join(dist, dirname(href), u));
  const css = readFileSync(join(dist, href), 'utf8').replace(/url\(["']?([^"')]+\.(?:woff2?|svg))["']?\)/g, (m, u) =>
    u.startsWith('data:') ? m : `url(${dataUri(asset(u))})`,
  );
  return `<style>${css}</style>`;
});

let script = '';
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/, (_, src) => {
  script = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\/script');
  return '';
});
html = html.replace(/<link rel="icon"[^>]*href="\.?\/?([^"]+)"[^>]*>/, (_, href) => `<link rel="icon" href="${dataUri(join(dist, href))}">`);
// the module goes after #root, and through a function replacement so `$` in the bundle stays literal
html = html.replace('</body>', () => `<script type="module">${script}</script></body>`);

const out = join(dist, 'TestNova.html');
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1048576).toFixed(1)} MB)`);
