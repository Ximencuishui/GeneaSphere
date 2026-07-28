import http from 'http';

function probe(port, path = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path, timeout: 2000 }, (res) => {
      resolve({ port, status: res.statusCode });
    });
    req.on('error', (e) => resolve({ port, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ port, error: 'timeout' }); });
  });
}

const results = await Promise.all([
  probe(5173),
  probe(3101),
  probe(3101, '/api'),
]);

const out = JSON.stringify(results, null, 2);
import fs from 'fs';
fs.writeFileSync('scripts/probe-out.json', out);
