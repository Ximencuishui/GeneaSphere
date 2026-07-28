const http = require('http')

function probe(url, label, forceFamily = 0) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      timeout: 8000,
      family: forceFamily, // 0=any, 4=IPv4, 6=IPv6
    }
    const req = http.get(opts, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => {
        const preview = body.length > 250 ? body.slice(0, 250) + '...' : body
        console.log(`[${label}]`, res.statusCode, res.headers['content-type'] || '')
        console.log('  Body preview:', preview.replace(/\n/g, ' ').slice(0, 250))
        resolve()
      })
    })
    req.on('timeout', () => { console.log(`[${label}] TIMEOUT`); req.destroy(); resolve() })
    req.on('error', (e) => { console.log(`[${label}] ERROR:`, e.code, e.message); resolve() })
  })
}

;(async () => {
  // 前端（IPv6）
  await probe('http://[::1]:5173/', 'Frontend / (IPv6)', 6)
  await probe('http://[::1]:5173/user-center', 'Frontend /user-center (IPv6)', 6)
  await probe('http://[::1]:5173/zupu/zhuxi-zupu/dashboard', 'Frontend dashboard (IPv6)', 6)
  // 后端（IPv4）
  await probe('http://127.0.0.1:3001/api/auth/demo-info', 'Backend /api/auth/demo-info', 4)
  // vite 代理：前端走 IPv6，代理会打到 127.0.0.1:3001
  await probe('http://[::1]:5173/api/auth/demo-info', 'Frontend → /api/auth/demo-info (proxied)', 6)
})()
