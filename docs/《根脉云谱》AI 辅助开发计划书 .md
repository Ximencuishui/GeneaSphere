《根脉云谱》AI 辅助开发计划书 

项目代号: GeneaSphere
技术栈: Vue 3 + Vite + Pinia + NestJS + PostgreSQL + AntV G6
AI 指令风格: 我们将使用 @filename 引用文件，并使用 // TODO: 和 // CONSTRAINT: 来约束 AI 行为。

一、 目录规范与初始化

1. 目录结构约定

/genesasphere
├── apps/
│   ├── web/                 # 前端 (Vue 3)
│   │   ├── src/
│   │   │   ├── api/         # 接口定义
│   │   │   ├── assets/
│   │   │   ├── components/  # 通用组件
│   │   │   ├── layouts/     # 布局
│   │   │   ├── pages/       # 页面
│   │   │   ├── router/
│   │   │   ├── store/       # Pinia
│   │   │   └── utils/
│   └── server/              # 后端 (NestJS)
│       ├── src/
│       │   ├── auth/        # 鉴权
│       │   ├── clan/        # 家族模块
│       │   ├── tree/        # 族谱树核心
│       │   ├── media/       # 影像馆
│       │   ├── search/      # 寻亲
│       │   └── common/      # 公共DTO/Guards
├── database/
│   ├── migrations/          # 数据库迁移脚本
│   └── seeds/               # 种子数据
└── .cursorrules             # Cursor 专用规则文件


2. .cursorrules (关键！)

在项目根目录创建此文件，告诉 AI 必须遵守的规则：
# Project Rules for Cursor

1. **Language**: All code comments and variable names must be in English. UI text can be Chinese.
2. **Database**: Use PostgreSQL. Use `snake_case` for DB columns and tables. Use `camelCase` for TS variables.
3. **Frontend**: Use Vue 3 Composition API with `<script setup>`. Use Ant Design Vue or Element Plus.
4. **Backend**: Use NestJS. Use DTOs for all inputs. Use Decorators for validation.
5. **Security**: NEVER hardcode secrets. Use Env Variables.
6. **Testing**: Every function must have a corresponding unit test or E2E test logic described in comments.
7. **Constraints**: When editing `closure_table`, always mention the "Ancestry Pattern".


二、 开发阶段与迭代计划

我们将开发分为 4 个 Sprint，每个 Sprint 结束后进行人工验收。

Sprint 1: 地基与身份认证 (The Foundation)

目标: 跑通前后端，实现家族创建和管理员登录。

Step 模块 任务描述 Cursor Prompt 示例 回测/验收标准

1.1 DB 创建基础表 users, clans。 @database/schema.sql Create tables for users (id, phone, password_hash) and clans (id, name, admin_user_id). Use UUID for PKs. 表结构符合范式，无冗余。

1.2 Backend 实现注册/登录 API (JWT)。 @apps/server/src/auth Create AuthModule with login and register endpoints. Use bcrypt for passwords and JWT for tokens. Postman 测试接口，能返回 Token。

1.3 Frontend 登录/注册页面。 @apps/web/src/pages/login Create login page with Ant Design Vue. On success, store JWT in Pinia and redirect to /dashboard. 能成功登录并跳转。

1.4 Backend 家族创建 API。 @apps/server/src/clan Create ClanModule. Only authenticated users can create a clan and become the admin. 创建家族后，数据库 clans 表有记录，users 表关联正确。

Sprint 1 验收: 能用管理员账号登录，并创建一个家族。此时还没有族谱树。

Sprint 2: 核心心脏——闭包表与建树 (The Core)

目标: 实现“中式族谱”的数据存储与基础展示。这是最难的环节。

Step 模块 任务描述 Cursor Prompt 示例 回测/验收标准

2.1 DB 设计闭包表。创建 persons, families, person_ancestry。 @database/schema.sql Design the Closure Table structure. Tables: persons (id, clan_id, name, gender), families (husband_id, wife_id), person_ancestry (ancestor_id, descendant_id, depth). CONSTRAINT: Ensure data integrity for parent-child relationships. 理解闭包表逻辑。person_ancestry 能存储路径。

2.2 Backend 新增人员 API。 @apps/server/src/tree Create PersonService. Implement addPerson(dto). When adding a person, automatically populate the person_ancestry table for all ancestors. 关键测试：添加一个曾孙，检查 person_ancestry 是否自动生成了曾祖->祖->父->子的 4 条记录。

2.3 Backend 查询子树 API。 @apps/server/src/tree Implement getSubTree(personId). Use the person_ancestry table to fetch all descendants efficiently without recursion. API 返回的 JSON 结构是标准的树形结构，能被前端直接渲染。

2.4 Frontend 集成 AntV G6。 @apps/web/src/components/GenealogyTree.vue Install @antv/g6. Fetch data from /api/tree/subtree and render a basic vertical tree graph. 浏览器能看到一个基础的树状图，节点显示人名。

2.5 Frontend 节点交互。 @apps/web/src/components/GenealogyTree.vue Add click event to nodes. Clicking a node highlights it and fetches details. 点击节点有高亮效果。

Sprint 2 验收: 手动在数据库插入一个 3 代 7 人的家族数据，前端能正确渲染出树，且层级关系正确。

Sprint 3: 功能深化——Excel导入与时光长廊 (The Features)

目标: 实现数据批量导入和情感化功能。

Step 模块 任务描述 Cursor Prompt 示例 回测/验收标准

3.1 Backend Excel 解析服务。 @apps/server/src/tree Create ImportService. Use 'xlsx' library. Parse Excel buffer, map columns to DTOs, and call addPerson recursively. Handle errors gracefully. 上传提供的 test-data.xlsx，系统自动创建 20 个人物，且关系正确。

3.2 Frontend 导入向导 UI。 @apps/web/src/pages/import Create Import Wizard component. Step 1: Upload Excel. Step 2: Map Columns (e.g., link '儿子' column to 'Name'). Step 3: Confirmation. UI 流程顺畅，列映射功能正常。

3.3 DB 影像馆表设计。 @database/schema.sql Create media_archive table (id, clan_id, url, taken_year, location, description). Create media_person_link pivot table. 表结构支持多对多关系。

3.4 Frontend 时光长廊页面。 @apps/web/src/pages/timeline Create Timeline page. Fetch media list sorted by taken_year. Display as a waterfall grid. Click to open lightbox. 能看到按年份排序的照片墙。

3.5 Feature 聚落关联逻辑。 @apps/server/src/media Implement logic to find photos from nearby locations (same village) and similar years (within 2 years). Return as "Related Media". 查询某张照片时，能返回同村其他家族（测试数据）的照片推荐。

Sprint 3 验收: 成功导入 Excel 并生成树；能看到“时光长廊”；能看到“同村照片推荐”的逻辑生效。

Sprint 4: 商业闭环——寻亲与印刷 (The Business)

目标: 实现高价值功能和支付转化。

Step 模块 任务描述 Cursor Prompt 示例 回测/验收标准

4.1 DB 寻亲表设计。 @database/schema.sql Create seek_relative_posts table. Include origin_place, xipai_keywords (array), contact_info_encrypted. 支持模糊查询字辈。

4.2 Backend 寻亲匹配算法。 @apps/server/src/search Create SearchService. Implement fuzzy matching for xipai_keywords and location. Rank results by relevance score. 输入“宏道”能匹配到“宏道永正”。

4.3 Frontend 寻亲广场。 @apps/web/src/pages/search Create SeekRelative page. List posts. Add a "Publish" button with a form (Title, Origin Place, Xipai). 页面美观，发布功能正常。

4.4 Backend PDF 生成。 @apps/server/src/print Use Puppeteer to generate a PDF from HTML template. The template should display the family tree and basic info. 调用接口能下载一个包含族谱结构的 PDF 文件。

4.5 Frontend 打印预览与下单。 @apps/web/src/pages/print Create PrintPreview page. Show PDF iframe. Add "Order Now" button (mock payment). 能看到 PDF 预览，点击下单按钮有响应。

Sprint 4 验收: 完整的寻亲发布与匹配流程；成功生成可下载的 PDF 族谱。

三、 AI 交互与代码审查 (Code Review) 策略

为了防止 AI 乱写，每次生成代码后，你必须执行以下 Review Checklist：

1.  看 SQL: 如果是写闭包表，问自己：“如果删除中间节点，这条 SQL 能清理掉所有下游路径吗？”（AI 经常漏写 DELETE 逻辑）。
2.  看 DTO: 后端接口是否有严格的 class-validator 验证？
3.  看 Index: 涉及查询 person_ancestry 的地方，是否利用了索引？
4.  看 Mock: 前端组件是否使用了 Mock 数据？如果是，要求 AI 改为从 Pinia Store 或 API 获取。

四、 阶段性交付物清单

1.  Sprint 1 交付: 可登录的后台框架。
2.  Sprint 2 交付: 核心 MVP。一个能手动录入、能看树的族谱系统（这是最重要的里程碑）。
3.  Sprint 3 交付: 能导入 Excel 的实用工具 + 有情感的影像馆。
4.  Sprint 4 交付: 可运营的商业化产品（含寻亲、印刷）。

PM 建议：
现在不要急着写代码。我们先从 Sprint 2 的数据库设计 开始，因为这是地基中的地基。