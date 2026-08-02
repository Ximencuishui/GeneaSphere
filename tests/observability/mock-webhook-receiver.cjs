#!/usr/bin/env node
/**
 * Mock Alert Webhook Receiver
 *
 * 启动一个 HTTP server 监听 /alert/webhook，记录所有收到的告警到
 * tests/observability/results/webhook-received.log
 *
 * 用途：Round 5 告警 webhook 演练的接收方。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.MOCK_WEBHOOK_PORT || '4123', 10);
const LOG_PATH = process.env.MOCK_WEBHOOK_LOG
  || path.resolve(__dirname, '../observability/results/webhook-received.log');

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const counts = { total: 0, p0: 0, p1: 0, p2: 0, p3: 0, bySource: {} };

function recordEntry(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/alert/webhook') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        counts.total += 1;
        counts[payload.level?.toLowerCase()] = (counts[payload.level?.toLowerCase()] || 0) + 1;
        counts.bySource[payload.source] = (counts.bySource[payload.source] || 0) + 1;
        recordEntry({
          ts: new Date().toISOString(),
          headers: { 'x-alert-source': req.headers['x-alert-source'], 'content-type': req.headers['content-type'] },
          payload,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, received: counts.total }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/alert/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(counts));
    return;
  }
  if (req.method === 'POST' && req.url === '/alert/reset') {
    counts.total = 0; counts.p0 = 0; counts.p1 = 0; counts.p2 = 0; counts.p3 = 0;
    counts.bySource = {};
    fs.writeFileSync(LOG_PATH, '', 'utf8');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, reset: true }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-webhook] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-webhook] POST /alert/webhook to receive alerts`);
  console.log(`[mock-webhook] GET  /alert/stats to read counters`);
  console.log(`[mock-webhook] log file: ${LOG_PATH}`);
});