// Lokaler Testserver: baut die App und liefert public/ auf http://localhost:3000 aus.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT) || 3000;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(PUB, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUB)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUB, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`\n  🅿️  ParkCheck lokal: http://localhost:${port}\n`));
