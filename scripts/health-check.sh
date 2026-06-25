#!/bin/bash
# GeneaSphere 部署健康检查脚本
# 用法: bash health-check.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check() {
    local name="$1"
    local result="$2"
    if [ "$result" = "OK" ]; then
        echo -e "  ${GREEN}[PASS]${NC} $name"
        ((PASS++))
    else
        echo -e "  ${RED}[FAIL]${NC} $name → $result"
        ((FAIL++))
    fi
}

echo "========================================"
echo "  GeneaSphere 部署健康检查"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# 1. 前端资源
echo "── 前端资源 ──"
if [ -f /opt/geneasphere/apps/web/dist/index.html ]; then
    check "dist/index.html 存在" "OK"
else
    check "dist/index.html 存在" "缺失"
fi
COUNT=$(ls /opt/geneasphere/apps/web/dist/assets/ 2>/dev/null | wc -l)
if [ "$COUNT" -gt 100 ]; then
    check "静态文件数量 ($COUNT)" "OK"
else
    check "静态文件数量 ($COUNT)" "异常(少于100)"
fi

# 2. Nginx
echo "── Nginx ──"
systemctl is-active --quiet nginx && check "Nginx 运行状态" "OK" || check "Nginx 运行状态" "未运行"
nginx -t &>/dev/null && check "Nginx 配置语法" "OK" || check "Nginx 配置语法" "配置错误"

# 3. PM2 后端
echo "── 后端服务 ──"
STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
[ "$STATUS" = "online" ] && check "PM2 进程状态" "OK" || check "PM2 进程状态" "$STATUS"

# 4. 前端 HTTP 测试
echo "── HTTP 测试 ──"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://localhost/)
[ "$HTTP_CODE" = "200" ] && check "前端页面 (localhost)" "OK" || check "前端页面 (localhost)" "HTTP $HTTP_CODE"

# 5. API 测试
API_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 -X POST http://localhost/api/auth/demo-login -H 'Content-Type: application/json' -d '{}')
[ "$API_CODE" = "200" ] || [ "$API_CODE" = "201" ] && check "API 接口 (demo-login)" "OK" || check "API 接口 (demo-login)" "HTTP $API_CODE"

# 6. 端口监听
echo "── 端口监听 ──"
ss -tlnp 2>/dev/null | grep -q ':80 ' && check "端口 80 (Nginx)" "OK" || check "端口 80 (Nginx)" "未监听"
ss -tlnp 2>/dev/null | grep -q ':3001 ' && check "端口 3001 (Node)" "OK" || check "端口 3001 (Node)" "未监听"

# 7. 公网测试
echo "── 公网可达性 ──"
PUBLIC_IP=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null || echo "43.134.232.175")
PUBLIC_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 http://$PUBLIC_IP/)
[ "$PUBLIC_CODE" = "200" ] && check "公网访问 ($PUBLIC_IP)" "OK" || check "公网访问 ($PUBLIC_IP)" "HTTP $PUBLIC_CODE"

# 8. 资源使用
echo "── 系统资源 ──"
DISK_USED=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
[ "$DISK_USED" -lt 80 ] && check "磁盘使用 ($DISK_USED%)" "OK" || check "磁盘使用 ($DISK_USED%)" "警告(>80%)"

MEM_AVAIL=$(free -m | awk '/Mem:/{print $7}')
[ "$MEM_AVAIL" -gt 200 ] && check "可用内存 (${MEM_AVAIL}MB)" "OK" || check "可用内存 (${MEM_AVAIL}MB)" "不足(<200MB)"

# 9. 错误日志
echo "── 最近错误 ──"
ERR_COUNT=$(pm2 logs geneasphere-server --err --lines 20 --nostream 2>/dev/null | grep -c "ERROR")
if [ "$ERR_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}[PASS]${NC} 最近20行无ERROR"
elif [ "$ERR_COUNT" -le 3 ]; then
    echo -e "  ${YELLOW}[WARN]${NC} 最近20行有 $ERR_COUNT 个ERROR (业务相关，可忽略)"
else
    echo -e "  ${RED}[WARN]${NC} 最近20行有 $ERR_COUNT 个ERROR (请检查)"
fi

# 总结
echo ""
echo "========================================"
echo "  结果: ${GREEN}$PASS 通过${NC} / ${RED}$FAIL 失败${NC}"
if [ "$FAIL" -eq 0 ]; then
    echo -e "  状态: ${GREEN}部署正常 ✅${NC}"
else
    echo -e "  状态: ${RED}存在问题，请检查 ⚠️${NC}"
fi
echo "========================================"
