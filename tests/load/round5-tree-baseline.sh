#!/bin/bash
# Round 5 — P5-02：1000 人族谱树 Browser MCP 自动化测试
# 配合 browser-use MCP 工具使用
#
# 前置：
#   1. pnpm --filter server dev  (端口 3101)
#   2. pnpm --filter web dev     (端口 5173)
#   3. 三层密码登录或一键演示登录
#
# 流程（由 Qoder Agent 执行 Browser MCP 操作）：
#   1. 登录管理员（POST /api/auth/demo-login → 写 localStorage）
#   2. navigate_page http://localhost:5173/zupu/zhuxi-demo
#   3. 计时：从 navigate_page 开始，到 take_snapshot 拿到 h2=控制面板 为止
#   4. 访问 http://localhost:5173/tree/4
#   5. 计时：从 navigate_page 到 1002 个节点全部渲染
#   6. 输出 P5-02 实际耗时到 reports/round5-perf-actual.md
#
# 通过标准：1000 人族谱树首屏 < 5s（P-2 准入）
set -e

REPORT_DIR="tests/e2e/reports"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/round5-perf-actual.md"

echo "========================================"
echo "  Round 5 — 性能基线（手动模式）"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. 健康检查
echo ""
echo "[1/3] 服务健康检查"
bash scripts/health-check.sh 2>/dev/null || bash tests/e2e/scripts/check-services.ps1 2>/dev/null

# 2. 后端 demo-login 探活 + 测全树查询耗时
echo ""
echo "[2/3] 后端 /api/tree/clan/zhuxi-demo/full 响应时间"
LOGIN_RES=$(curl -s -X POST http://localhost:3101/api/auth/demo-login \
  -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
TOKEN=$(echo "$LOGIN_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "  [WARN] 无法获取 token（后端未启动？），请人工执行 Browser MCP 流程"
  echo "  请使用以下命令："
  echo "    1. POST /api/auth/demo-login → 写 localStorage"
  echo "    2. navigate_page http://localhost:5173/tree/4"
  echo "    3. wait_for('朱熹') + 计时"
  exit 0
fi

# 计时 3 次取中位数
echo "  计时 3 次（取 P50）："
for i in 1 2 3; do
  T=$(curl -s -o /dev/null -w '%{time_total}' \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3101/api/tree/clan/zhuxi-demo/full")
  echo "    第 $i 次：${T}s"
done

# 3. 报告占位
echo ""
echo "[3/3] 生成报告占位"
cat > "$REPORT" <<EOF
# Round 5 — 性能基线测试报告

> **执行时间**：$(date '+%Y-%m-%d %H:%M:%S')
> **执行模式**：k6 压测 + Browser MCP 手动计时
> **目标准入**：1000 人族谱树 < 5s（P-2）

## 1. 概要

| 指标 | 期望 | 实际 | 状态 |
|------|------|------|------|
| 登录页 FCP | < 1.5s | 待填 | ⬜ |
| 1000 人树首屏 | < 5s | 待填 | ⬜ |
| demo-login 100 并发 P95 | < 500ms | 待填 | ⬜ |
| demo-login 100 并发 QPS | ≥ 200 | 待填 | ⬜ |
| 族谱树 50 并发 P95 | < 3s | 待填 | ⬜ |
| 4MB 上传 20 并发成功率 | ≥ 99% | 待填 | ⬜ |
| 长时 4h 内存增长 | < 50MB | 待填 | ⬜ |

## 2. k6 压测命令

\`\`\`bash
# 100 并发 demo-login
k6 run tests/load/round5-load.js -e TARGET=login

# 50 并发族谱树
k6 run tests/load/round5-load.js -e TARGET=tree

# API mix（CRUD 列表）
k6 run tests/load/round5-load.js -e TARGET=api-mix

# 4MB 上传
k6 run tests/load/round5-load.js -e TARGET=upload
\`\`\`

## 3. Browser MCP 流程

\`\`\`js
// 1. 登录
await fetch('/api/auth/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  .then(r => r.json())
  .then(d => localStorage.setItem('geneasphere_token', d.access_token));

// 2. 计时
const t0 = performance.now();
location.assign('/tree/4');
// 等待 h2 / canvas 渲染
await new Promise(r => setTimeout(r, 100));
const interval = setInterval(() => {
  if (document.querySelector('canvas')) {
    clearInterval(interval);
    const dt = performance.now() - t0;
    console.log('族谱树首屏耗时：', dt, 'ms');
  }
}, 100);
\`\`\`

## 4. 结论

- [ ] P0：1000 人树 < 5s 准入线达成
- [ ] P0：100 并发 demo-login QPS ≥ 200 达成
- [ ] P0：4MB 上传成功率 ≥ 99% 达成

EOF
echo "  报告已生成：$REPORT"
echo ""
echo "========================================"
