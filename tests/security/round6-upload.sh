#!/bin/bash
# Round 6 - S6-10: 文件上传绕过
# 验证：上传 webshell / 双扩展名 / null 字节 / MIME 伪造均被拒
#
# 实际路由：POST /api/user/avatar（需 JwtAuthGuard；MIME 白名单 jpg/png/webp；≤5MB）

set -u

# 注意：不要使用 set -e；上传失败码 4xx/5xx 不应让脚本提前终止。

BASE_URL="${BASE_URL:-http://localhost:3101}"
UPLOAD_URL="$BASE_URL/api/user/avatar"
PASS=0
FAIL=0

# 使用 /tmp 下的固定目录，避免 mktemp 跨进程问题
TMPDIR="/tmp/upload-tmp-r6"
rm -rf "$TMPDIR"
mkdir -p "$TMPDIR"

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  [PASS] $name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name -> 期望: $expected, 实际: $actual"
    FAIL=$((FAIL + 1))
  fi
}

# 拒绝类检查：返回码 >= 400 即视为拒绝
reject_check() {
  local name="$1"
  local actual="$2"
  if [ -n "$actual" ] && [ "$actual" -ge 400 ] && [ "$actual" -lt 500 ]; then
    echo "  [PASS] $name -> HTTP $actual（已拒绝）"
    PASS=$((PASS + 1))
  elif [ -n "$actual" ] && [ "$actual" -ge 500 ]; then
    echo "  [FAIL] $name -> HTTP $actual（500：服务端错误，不应崩溃）"
    FAIL=$((FAIL + 1))
  else
    echo "  [FAIL] $name -> HTTP $actual（未拒绝）"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "  Round 6 - 文件上传绕过"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/demo-login" \
  -H 'Content-Type: application/json' -d '{}')
TOKEN=$(echo "$LOGIN_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "  [FAIL] 无法获取 token"
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"
echo "  Token 长度：${#TOKEN}"

# 用 Python 直接写文件，避开 bash 对 '<' '?' 的歧义解析
python <<PYEOF
import os, shutil
TMPDIR = "${TMPDIR}"
if os.path.exists(TMPDIR):
    shutil.rmtree(TMPDIR)
os.makedirs(TMPDIR)

with open(os.path.join(TMPDIR, "shell.php"), "wb") as f:
    f.write(b'<?php system(\$_GET["cmd"]); ?>')
shutil.copy(os.path.join(TMPDIR, "shell.php"), os.path.join(TMPDIR, "shell.php.jpg"))

with open(os.path.join(TMPDIR, "shell.phpNULL.jpg"), "wb") as f:
    f.write(b'<?php system(\$_GET["c"]); ?>\x00.jpg')

with open(os.path.join(TMPDIR, "shell.jsp"), "wb") as f:
    f.write(b'<%@ page import="java.util.*,java.io.*" %><% Runtime.getRuntime().exec(request.getParameter("cmd")); %>')

with open(os.path.join(TMPDIR, "fake.gif"), "wb") as f:
    f.write(b'GIF89a<?php system(\$_GET["c"]); ?>')

print("[init] files:", sorted(os.listdir(TMPDIR)))
PYEOF

# 1. PHP webshell（MIME 伪造）
echo ""
echo "[1] PHP webshell 上传（MIME 伪造为 jpeg）"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/shell.php;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "shell.php (MIME 伪造)" "$CODE"

# 2. 双扩展名 .php.jpg
echo ""
echo "[2] 双扩展名 shell.php.jpg"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/shell.php.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "shell.php.jpg (双扩展名)" "$CODE"

# 3. null 字节 shell.php\0.jpg
echo ""
echo "[3] null 字节 shell.php\\x00.jpg"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/shell.phpNULL.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "shell.php\\x00.jpg (null 字节)" "$CODE"

# 4. JSP webshell
echo ""
echo "[4] JSP webshell"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/shell.jsp;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "shell.jsp" "$CODE"

# 5. GIF89a + PHP 伪装（polyglot）
echo ""
echo "[5] GIF89a + PHP 伪装（polyglot）"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/fake.gif;type=image/gif" \
  "$UPLOAD_URL")
echo "  [INFO] 伪装 GIF -> HTTP $CODE（avatar 仅允许 jpg/png/webp，期望 400）"

# 6. 超大文件（10MB > 5MB 限制）
echo ""
echo "[6] 超大文件（10MB）"
dd if=/dev/zero of="$TMPDIR/big.jpg" bs=1M count=10 2>/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/big.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "10MB 上传（限制 5MB）" "$CODE"

# 7. 空文件
echo ""
echo "[7] 0 字节文件"
touch "$TMPDIR/empty.jpg"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/empty.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
reject_check "0 字节上传" "$CODE"

# 8. 路径穿越文件名
echo ""
echo "[8] 路径穿越文件名"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/shell.php;filename=../../../etc-passwd.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
echo "  [INFO] 路径穿越 filename -> HTTP $CODE"

# 9. 正常 JPEG 文件作为对照（不应误杀合法上传）
echo ""
echo "[9] 合法 JPEG 上传作为对照"
python -c "
import base64
data = base64.b64decode(b'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==')
with open('${TMPDIR}/valid.jpg', 'wb') as f: f.write(data)
" 2>/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" \
  -F "file=@${TMPDIR}/valid.jpg;type=image/jpeg" \
  "$UPLOAD_URL")
check "合法 JPEG 通过" "201" "$CODE"

echo ""
echo "========================================"
echo "  通过: $PASS / 失败: $FAIL"
echo "========================================"

rm -rf "$TMPDIR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)