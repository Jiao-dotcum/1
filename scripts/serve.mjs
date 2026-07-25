#!/usr/bin/env node
/**
 * Local server for the public page and the API. Development convenience only —
 * the published page is static and needs no server.
 *
 *   node scripts/serve.mjs [--port 8080] [--dir public]
 *
 *   /                     the public page
 *   /api/index-value…     the JSON/CSV endpoint
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { respond } from '../api/index-value.js';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv[i + 1];
};
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, flag('--dir', 'public'));
const port = Number(flag('--port', 8080));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/index-value')) {
    const { status, headers, body } = respond(url);
    res.writeHead(status, headers);
    return res.end(body);
  }

  // Static files, confined to `dir`.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(dir, rel === '/' || rel === '\\' ? 'index.html' : rel);
  if (!file.startsWith(dir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`not found: ${rel}\n\nRun \`node scripts/build-site.mjs\` to generate the site.`);
  }
}).listen(port, () => {
  console.log(`APCCI serving ${dir} on http://localhost:${port}`);
  console.log(`  page  http://localhost:${port}/`);
  console.log(`  api   http://localhost:${port}/api/index-value?spec=1`);
});
