寻根路（xungenlu.cn）腾讯云 COS 存储方案需求文档 v1.0

文档版本：v1.0  

对应系统版本：寻根路 v1.0  

前置依赖：腾讯云账号已开通 COS 与 CDN 服务、域名 xungenlu.cn 已备案  

面向对象：后端开发团队、运维团队、前端开发团队  

1. 方案概述

1.1 背景

寻根路平台需要存储大量用户上传的家族老照片、扫描件、AI 处理后的图片/视频、印刷 PDF 等文件。直接存储在应用服务器磁盘会导致扩展困难、带宽瓶颈、数据丢失风险。采用腾讯云对象存储（COS） + CDN 的组合，可实现高可用、低成本、全球加速的文件存储与分发。

1.2 目标

• 实现文件上传、存储、分发全链路云原生化。

• 按数据访问频率分层存储，控制成本。

• 全站静态资源（图片、视频、PDF）通过 CDN 加速，提升用户加载体验。

• 保障数据安全（访问权限、备份、防盗链）。

2. 存储分层策略

2.1 分层模型

层级 COS 存储类型 适用内容 访问特征 建议保留时间

热（Hot） 标准存储 缩略图、展示图、视频成品、印刷 PDF、H5 静态资源 高频读取（每日数千次） 永久

温（Warm） 智能分层存储 原始老照片、AI 工具箱原图与结果图、扫描件 PDF 低频读取（偶尔查看原图或重生成） 永久

冷（Cold） 归档存储 数据库备份 dump、废弃项目文件 几乎不读（仅合规保留） 按需保留，至少 90 天后可删除

2.2 成本估算（参考）

• 标准存储 ≈ 0.118 元/GB/月  

• 智能分层 ≈ 0.08 元/GB/月（平均，取决于访问频次）  

• 归档存储 ≈ 0.033 元/GB/月  

• CDN 流量 ≈ 0.21 元/GB（境内）

假设初期 500GB 热数据 + 1TB 温数据 + 200GB 冷数据，月存储成本约 59 + 80 + 6.6 ≈ 145.6 元；CDN 流量按 200GB/月计约 42 元。总计约 188 元/月，远低于自建服务器。

3. Bucket 规划

3.1 Bucket 命名

Bucket 名称 存储类型 用途 访问权限

xungenlu-hot-{appid} 标准存储 热数据 公有读（配合 CDN）

xungenlu-cold-{appid} 低频/归档 冷数据 私有读写（仅服务端）

{appid} 为腾讯云账号 APPID，自动附加。

3.2 目录结构

热 Bucket（xungenlu-hot）


/media/thumb/{clan_id}/{uuid}.webp          # 缩略图（瀑布流/光晕卡片）
/media/display/{clan_id}/{uuid}.jpg         # 展示图（照片详情/时光长廊）
/video/mp4/{project_id}/{uuid}.mp4          # 音像墙/直系血缘视频成品
/print/pdf/{order_id}/{uuid}.pdf            # 印刷 PDF 成品
/h5/static/{version}/                       # 公众号 H5 静态资源（JS/CSS/字体）


冷 Bucket（xungenlu-cold）


/media/original/{clan_id}/{uuid}.{ext}      # 原始上传图（老照片原件）
/toolbox/raw/{user_id}/{uuid}.{ext}         # AI 工具箱原始输入/中间产物
/scan/pdf/{clan_id}/{uuid}.pdf              # 扫描件 PDF 原始文件
/backup/db/{date}/dump.sql.gz               # 数据库备份


3.3 文件命名规范

• 所有文件名使用 UUID v4（不带横杠），避免冲突和猜测。

• 扩展名统一小写（.jpg, .png, .webp, .mp4, .pdf）。

• 同一文件的不同版本（原始/展示/缩略图）通过路径层级区分，而非文件名后缀。

4. CDN 加速配置

4.1 域名规划

• CDN 加速域名：cdn.xungenlu.cn（CNAME 到腾讯云 CDN 分配的 .myqcloud.com 域名）

• 源站：xungenlu-hot-{appid}.cos.ap-guangzhou.myqcloud.com

4.2 缓存规则

路径前缀 缓存时间 说明

/media/thumb/ 365 天 缩略图永不改变，长缓存

/media/display/ 365 天 展示图上传后不变，长缓存

/video/mp4/ 30 天 视频成品基本不变

/print/pdf/ 7 天 印刷 PDF 可能重新生成

/h5/static/ 365 天 静态资源带版本号，长缓存

重要：媒体文件一旦上传，路径中的 {uuid} 即固定。如需替换，上传新文件使用新 UUID，旧链接自然失效。禁止原地覆盖。

4.3 HTTPS 配置

• 为 cdn.xungenlu.cn 申请 SSL 证书（腾讯云免费 DV 证书或上传自有证书）。

• 开启 CDN 强制 HTTPS 跳转。

4.4 防盗链

• 开启 CDN Referer 防盗链：允许空 Referer（微信浏览器场景）+ 允许白名单域名（xungenlu.cn, *.xungenlu.cn）。

• 可选：开启 时间戳鉴权（URL 过期签名），用于保护付费视频/PDF（v1.1 再考虑）。

5. 上传与处理流程

5.1 图片上传（用户上传老照片）


用户上传 → 服务端接收 → 生成三种尺寸：
  1. 原始图 → 上传至冷 Bucket (/media/original/)
  2. 展示图（1920px 宽，JPEG 80% 质量）→ 上传至热 Bucket (/media/display/)
  3. 缩略图（300px 宽，WebP）→ 上传至热 Bucket (/media/thumb/)

返回给前端：仅返回展示图 URL 和缩略图 URL（CDN 地址），原始图 URL 不返回前端。


5.2 视频/PDF 生成

• AI 音像墙、印刷 PDF 等由服务端生成后直接上传至热 Bucket，返回 CDN URL。

5.3 上传凭证（安全）

• 服务端使用 临时密钥（STS）授予前端直传权限，避免暴露永久密钥。

• 前端上传时限制路径前缀（如 /media/original/{user_id}/），防止覆盖他人文件。

6. 访问权限控制

6.1 热 Bucket（公有读 + CDN）

• Bucket 权限：公有读，私有写。

• 所有读请求通过 CDN 回源，不直接暴露 COS 源站域名给前端。

• CDN 回源时使用 CDN 回源鉴权（开启 CDN 回源鉴权，防止盗刷流量）。

6.2 冷 Bucket（私有读写）

• Bucket 权限：私有读写。

• 仅服务端通过永久密钥或临时密钥访问。

• 前端如需查看原始图（“查看原图”按钮），由服务端生成 预签名 URL（有效期 5 分钟）返回给前端。

6.3 跨域配置（CORS）

• 热 Bucket 开启 CORS，允许 https://www.xungenlu.cn 和 https://*.xungenlu.cn。

• 冷 Bucket 不开启 CORS（仅服务端访问）。

7. 数据备份与容灾

7.1 备份策略

• 数据库备份：每日凌晨自动 dump，上传至冷 Bucket /backup/db/，保留 30 天。

• 媒体文件：本身存储在 COS 已是多副本，无需额外备份。关键原始文件可设置 跨区域复制 到另一个地域的冷 Bucket（如广州 → 上海），应对区域性故障。

7.2 生命周期管理

• 冷 Bucket 中 /backup/db/ 超过 30 天的文件自动删除。

• 废弃项目文件（如用户已删除的家族数据）标记后 7 天转入归档，90 天后删除。

8. 监控与告警

8.1 COS 监控

• 关注 存储量、请求数、流量。

• 设置月度预算告警（如存储费用超过 200 元/月时通知管理员）。

8.2 CDN 监控

• 关注 4xx/5xx 错误率、回源率、带宽峰值。

• 回源率过高（>5%）说明缓存策略不合理，需优化。

8.3 日志

• 开启 COS 访问日志（投递到另一个日志 Bucket），用于审计和排查“资源解析失败”问题。

9. 与现有模块的集成

模块 COS 使用场景

时光长廊 展示图/缩略图从 CDN 加载；原始图通过预签名 URL 查看

迁徙地图 缩略图从 CDN 加载，光晕效果图片

AI 工具箱 原始图存冷 Bucket，处理结果存热 Bucket

历史音像墙 视频成品存热 Bucket，CDN 分发

印刷模块 PDF 存热 Bucket，预览和下载走 CDN

公众号 H5 静态资源（JS/CSS/字体）存热 Bucket，CDN 加速

短信/邀请二维码 二维码图片存热 Bucket（短期）

10. 资源解析失败问题排查指引（关联）

你之前遇到的 资源解析服务请求失败，按以下顺序排查：

1. 确认域名解析：nslookup cdn.xungenlu.cn 是否返回腾讯云 CDN 的 IP？若否，检查 CNAME 记录。
2. 确认 CDN 配置：CDN 加速域名是否已配置源站为 xungenlu-hot-{appid}.cos.ap-guangzhou.myqcloud.com？
3. 确认 Bucket 权限：热 Bucket 是否已开启“公有读”？CDN 回源鉴权是否已关闭（或配置正确）？
4. 确认前端资源地址：前端代码中所有 <img>、<video>、<a> 的 src 是否都写为 https://cdn.xungenlu.cn/...？是否存在写死 xungenlu.cn 或 COS 裸域名的残留？
5. 确认微信环境：若在微信浏览器内，公众号后台的 JS 接口安全域名 和 网页授权域名 是否已添加 cdn.xungenlu.cn？

最可能的原因：前端构建产物中某个资源（如 favicon.ico、og:image）写成了相对路径或 https://xungenlu.cn/xxx，但该路径并未映射到 COS 或 Nginx 上。

11. 验收标准

1. 上传一张测试图片，服务端自动生成原始图、展示图、缩略图，并分别存入冷/热 Bucket。
2. 前端访问 https://cdn.xungenlu.cn/media/thumb/{uuid}.webp 能正常加载图片。
3. 前端点击“查看原图”时，服务端返回的预签名 URL 有效期为 5 分钟，过期后无法访问。
4. CDN 缓存命中率 > 90%（可通过 CDN 控制台查看）。
5. 冷 Bucket 中的文件无法通过公网直接访问（403）。
6. 数据库备份文件每日自动上传至冷 Bucket，保留 30 天后自动删除。

12. 后续迭代

• v1.1：开启 CDN 时间戳鉴权，保护付费视频/PDF。

• v1.2：引入图片实时处理（图片瘦身、WebP 自适应），减少存储和带宽。

• v1.3：跨区域复制至异地 Bucket，提升容灾等级。

版本修订记录

版本 日期 修订内容

v1.0 2026-06-18 初版，覆盖寻根路项目腾讯云 COS 完整方案
