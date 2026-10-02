import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GEO, pos } from '../src/mapProjection.js';

// This image is rendered from geographic data, so every image pixel and
// interactive marker uses the same projection. No hand-adjusted city offsets.
const boundary = JSON.parse(readFileSync(new URL('../src/data/bulgaria-boundary.json', import.meta.url), 'utf8'));
const ring = boundary.geometry.coordinates[0];
const path = points => points.map(([lon, lat], i) => {
  const p = pos(lon, lat);
  return `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
}).join(' ');

// Ring runs counterclockwise from the Turkish border; isolate the coastline.
const coastStart = ring.findIndex(([lon, lat]) => lon > 28.55 && lat > 43.7);
const coastEnd = ring.findIndex(([lon, lat], i) => i > coastStart && lon > 27.95 && lat < 42);
if (coastStart === -1 || coastEnd === -1) throw new Error('Coastline landmarks missing');
const coastline = ring.slice(coastStart, coastEnd + 1);
const start = pos(...coastline[0]);
const end = pos(...coastline.at(-1));
const sea = `${path(coastline)} L${GEO.width} ${end.y} L${GEO.width} ${start.y} Z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GEO.width * 2}" height="${Math.round(GEO.height * 2)}" viewBox="0 0 ${GEO.width} ${GEO.height}">
  <rect width="100%" height="100%" fill="#dfe6e1"/>
  <path d="${sea}" fill="#cfe5ed"/>
  <path d="${path(ring)} Z" fill="#fafbf7" stroke="#1b2a24" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

const output = fileURLToPath(new URL('../public/assets/bulgaria-geographic.png', import.meta.url));
const vectorOutput = fileURLToPath(new URL('../public/assets/bulgaria-geographic.svg', import.meta.url));
writeFileSync(vectorOutput, svg);
const polygon = points => points.map(([lon, lat]) => {
  const p = pos(lon, lat);
  return `${(p.x * 2).toFixed(3)},${(p.y * 2).toFixed(3)}`;
}).join(' ');
// Draw projected polygons directly; avoids SVG delegate differences between
// ImageMagick installations while preserving the exact same pixel positions.
const seaPoints = [...coastline.map(p => pos(...p)), {x:GEO.width,y:end.y}, {x:GEO.width,y:start.y}];
execFileSync('convert', [
  '-size', `${GEO.width * 2}x${Math.round(GEO.height * 2)}`, 'xc:#dfe6e1',
  '-fill', '#cfe5ed', '-stroke', 'none',
  '-draw', `polygon ${seaPoints.map(p=>`${p.x*2},${p.y*2}`).join(' ')}`,
  '-fill', '#fafbf7', '-stroke', '#1b2a24', '-strokewidth', '4',
  '-draw', `polygon ${polygon(ring)}`, `PNG24:${output}`
], { timeout: 15000, stdio: 'inherit' });
console.log(`Rendered ${ring.length - 1} geographic border segments into ${output}`);
