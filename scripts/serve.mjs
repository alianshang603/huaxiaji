/**
 * serve.mjs — 极简静态服务器，仅供预渲染期间本地起站用。
 * 支持 SPA fallback：未知路径回退到 index.html（History 路由所需）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 4178;
const BASE = process.env.BASE_PATH || '/huaxiaji';

const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png',
  '.ico':'image/x-icon', '.xml':'application/xml', '.txt':'text/plain' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (BASE && url.startsWith(BASE)) url = url.slice(BASE.length) || '/';
  let fp = path.join(DIR, url);
  if (url.endsWith('/')) fp = path.join(fp, 'index.html');
  fs.stat(fp, (err, st) => {
    if (!err && st.isFile()) return send(fp);
    if (!err && st.isDirectory()) return send(path.join(fp, 'index.html'));
    // 静态资源不存在 → 404；其余路径 SPA fallback 到根 index.html
    if (/\.[a-z0-9]+$/i.test(url)) { res.writeHead(404); return res.end('404'); }
    send(path.join(DIR, 'index.html'));
  });
  function send(file) {
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  }
}).listen(PORT, () => console.log(`serve: http://127.0.0.1:${PORT}${BASE}/  (dir=${DIR})`));
