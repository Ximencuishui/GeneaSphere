# GeneaSphere 数据架构图 (v1.0)

## 1. 核心实体 (Core Entities)

### 1.1 用户体系
- `users`: 平台用户（族人/管理员）
  - id (UUID, PK)
  - phone (String, Unique)
  - password_hash (String)
  - created_at (Timestamp)
  - updated_at (Timestamp)

- `clans`: 家族单位（租户）
  - id (BigInt, PK)
  - name (String)
  - description (Text, Nullable)
  - admin_user_id (UUID, FK -> users.id)
  - settings_json (JSON, 存储家族配置如游客权限/字辈规则)
  - created_at (Timestamp)
  - updated_at (Timestamp)

### 1.2 族谱核心 (Genealogy Core)
- `persons`: 人物基本信息
  - id (BigInt, PK)
  - clan_id (BigInt, FK -> clans.id)
  - full_name (String)
  - gender (Enum: male/female/other)
  - birth_date (Date, Nullable)
  - death_date (Date, Nullable)
  - is_living (Boolean, Default true)
  - avatar_url (String, Nullable)
  - bio_text (Text, 个人详情博客)
  - privacy_level (Enum: public/clan_member/admin_only)
  - created_at (Timestamp)
  - updated_at (Timestamp)

- `family_units`: 家庭单元（处理夫妻/入赘/续弦）
  - id (BigInt, PK)
  - clan_id (BigInt, FK -> clans.id)
  - husband_id (BigInt, FK -> persons.id, Nullable)
  - wife_id (BigInt, FK -> persons.id, Nullable)
  - union_type (Enum: marriage/adoption/etc.)
  - start_date (Date, Nullable)
  - end_date (Date, Nullable)
  - note (String, 备注如"招赘"/"续弦")

- `family_children`: 家庭与子女关联
  - id (BigInt, PK)
  - family_id (BigInt, FK -> family_units.id)
  - child_id (BigInt, FK -> persons.id)
  - birth_order (Int, Default 0)

### 1.3 闭包表 (Closure Table) - 核心关系索引
- `person_ancestry`: 预计算祖先路径（高性能查询）
  - ancestor_id (BigInt, FK -> persons.id)
  - descendant_id (BigInt, FK -> persons.id)
  - depth (Int)
  - PRIMARY KEY (ancestor_id, descendant_id)
  - INDEX (descendant_id, ancestor_id)

## 2. 扩展模块 (Extended Modules)

### 2.1 寻亲系统 (Seek Relative Module)
- `seek_relative_posts`: 寻亲帖
  - id (BigInt, PK)
  - publisher_user_id (UUID, FK -> users.id)
  - clan_id (BigInt, FK -> clans.id, Nullable)
  - title (String)
  - content (Text)
  - origin_place (String, 祖籍地)
  - xipai_keywords (String[], 字辈关键词数组)
  - contact_info_encrypted (String, 加密联系方式)
  - status (Enum: pending/verified/resolved)
  - view_count (Int, Default 0)
  - created_at (Timestamp)

### 2.2 影像馆 (Media Archive Module)
- `media_archive`: 公共影像档案
  - id (BigInt, PK)
  - clan_id (BigInt, FK -> clans.id)
  - uploader_id (UUID, FK -> users.id)
  - media_type (Enum: photo/video/audio)
  - file_url (String)
  - thumbnail_url (String, Nullable)
  - title (String, Nullable)
  - description (Text, Nullable)
  - taken_year (Int, Nullable)
  - taken_location (String, Nullable)
  - category (Enum: life/ancestor_worship/landscape)
  - is_public (Boolean, Default true)
  - similarity_group_id (BigInt, Nullable, 相似图片分组)
  - created_at (Timestamp)

- `media_person_links`: 影像与人物关联
  - media_id (BigInt, FK -> media_archive.id)
  - person_id (BigInt, FK -> persons.id)
  - role_in_photo (String, Nullable, 如"左二"、"正中")

### 2.3 聚落系统 (Settlement Module)
- `settlements`: 村寨/聚落信息
  - id (BigInt, PK)
  - name (String)
  - province/city/county/town/village (String)
  - geo_hash (String, 地理位置哈希)
  - description (Text)
  - cover_image_url (String)
  - created_at (Timestamp)

- `clan_settlements`: 家族与聚落关联（多对多）
  - clan_id (BigInt, FK -> clans.id)
  - settlement_id (BigInt, FK -> settlements.id)
  - relation_type (Enum: primary/related)
  - PRIMARY KEY (clan_id, settlement_id)

## 3. 系统配置 (System Config)
- `system_settings`: 平台级配置
  - key (String, PK)
  - value (JSON)
  - description (String)

## 4. 版本信息
- 文档版本: v1.0
- 更新时间: 2025-04-05
- 作者: GeneaSphere PM Team
