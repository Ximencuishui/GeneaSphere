# 册谱版式渲染端到端测试报告

- 日期：2026-11-14
- 环境：本机 Vite `http://localhost:5173`，接口 `http://127.0.0.1:3101`，数据库经 SSH 隧道 `127.0.0.1:15432`
- 账号：演示管理员 `13800000000`（一键体验族谱管理演示）
- 家族：`zhuxi-demo`（朱熹族谱演示）
- 页面：`/zupu/zhuxi-demo/genealogy/typeset`
- 执行方式：Cursor 浏览器逐项点击

## 结论

这条路径通过：锁谱状态下选择欧式、世代 1–1，生成预览得到可下载 PDF，下单印刷创建 `PENDING` 工作项，刷新状态仍为待处理，整页刷新后工作流第 8 步变为完成。

下单前工作流是 4/8，第 8 步为未完成。下单后接口已是 5/8，但页面上的工作流条要等整页刷新才变成 5/8。

## 步骤与结果

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | 打开册谱版式渲染页 | 已登录。锁谱信息为「端到端印刷验证」，操作人「演示用户·管理员」，`locked=true` |
| 2 | 版式选欧式，世代起止填 1 | 提交体 `layout=ou`，`generation_start=1`，`generation_end=1`，版本名「族谱·2026版」，风格 `traditional` |
| 3 | 点击「生成预览」并确认「开始生成」 | `POST /api/genealogy-documents/zhuxi-demo` 返回 201，`job_id=49250161-58e6-42aa-aa6b-684d49906c9d`，`status=pending` |
| 4 | 页面轮询渲染任务 | 8 次 `processing` 均为 HTTP 200，随后一次 `completed` 为 HTTP 200。本次没有出现 5xx |
| 5 | 查看生成结果 | 出现「下载 PDF」「下单印刷」。文档 id `6`，`clan_id` `1`（均为字符串），`file_size` `332176`（数字），`storage_status=READY`，`page_count=35`，`scope_summary.layout=ou` |
| 6 | 点击「下单印刷」 | `POST /api/genealogy-documents/zhuxi-demo/6/print-jobs` 返回 201。工作项 id `1`，`document_id=6`，`status=PENDING`，`layout_params.layout=ou`，世代 1–1 |
| 7 | 页面展示工作项 | 「印刷工作项 1」，状态「待处理」，版式 `ou`，文档 `6`，PDF 生成时间 2026/11/14 09:38:16 |
| 8 | 点击「刷新状态」 | `GET .../print-jobs/1` 返回 200，`status` 仍为 `PENDING`，页面仍显示「待处理」 |
| 9 | 整页刷新后看工作流条 | `5 / 8 步`，63%。第 8 步「预览、印刷出谱」class 为 `done` |

服务端在生成时记录：`册谱预览 layout=ou entries=10`。

## 工作流

下单前，页面工作流条为 `4 / 8 步`，第 8 步 class 为 `todo`，角标 3。

下单之后、刷新页面之前，同一条工作流条仍停在 `4 / 8`。同期接口 `GET /api/genealogy-workflow/status?clanId=zhuxi-demo` 已经是 `done_count=5`，`print.status=done`。

整页刷新后：

| 步骤 | 状态 | 角标 | 详情 |
|---|---|---|---|
| 终审定稿 | done | 3 | 已锁定 3 个谱稿版本 |
| 册谱版式渲染 | done | 11 | 已生成 11 卷册谱 |
| 预览、印刷出谱 | done | 3 | 已有 3 笔印刷 |

第 8 步的完成来自 `genealogy_print_jobs` 计数大于 0。角标和「已有 3 笔印刷」仍是 `print_orders` 的 3 笔，没有把这次新建的工作项算进去。终审定稿角标从 2 变为 3，是因为又写入了一份族谱文档。

## 本次核对到的序列化

完成态轮询响应里，`document.id` 与 `document.clan_id` 是字符串，`file_size` 是数字。响应可以被页面消费，没有再出现 `Do not know how to serialize a BigInt`。

## 遗留

- 演示家族仍处于锁定，版本名「端到端印刷验证」。本次没有解锁。
- `file_url` 为对象键 `genealogy/1/3/38c86ef046fc40ca93fe148d2231a386.pdf`，不是绝对地址。
- `scope_summary.person_count` 为 1379。世代过滤之后日志里的成书条目是 10 条。
- 工作流条在下单后不会自己重拉，需要整页刷新才能看到第 8 步完成。
