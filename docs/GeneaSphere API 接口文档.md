# GeneaSphere API 接口文档

## 目录

1. [认证模块 (Auth)](#认证模块)
2. [家族模块 (Clan)](#家族模块)
3. [族谱树模块 (Tree)](#族谱树模块)
4. [导入模块 (Import)](#导入模块)
5. [媒体模块 (Media)](#媒体模块)
6. [寻亲模块 (Search)](#寻亲模块)
7. [打印模块 (Print)](#打印模块)

---

## 认证模块

### 基础信息
- **基础路径**: `/api/auth`
- **认证方式**: JWT Token（通过 Authorization 请求头）

### 接口列表

#### 1.1 用户注册
- **接口**: `POST /api/auth/register`
- **描述**: 新用户注册
- **权限**: 公开
- **请求体**:
  ```json
  {
    "phone": "string",      // 手机号（必填）
    "password": "string"    // 密码（必填）
  }
  ```
- **响应**:
  ```json
  {
    "access_token": "string",  // JWT Token
    "user": {
      "id": "string",
      "phone": "string"
    }
  }
  ```

#### 1.2 用户登录
- **接口**: `POST /api/auth/login`
- **描述**: 用户登录获取 Token
- **权限**: 公开
- **请求体**:
  ```json
  {
    "phone": "string",      // 手机号（必填）
    "password": "string"    // 密码（必填）
  }
  ```
- **响应**: 同注册接口

---

## 家族模块

### 基础信息
- **基础路径**: `/api/clans`
- **认证方式**: JWT Token（部分接口需要）

### 接口列表

#### 2.1 创建家族
- **接口**: `POST /api/clans`
- **描述**: 创建新家族，当前用户成为管理员
- **权限**: 需要认证
- **请求体**:
  ```json
  {
    "name": "string",              // 家族名称（必填）
    "description": "string",       // 家族描述（可选）
    "settings_json": {}            // 家族设置（可选，JSON 格式）
  }
  ```
- **响应**: 创建的家族对象

#### 2.2 获取家族列表
- **接口**: `GET /api/clans`
- **描述**: 获取当前用户的家族列表
- **权限**: 需要认证
- **响应**: 家族数组

#### 2.3 获取家族详情
- **接口**: `GET /api/clans/:id`
- **描述**: 根据 ID 获取家族详情
- **权限**: 公开
- **路径参数**:
  - `id`: 家族 ID
- **响应**: 家族对象

#### 2.4 更新家族信息
- **接口**: `PATCH /api/clans/:id`
- **描述**: 更新家族信息（仅管理员可操作）
- **权限**: 需要认证（仅管理员）
- **路径参数**:
  - `id`: 家族 ID
- **请求体**: 同创建家族
- **响应**: 更新后的家族对象

#### 2.5 删除家族
- **接口**: `DELETE /api/clans/:id`
- **描述**: 删除家族（仅管理员可操作）
- **权限**: 需要认证（仅管理员）
- **路径参数**:
  - `id`: 家族 ID
- **响应**: 无内容（204）

#### 2.6 获取家族统计信息
- **接口**: `GET /api/clans/:id/statistics`
- **描述**: 获取家族的统计信息（人数、代数等）
- **权限**: 公开
- **路径参数**:
  - `id`: 家族 ID
- **响应**:
  ```json
  {
    "totalPersons": 100,
    "totalGenerations": 5,
    "maleCount": 52,
    "femaleCount": 48
  }
  ```

---

## 族谱树模块

### 基础信息
- **基础路径**: `/api/tree`
- **认证方式**: JWT Token

### 接口列表

#### 3.1 创建人员
- **接口**: `POST /api/tree/person`
- **描述**: 创建新人员并维护闭包表
- **权限**: 需要认证
- **请求体**:
  ```json
  {
    "clan_id": 0,              // 家族 ID（必填）
    "full_name": "string",       // 姓名（必填）
    "gender": "male",            // 性别（必填，male/female）
    "birth_date": "2026-06-20", // 出生日期（可选）
    "death_date": "2026-06-20", // 死亡日期（可选）
    "is_living": true,           // 是否在世（可选，默认 true）
    "parent_id": 0              // 父/母 ID（可选，用于建立父子关系）
  }
  ```
- **响应**: 创建的人员对象

#### 3.2 获取子树
- **接口**: `GET /api/tree/subtree/:rootPersonId`
- **描述**: 获取以指定人员为根的子树（树形结构）
- **权限**: 需要认证
- **路径参数**:
  - `rootPersonId`: 根人员 ID
- **响应**: 树形结构对象
  ```json
  {
    "id": 1,
    "full_name": "张三",
    "gender": "male",
    "children": [...]
  }
  ```

#### 3.3 移动子树
- **接口**: `PATCH /api/tree/move-subtree`
- **描述**: 将子树移动到新的父节点下
- **权限**: 需要认证
- **请求体**:
  ```json
  {
    "subtree_root_id": 0,    // 子树根节点 ID（必填）
    "new_parent_id": 0        // 新的父节点 ID（必填）
  }
  ```
- **响应**: 无内容（204）

---

## 导入模块

### 基础信息
- **基础路径**: `/api/import`
- **认证方式**: JWT Token

### 接口列表

#### 4.1 导入 Excel 文件
- **接口**: `POST /api/import/excel`
- **描述**: 上传并导入 Excel 文件（自动解析并创建人员）
- **权限**: 需要认证
- **请求格式**: `multipart/form-data`
- **请求参数**:
  - `file`: Excel 文件（.xlsx 格式，必填）
  - `clan_id`: 家族 ID（必填）
  - `column_mapping`: 列映射配置（可选，JSON 格式）
- **响应**:
  ```json
  {
    "success": true,
    "message": "导入完成: 成功 20 条, 失败 0 条",
    "successCount": 20,
    "failureCount": 0,
    "errors": []
  }
  ```

---

## 媒体模块

### 基础信息
- **基础路径**: `/api/media`
- **认证方式**: JWT Token

### 接口列表

#### 5.1 上传媒体文件（本地）
- **接口**: `POST /api/media/upload`
- **描述**: 上传照片/视频到本地
- **权限**: 需要认证
- **请求格式**: `multipart/form-data`
- **请求参数**:
  - `file`: 媒体文件（必填）
  - `clan_id`: 家族 ID（必填）
  - `uploader_id`: 上传者 ID（必填）
  - `taken_year`: 拍摄年份（可选）
  - `taken_location`: 拍摄地点（可选）
  - `description`: 描述（可选）
- **响应**: 创建的媒体对象

#### 5.2 上传媒体文件（OSS）
- **接口**: `POST /api/media/upload/oss`
- **描述**: 上传照片/视频到阿里云 OSS
- **权限**: 需要认证
- **请求参数**: 同 5.1
- **响应**: 同 5.1

#### 5.3 获取家族媒体列表
- **接口**: `GET /api/media/clan/:clanId`
- **描述**: 获取指定家族的媒体档案列表
- **权限**: 需要认证
- **路径参数**:
  - `clanId`: 家族 ID
- **查询参数**:
  - `taken_year`: 按年份筛选（可选）
  - `taken_location`: 按地点筛选（可选）
  - `person_id`: 按关联人物筛选（可选）
- **响应**: 媒体对象数组

#### 5.4 获取媒体详情
- **接口**: `GET /api/media/:id`
- **描述**: 根据 ID 获取媒体详情
- **权限**: 需要认证
- **路径参数**:
  - `id`: 媒体 ID
- **响应**: 媒体对象

#### 5.5 删除媒体
- **接口**: `DELETE /api/media/:id`
- **描述**: 删除媒体档案
- **权限**: 需要认证（仅上传者或管理员）
- **路径参数**:
  - `id`: 媒体 ID
- **响应**: 无内容（204）

#### 5.6 关联媒体到人物
- **接口**: `POST /api/media/link`
- **描述**: 将媒体关联到指定人物
- **权限**: 需要认证
- **请求体**:
  ```json
  {
    "media_id": 0,    // 媒体 ID（必填）
    "person_id": 0      // 人物 ID（必填）
  }
  ```
- **响应**: 无内容（204）

#### 5.7 取消媒体与人物的关联
- **接口**: `DELETE /api/media/link`
- **描述**: 取消媒体与人物的关联
- **权限**: 需要认证
- **请求体**: 同 5.6
- **响应**: 无内容（204）

#### 5.8 推荐其他家族的相似影像
- **接口**: `POST /api/media/recommend`
- **描述**: 根据地点和年份推荐其他家族的相似照片（聚落影像互联）
- **权限**: 需要认证
- **请求体**:
  ```json
  {
    "currentClanId": 0,     // 当前家族 ID（必填）
    "location": "string",     // 地点（可选）
    "takenYear": 0           // 拍摄年份（可选）
  }
  ```
- **响应**: 媒体对象数组

---

## 寻亲模块

### 基础信息
- **基础路径**: `/api/search`
- **认证方式**: JWT Token（部分接口需要）

### 接口列表

#### 6.1 创建寻亲帖
- **接口**: `POST /api/search/post`
- **描述**: 发布寻亲帖
- **权限**: 公开
- **请求体**:
  ```json
  {
    "origin_place": "string",      // 祖籍地（必填）
    "xipai_keywords": ["string"], // 字辈关键词数组（必填）
    "contact_info": "string",      // 联系方式（必填，将加密存储）
    "created_by": "string"        // 创建者 ID（可选）
  }
  ```
- **响应**: 创建的寻亲帖对象

#### 6.2 搜索寻亲帖
- **接口**: `GET /api/search/posts`
- **描述**: 搜索寻亲帖（支持关键词和地点筛选）
- **权限**: 公开
- **查询参数**:
  - `query`: 搜索关键词（必填）
  - `origin_place`: 按祖籍地筛选（可选）
- **响应**: 搜索结果数组（按匹配度排序）
  ```json
  [
    {
      "post": { ... },    // 寻亲帖对象
      "score": 10         // 匹配度得分
    }
  ]
  ```

#### 6.3 获取寻亲帖详情
- **接口**: `GET /api/search/post/:id`
- **描述**: 根据 ID 获取寻亲帖详情
- **权限**: 需要认证
- **路径参数**:
  - `id`: 寻亲帖 ID
- **响应**: 寻亲帖对象

#### 6.4 获取联系方式
- **接口**: `GET /api/search/post/:id/contact`
- **描述**: 获取寻亲帖的联系方式（需要权限）
- **权限**: 需要认证（仅授权用户）
- **路径参数**:
  - `id`: 寻亲帖 ID
- **响应**:
  ```json
  {
    "contact_info": "string"  // 解密后的联系方式
  }
  ```

---

## 打印模块

### 基础信息
- **基础路径**: `/api/print`
- **认证方式**: JWT Token（当前为公开）

### 接口列表

#### 7.1 导出族谱 PDF
- **接口**: `GET /api/print/genealogy/:clanId`
- **描述**: 生成并下载指定家族的族谱 PDF
- **权限**: 公开（未来将需要认证）
- **路径参数**:
  - `clanId`: 家族 ID
- **响应**: PDF 文件（application/pdf）

---

## 错误码说明

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无内容返回）|
| 400 | 请求参数错误 |
| 401 | 未认证（Token 无效或过期）|
| 403 | 无权限访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 认证说明

### JWT Token 使用方式

1. **登录/注册**: 调用认证接口，获取 `access_token`
2. **存储 Token**: 将 Token 存储到 localStorage（key: `geneasphere_token`）
3. **请求附加 Token**: 在后续请求的 Authorization 请求头中附加 Token：
   ```
   Authorization: Bearer <your_token>
   ```

### 前端 Axios 拦截器配置

```typescript
// utils/request.ts
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('geneasphere_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

---

## 数据模型说明

### Person（人员）
```typescript
interface Person {
  id: bigint;              // 人员 ID
  clan_id: bigint;          // 所属家族 ID
  full_name: string;         // 姓名
  gender: 'male' | 'female'; // 性别
  birth_date?: Date;        // 出生日期
  death_date?: Date;        // 死亡日期
  is_living: boolean;       // 是否在世
  created_at: Date;         // 创建时间
  updated_at: Date;         // 更新时间
}
```

### MediaArchive（媒体档案）
```typescript
interface MediaArchive {
  id: bigint;              // 媒体 ID
  clan_id: bigint;          // 所属家族 ID
  uploader_id: string;      // 上传者 ID
  file_url: string;         // 文件 URL
  taken_year?: number;      // 拍摄年份
  taken_location?: string;   // 拍摄地点
  description?: string;      // 描述
  created_at: Date;         // 创建时间
  updated_at: Date;         // 更新时间
}
```

### SearchPost（寻亲帖）
```typescript
interface SearchPost {
  id: bigint;              // 帖子 ID
  origin_place: string;      // 祖籍地
  xipai_keywords: string[]; // 字辈关键词
  contact_info: string;      // 联系方式（加密存储）
  created_by: string;       // 创建者 ID
  created_at: Date;         // 创建时间
  updated_at: Date;         // 更新时间
}
```

---

## 前端 API 封装使用方式

### 示例 1：登录
```typescript
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
await authStore.login('13800138000', 'password123');
```

### 示例 2：创建人员
```typescript
import { treeApi } from '@/api/tree';

const person = await treeApi.createPerson({
  clan_id: 1,
  full_name: '张三',
  gender: 'male',
  parent_id: 10,
});
```

### 示例 3：上传照片
```typescript
import { mediaApi } from '@/api/media';

const formData = new FormData();
formData.append('file', file);
formData.append('clan_id', '1');
formData.append('uploader_id', 'user-id');

const result = await mediaApi.uploadMedia(formData);
```

---

## 部署说明

### 后端启动
```bash
cd apps/server
npm run start:dev
```

### 前端启动
```bash
cd apps/web
npm run dev
```

### 环境变量配置
创建 `.env` 文件：
```
DATABASE_URL=postgresql://user:password@localhost:5432/geneasphere
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
```

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-06-20 | 初始版本，包含认证、家族、族谱树、导入、媒体、寻亲、打印模块 |

---

**文档结束**
