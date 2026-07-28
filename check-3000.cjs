const { execSync } = require('child_process')
try {
  // 用 netstat 找出哪个进程占用 3000
  const out = execSync('netstat -ano -p TCP | findstr ":3000.*LISTENING"', { encoding: 'utf8' })
  console.log('3000 LISTENING:')
  console.log(out)
  // 提取 PID
  const pidMatch = out.match(/LISTENING\s+(\d+)/)
  if (pidMatch) {
    const pid = pidMatch[1]
    // 用 tasklist 找进程名
    try {
      const task = execSync(`tasklist /FI "PID eq ${pid}" /FO TABLE /NH`, { encoding: 'utf8' })
      console.log('Process info:')
      console.log(task)
    } catch (e) {
      console.log('tasklist failed:', e.message)
    }
  }
} catch (e) {
  console.log('no process on 3000 (or netstat error):', e.message.split('\n')[0])
}
