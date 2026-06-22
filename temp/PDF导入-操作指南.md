# PDF族谱导入 - 操作指南

## 📊 当前状态

### ✅ 已完成
1. **PDF解析功能** - 可以成功解析PDF文件
2. **后端API** - 完整的RESTful API已实现
3. **前端页面** - 4步骤导入流程页面已完成
4. **NLP引擎** - 基础人员信息提取规则已实现

### ⚠️ 当前限制
《全国陈氏总谱.pdf》是**扫描版PDF**：
- 文件大小：10.56 MB
- 页数：70页
- 提取文本：仅1258字符（平均每页18字符）
- **结论**：这是图片扫描件，需要OCR功能才能提取完整内容

---

## 🚀 如何测试PDF导入功能

### 方案1：使用前端页面（推荐）

#### 1. 启动服务

**后端**（端口3001）:
```bash
cd e:\GeneaSphere\apps\server
pnpm run dev
```

**前端**（端口5173）:
```bash
cd e:\GeneaSphere\apps\web
pnpm run dev
```

#### 2. 登录系统
访问: http://localhost:5173/login

**演示账号**:
- 管理员: `13800000000` / `demo123`
- 族员: `13800000001` / `demo123`

#### 3. 访问PDF导入页面
```
http://localhost:5173/pdf-import
```

#### 4. 上传PDF
1. 拖拽或选择PDF文件
2. 点击"开始解析"
3. 等待解析完成（轮询机制）
4. 查看预览数据
5. 校对信息（可选）
6. 点击"确认导入"

---

### 方案2：使用Postman/Apifox

#### 1. 登录获取Token
```http
POST http://localhost:3001/auth/demo-login
```

**响应**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-here",
    "phone": "13800000000",
    "role": "ADMIN"
  },
  "demoClanId": "1"
}
```

#### 2. 上传PDF
```http
POST http://localhost:3001/import/pdf/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body (form-data):
- file: [选择PDF文件]
- clan_id: 1
- user_id: <user.id>
```

**响应**:
```json
{
  "success": true,
  "taskId": "pdf_1719043200000_abc123",
  "message": "PDF上传成功，正在解析..."
}
```

#### 3. 查询任务状态
```http
GET http://localhost:3001/import/pdf/task/{taskId}/status
Authorization: Bearer <token>
```

#### 4. 获取预览数据
```http
GET http://localhost:3001/import/pdf/task/{taskId}/preview
Authorization: Bearer <token>
```

#### 5. 执行导入
```http
POST http://localhost:3001/import/pdf/task/{taskId}/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "user_id": "<user.id>",
  "clan_id": "1"
}
```

---

### 方案3：使用cURL（命令行）

```bash
# 1. 登录
curl -X POST http://localhost:3001/auth/demo-login

# 2. 上传PDF（替换token和clan_id）
curl -X POST http://localhost:3001/import/pdf/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@全国陈氏总谱.pdf" \
  -F "clan_id=1" \
  -F "user_id=<user_id>"

# 3. 查询状态
curl http://localhost:3001/import/pdf/task/<taskId>/status \
  -H "Authorization: Bearer <token>"

# 4. 获取预览
curl http://localhost:3001/import/pdf/task/<taskId>/preview \
  -H "Authorization: Bearer <token>"

# 5. 执行导入
curl -X POST http://localhost:3001/import/pdf/task/<taskId>/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<user_id>","clan_id":"1"}'
```

---

## 📁 已创建的文件

### 后端文件
```
apps/server/src/import/
├── pdf-text-parser.service.ts    # PDF文本解析服务 ✅
├── pdf-import.service.ts         # PDF导入服务 ✅
├── pdf-import.controller.ts      # PDF导入控制器 ✅
└── import.module.ts              # 模块配置（已更新）✅
```

### 前端文件
```
apps/web/src/
├── api/
│   └── pdf-import.ts             # API接口 ✅
└── views/
    └── PdfImportPage.vue         # 导入页面 ✅
```

### 测试脚本
```
temp/
├── test-pdf-import.js            # PDF解析测试 ✅
├── import-pdf-to-demo.js         # 直接数据库导入（需DATABASE_URL）
├── import-pdf-via-api.js         # HTTP API导入（需调试）
└── simple-pdf-import.js          # 简单检查脚本 ✅
```

### 文档
```
docs/
└── PDF族谱文档导入功能需求文档 v1.0.md

temp/
├── PDF导入功能开发总结.md
├── PDF导入-快速开始.md
└── PDF导入-操作指南.md（本文件）
```

---

## 🔧 API完整文档

### 基础信息
- **Base URL**: `http://localhost:3001`
- **认证**: Bearer Token
- **Content-Type**: multipart/form-data（上传）/ application/json（其他）

### 接口列表

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/import/pdf/upload` | 上传PDF | ✅ |
| GET | `/import/pdf/task/:taskId/status` | 查询任务状态 | ✅ |
| GET | `/import/pdf/task/:taskId/preview` | 获取预览数据 | ✅ |
| PUT | `/import/pdf/task/:taskId/correct` | 提交校对数据 | ✅ |
| POST | `/import/pdf/task/:taskId/execute` | 执行导入 | ✅ |

---

## ⚠️ 当前问题与解决方案

### 问题1：《全国陈氏总谱.pdf》是扫描件
**现象**: 70页PDF仅提取到1258字符

**原因**: PDF是纸质族谱的扫描件，内容为图片而非文本

**解决方案**:
1. **短期**: 准备一个文本版PDF（Word导出、电子版族谱）
2. **中期**: 集成OCR服务（阶段2开发计划）
3. **替代**: 使用Excel导入功能（已实现）

### 问题2：后端端口
**正确端口**: `3001`（不是3000）

**配置文件**: `apps/server/src/main.ts`

### 问题3：路由前缀
**无前缀**: 直接使用 `/auth/...` 和 `/import/...`

**示例**: `http://localhost:3001/auth/demo-login`

---

## 💡 测试建议

### 创建测试用文本PDF
1. 打开Word或Excel
2. 输入一些族谱数据，例如：
   ```
   陈明德，男，生于1856年，第12世
   陈李氏，女，生于1858年，第12世
   陈伟强，男，生于1920年，卒于1985年，第13世
   陈建华，男，生于1950年，第14世
   ```
3. 导出为PDF
4. 使用该PDF测试导入功能

### 使用现有Excel导入
如果PDF导入效果不佳，可以使用已有的Excel导入功能：
```
http://localhost:5173/import
```

---

## 📊 数据库验证

导入后，可以查询数据库验证：

```sql
-- 查看演示家族的人员数量
SELECT COUNT(*) FROM persons WHERE clan_id = 1;

-- 查看最新导入的人员
SELECT id, full_name, gender, birth_date, is_living, created_at
FROM persons
WHERE clan_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🎯 下一步开发计划

### 阶段2: OCR集成（1-2周）
- [ ] 集成Tesseract.js或百度OCR API
- [ ] 支持扫描件PDF识别
- [ ] 中英文混合识别
- [ ] 准确率优化（目标≥85%）

### 阶段3: NLP增强（2-3周）
- [ ] 支持更多族谱格式
- [ ] 父子关系智能推断
- [ ] 农历日期转换
- [ ] AI辅助信息补全

### 阶段5: 冲突检测（1周）
- [ ] 重名人员检测
- [ ] 相似度匹配
- [ ] 冲突解决策略

### 阶段6: 历史记录（1周）
- [ ] 导入记录持久化
- [ ] 导入历史查询
- [ ] 统计分析

---

## 📞 问题排查

### 后端无法启动
```bash
# 检查端口占用
netstat -ano | findstr :3001

# 清理并重新启动
cd apps/server
rm -rf node_modules/.prisma
pnpm install
pnpm run dev
```

### 前端无法访问
```bash
# 检查前端服务
cd apps/web
pnpm run dev

# 访问地址
http://localhost:5173
```

### API返回401
- 检查Token是否正确
- 检查Token是否过期
- 重新登录获取新Token

### API返回404
- 检查URL是否正确
- 检查端口是否为3001
- 检查路由前缀（无前缀）

---

## ✅ 功能清单

| 功能 | 状态 | 备注 |
|------|------|------|
| PDF文本解析 | ✅ | 支持文本PDF |
| PDF上传 | ✅ | 最大50MB |
| 异步任务管理 | ✅ | 轮询机制 |
| 人员信息提取 | ✅ | 基础规则 |
| 置信度评分 | ✅ | 0-100% |
| 在线预览 | ✅ | 表格展示 |
| 数据校对 | ✅ | 可编辑 |
| 批量导入 | ✅ | 自动创建 |
| OCR识别 | ⏳ | 阶段2 |
| 冲突检测 | ⏳ | 阶段5 |
| 导入历史 | ⏳ | 阶段6 |

---

**更新日期**: 2026-06-22  
**开发状态**: 阶段1-4完成，核心功能可用  
**后端端口**: 3001  
**前端端口**: 5173  
**演示账号**: 13800000000 / demo123
