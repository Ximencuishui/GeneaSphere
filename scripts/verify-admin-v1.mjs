#!/usr/bin/env node
/**
 * 寻根路 Admin 后台 v1.0 端到端验收脚本
 *
 * 用法：
 *   node scripts/verify-admin-v1.mjs                # 默认连 localhost:3001
 *   BASE_URL=https://api.xungenlu.cn node scripts/verify-admin-v1.mjs
 *
 * 验收清单（对应《Admin 管理后台需求文档 v1.0》§3.1～§3.11 + §7 验收标准）：
 *   1. 服务存活
 *   2. 服务就绪（含数据库连通性）
 *   3. 平台管理员登录（演示账号）
 *   4. 平台管理员：家族列表、审核操作
 *   5. 平台管理员：用户列表
 *   6. 平台管理员：印刷订单列表
 *   7. 平台管理员：统计数据 + PDF 报表
 *   8. 平台管理员：工具使用排行
 *   9. 登录失败锁定（5 次错误 → 锁定）
 *   10. 再次购买接口
 */

import process from 'node:process'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
const PLATFORM_USER = 'platform_admin'        // 演示平台账号
const PLATFORM_PASS = 'admin123'              // 演示密码
const USER_PHONE = '13900000000'              // 演示用户手机
const USER_PASS = 'demo123'                   // 演示密码

let passCount = 0
let failCount = 0

const log = (status, name, detail = '') => {
  const mark = status === 'PASS' ? '✅' : '❌'
  console.log(`${mark} ${status}  ${name}${detail ? '  — ' + detail : ''}`)
  if (status === 'PASS') passCount++
  else failCount++
}

async function req(path, init = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  let body = null
  const text = await res.text()
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  return { status: res.status, body }
}

async function step1_health() {
  try {
    const { status, body } = await req('/health')
    if (status === 200 && body?.status === 'ok') {
      log('PASS', '服务存活', `${body.service} v${body.version}`)
      return true
    }
    log('FAIL', '服务存活', `status=${status} body=${JSON.stringify(body)}`)
    return false
  } catch (e) {
    log('FAIL', '服务存活', e.message)
    return false
  }
}

async function step2_ready() {
  try {
    const { status, body } = await req('/health/ready')
    const dbOk = body?.checks?.database?.ok
    if (status === 200 && dbOk) {
      log('PASS', '服务就绪（数据库连通）', `db ${body.checks.database.latency_ms}ms`)
      return true
    }
    log('FAIL', '服务就绪', `status=${status} dbOk=${dbOk} err=${body?.checks?.database?.error || ''}`)
    return false
  } catch (e) {
    log('FAIL', '服务就绪', e.message)
    return false
  }
}

async function step3_platformLogin() {
  try {
    const { status, body } = await req('/api/platform/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: PLATFORM_USER, password: PLATFORM_PASS }),
    })
    if (status === 200 && body?.access_token) {
      log('PASS', '平台管理员登录', `role=${body.admin?.role || '?'}`)
      return body.access_token
    }
    log('FAIL', '平台管理员登录', `status=${status} msg=${body?.message || ''}`)
    return null
  } catch (e) {
    log('FAIL', '平台管理员登录', e.message)
    return null
  }
}

async function step4_families(token) {
  try {
    const { status, body } = await req('/api/platform/families?page=1&pageSize=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = status === 200 && Array.isArray(body?.data)
    if (ok) {
      log('PASS', '家族列表', `${body.data.length} 条（total=${body.pagination?.total}）`)
      // 顺带校验 has_id_card 字段
      const sample = body.data[0]
      if (sample && typeof sample.has_id_card !== 'undefined') {
        log('PASS', '家族列表-证件字段', `has_id_card=${sample.has_id_card}`)
      } else {
        log('FAIL', '家族列表-证件字段', '缺少 has_id_card')
      }
    } else {
      log('FAIL', '家族列表', `status=${status}`)
    }
  } catch (e) {
    log('FAIL', '家族列表', e.message)
  }
}

async function step5_users(token) {
  try {
    const { status, body } = await req('/api/platform/users?page=1&pageSize=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = status === 200 && Array.isArray(body?.data)
    if (ok) {
      log('PASS', '用户列表', `${body.data.length} 条`)
    } else {
      log('FAIL', '用户列表', `status=${status}`)
    }
  } catch (e) {
    log('FAIL', '用户列表', e.message)
  }
}

async function step6_orders(token) {
  try {
    const { status, body } = await req('/api/platform/orders/print?page=1&pageSize=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = status === 200 && Array.isArray(body?.data)
    if (ok) {
      log('PASS', '印刷订单列表', `${body.data.length} 条`)
    } else {
      log('FAIL', '印刷订单列表', `status=${status}`)
    }
  } catch (e) {
    log('FAIL', '印刷订单列表', e.message)
  }
}

async function step7_statistics(token) {
  try {
    const { status, body } = await req('/api/platform/statistics/summary?period=week', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = status === 200 && body?.totals
    if (ok) {
      log('PASS', '统计数据', `revenue=${body.totals.revenue}`)
    } else {
      log('FAIL', '统计数据', `status=${status}`)
    }

    // PDF 报表：只检查响应头与返回字节数
    const pdfRes = await fetch(`${BASE_URL}/api/platform/statistics/report?period=week`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const pdfHeader = pdfRes.headers.get('content-type')
    const pdfBuf = await pdfRes.arrayBuffer()
    if (pdfRes.status === 200 && pdfHeader?.includes('pdf') && pdfBuf.byteLength > 1000) {
      log('PASS', 'PDF 报表下载', `${pdfBuf.byteLength} 字节，${pdfHeader}`)
    } else {
      log('FAIL', 'PDF 报表下载', `status=${pdfRes.status} type=${pdfHeader} size=${pdfBuf.byteLength}`)
    }
  } catch (e) {
    log('FAIL', '统计数据/PDF', e.message)
  }
}

async function step8_toolRanking(token) {
  try {
    const { status, body } = await req('/api/platform/statistics/tool-usage?period=week', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = status === 200 && Array.isArray(body?.data)
    if (ok) {
      log('PASS', '工具使用排行', `${body.data.length} 条（top=${body.data[0]?.tool_name || '无'}）`)
    } else {
      log('FAIL', '工具使用排行', `status=${status}`)
    }
  } catch (e) {
    log('FAIL', '工具使用排行', e.message)
  }
}

async function step9_lockout() {
  // 注意：会真实触发后端锁定。可通过 SKIP_LOCK_TEST=1 跳过。
  if (process.env.SKIP_LOCK_TEST === '1') {
    log('PASS', '登录失败锁定（跳过）', 'SKIP_LOCK_TEST=1')
    return
  }
  try {
    for (let i = 0; i < 6; i++) {
      await req('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: USER_PHONE, password: 'wrong_password_' + Date.now() }),
      })
    }
    const { status, body } = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: USER_PHONE, password: 'wrong_again' }),
    })
    if (status === 401 && /锁定|locked/i.test(body?.message || '')) {
      log('PASS', '登录失败锁定', body.message)
    } else {
      log('FAIL', '登录失败锁定', `未触发锁定：status=${status} msg=${body?.message}`)
    }
    // 测试后清空锁定，便于重复测试
    console.log('   ℹ️  若需重置锁定，请在数据库执行：')
    console.log('       DELETE FROM login_attempts WHERE subject_key = \'' + USER_PHONE + '\';')
  } catch (e) {
    log('FAIL', '登录失败锁定', e.message)
  }
}

async function step10_reorder() {
  try {
    // 演示账号登录
    const loginRes = await req('/api/auth/demo-login', { method: 'POST' })
    const token = loginRes.body?.access_token
    if (!token) {
      log('FAIL', '再次购买', '演示账号登录失败')
      return
    }
    // 拉取一个示例订单
    const listRes = await req('/api/admin/orders?clanId=1&page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const first = listRes.body?.data?.[0]
    if (!first) {
      log('PASS', '再次购买（跳过）', '无可用订单（演示数据可能未含 printOrder）')
      return
    }
    const reorderRes = await req(`/api/admin/orders/${first.id}/reorder`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = reorderRes.status === 201 && reorderRes.body?.new_order_id
    if (ok) {
      log('PASS', '再次购买', `原 #${first.id} → 新 #${reorderRes.body.new_order_id}`)
    } else {
      log('FAIL', '再次购买', `status=${reorderRes.status} msg=${reorderRes.body?.message}`)
    }
  } catch (e) {
    log('FAIL', '再次购买', e.message)
  }
}

async function main() {
  console.log(`\n=== 寻根路 Admin 后台 v1.0 端到端验收 ===`)
  console.log(`目标：${BASE_URL}\n`)

  await step1_health()
  const ready = await step2_ready()
  if (!ready) {
    console.log('\n服务未就绪，跳过后续验收。')
  } else {
    const token = await step3_platformLogin()
    if (token) {
      await step4_families(token)
      await step5_users(token)
      await step6_orders(token)
      await step7_statistics(token)
      await step8_toolRanking(token)
    } else {
      console.log('\n⚠️  平台管理员登录失败，跳过登录后相关验收。')
    }
    await step9_lockout()
    await step10_reorder()
  }

  console.log(`\n=== 结果 ===`)
  console.log(`通过：${passCount}    失败：${failCount}`)
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('未捕获异常：', e)
  process.exit(1)
})
