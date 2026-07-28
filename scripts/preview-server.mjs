/**
 * 生产模式预览服务器：serve dist/ 静态文件 + /api/* 反代到后端 3001
 * 用于本地验证 vite build 产物（修复 G6 dev 模式 chunk 循环依赖问题）
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = resolve(__dirname, '../apps/web/dist');
const API_TARGET = 'http://localhost:3001';
const PORT = Number(process.env.PREVIEW_PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

async function tryReadFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) return { ok: true, size: s.size, path: filePath };
  } catch {}
  return { ok: false };
}

async function serveStatic(req, res, urlPath) {
  // 去掉 query string 和 hash
  const cleanPath = urlPath.split('?')[0].split('#')[0];
  // 防止路径穿越
  if (cleanPath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 直接尝试文件
  const filePath = join(DIST_DIR, cleanPath);
  const direct = await tryReadFile(filePath);
  if (direct.ok) {
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': direct.size,
      'Cache-Control': cleanPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    const buf = await readFile(filePath);
    res.end(buf);
    return;
  }

  // SPA fallback：返回 index.html
  const indexPath = join(DIST_DIR, 'index.html');
  const idx = await tryReadFile(indexPath);
  if (idx.ok) {
    const buf = await readFile(indexPath);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': idx.size,
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

function proxyToApi(req, res) {
  const target = API_TARGET + req.url;
  console.log(`[proxy] ${req.method} ${req.url} -> ${target}`);

  // 用 fetch + 流式转发（Node 18+ 内置 fetch + body duplex）
  fetch(target, {
    method: req.method,
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(([k]) =>
        !['host', 'connection', 'content-length'].includes(k.toLowerCase())
      )
    ),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
    duplex: 'half',
  })
    .then(async (apiRes) => {
      res.writeHead(apiRes.status, Object.fromEntries(apiRes.headers.entries()));
      // 流式 pipe
      if (apiRes.body) {
        const reader = apiRes.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              return;
            }
            res.write(Buffer.from(value));
          }
        };
        await pump();
      } else {
        res.end();
      }
    })
    .catch((err) => {
      console.error(`[proxy] error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    });
}

const server = createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    if (url.startsWith('/api/')) {
      proxyToApi(req, res);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error(`[server] error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
  }
});

server.listen(PORT, '::', () => {
  console.log(`🚀 GeneaSphere 生产预览已启动`);
  console.log(`   静态文件: ${DIST_DIR}`);
  console.log(`   API 反代: /api/* -> ${API_TARGET}`);
  console.log(`   访问地址: http://localhost:${PORT}`);
});
