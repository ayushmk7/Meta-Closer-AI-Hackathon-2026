import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const f of [join(root, path), join(root, 'index.html')]) {
    try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); return res.end(b); } catch {}
  }
  res.writeHead(404); res.end();
}).listen(8090, '127.0.0.1');
