#!/usr/bin/env node
/**
 * 修谱工作流用例清单的可执行检查。
 * 对照 docs/修谱工作流测试用例清单.md 的用例编号。
 *
 * 前置：本地 API（默认 http://127.0.0.1:3101）和数据库隧道。
 * 运行：node tests/workflow/xiupu-cases.e2e.mjs
 *
 * 每个用例使用新建族谱，结束时删除。不改 zhuxi-demo。
 * 接口断言走真实 HTTP。悬停、按钮、弹窗、旧地址属于前端规则，对照源码锁定文案和跳转。
 */
import dotenv from 'dotenv'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve('apps/server/.env') })
dotenv.config()

const BASE = process.env.WORKFLOW_TEST_BASE || 'http://127.0.0.1:3101'
const REPORT_FILE = join(__dirname, 'reports', 'xiupu-cases-report.json')
mkdirSync(join(__dirname, 'reports'), { recursive: true })

const prisma = new PrismaClient()
const checks = []
let failed = 0

function check(id, name, ok, detail = '') {
  checks.push({ id, name, ok: !!ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ` — ${detail}` : ''}`)
}

function msg(data) {
  const value = data?.message ?? data?.error ?? ''
  return Array.isArray(value) ? value.join(' ') : String(value)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  return { status: res.status, data }
}

function stage(workflow, key) {
  return workflow.stages.find((item) => item.key === key)
}

/** 与 GenealogyWorkflowBar.stepTitle 同一套分支。 */
function hoverTitle(target, stages) {
  if (!target.blocked) return target.detail
  const index = stages.findIndex((item) => item.key === target.key)
  const blocker = stages.slice(0, index).find((item) => item.status !== 'done')
  if (!blocker) return target.detail
  if (blocker.status === 'returned') {
    const source = blocker.returned_from_label || blocker.label
    return `${source}环节已驳回，请先处理：${blocker.label}`
  }
  if (blocker.status === 'suspended') return '本项目当前已搁置，恢复流转后才可继续推进'
  return `请先完成上一环节：${blocker.label}`
}

const root = resolve('.')
const workflowBar = readFileSync(join(root, 'apps/web/src/components/admin/GenealogyWorkflowBar.vue'), 'utf8')
const finalizePage = readFileSync(join(root, 'apps/web/src/views/admin/GenealogyFinalizePage.vue'), 'utf8')
const errataPage = readFileSync(join(root, 'apps/web/src/views/admin/CrowdsourceEditPage.vue'), 'utf8')
const dataPage = readFileSync(join(root, 'apps/web/src/views/admin/GenealogyDataPage.vue'), 'utf8')
const bioPage = readFileSync(join(root, 'apps/web/src/views/admin/BioReviewPage.vue'), 'utf8')
const routerFile = readFileSync(join(root, 'apps/web/src/router/index.ts'), 'utf8')
const layoutFile = readFileSync(join(root, 'apps/web/src/layouts/AdminLayout.vue'), 'utf8')

async function status(slug, token) {
  const res = await api(`/api/genealogy-workflow/status?clanId=${slug}`, { token })
  return res
}

async function patchSettings(slug, token, body) {
  return api('/api/genealogy-workflow/settings', { method: 'PATCH', token, body: { clanId: slug, ...body } })
}

const createdClanIds = []

try {
  const health = await api('/api/health')
  check('ENV', '接口健康', health.status === 200, `status=${health.status}`)

  const ownerLogin = await api('/api/auth/demo-login', { method: 'POST', body: {} })
  const ownerToken = ownerLogin.data?.access_token
  const ownerId = ownerLogin.data?.user?.id
  check('ENV', '族长演示登录', ownerLogin.status === 201 && !!ownerToken, `status=${ownerLogin.status}`)

  const editorLogin = await api('/api/auth/demo-member-login', { method: 'POST', body: {} })
  const editorToken = editorLogin.data?.access_token
  const editorId = editorLogin.data?.user?.id
  check('ENV', '主修演示登录', !!editorToken && !!editorId, `status=${editorLogin.status}`)
  if (!ownerToken || !editorId) throw new Error('登录失败，后续用例无法执行')

  const suffix = Date.now().toString(36)
  const clanARes = await api('/api/clans', { method: 'POST', token: ownerToken, body: { name: `用例甲${suffix}` } })
  const clanBRes = await api('/api/clans', { method: 'POST', token: ownerToken, body: { name: `用例乙${suffix}` } })
  const clanA = await prisma.clan.findUnique({ where: { slug: clanARes.data.slug } })
  const clanB = await prisma.clan.findUnique({ where: { slug: clanBRes.data.slug } })
  createdClanIds.push(clanA.id, clanB.id)
  await prisma.clanMember.create({ data: { clan_id: clanA.id, user_id: editorId, role: 'ADMIN' } })

  let res = await status(clanA.slug, ownerToken)
  let w = res.data

  check('S01', 'project 为 done，digitize 为 current', stage(w, 'project').status === 'done' && stage(w, 'digitize').status === 'current')
  check('S01', '进度 1/8', w.done_count === 1 && w.total_count === 8 && w.progress === 13, `done=${w.done_count} progress=${w.progress}`)
  check('S01', '默认严格串行，其后节点置灰', w.mode === 'serial' && ['internal_review', 'errata_notice', 'errata_revise', 'lock', 'render', 'print'].every((key) => stage(w, key).blocked))
  check('S03', '谱稿初审悬停指向旧谱电子化', hoverTitle(stage(w, 'internal_review'), w.stages) === '请先完成上一环节：旧谱电子化')

  const free = await patchSettings(clanA.slug, ownerToken, { mode: 'free' })
  const serialB = await status(clanB.slug, ownerToken)
  check('F01', '只把当前族谱改成自由补录', free.data.mode === 'free' && serialB.data.mode === 'serial')
  check('F01', '自由模式不再因前置置灰', free.data.stages.every((item) => item.blocked === false))
  check('F01', '未置灰节点悬停用自身说明', hoverTitle(stage(free.data, 'internal_review'), free.data.stages) === stage(free.data, 'internal_review').detail)

  const unlockedGenerate = await api(`/api/genealogy-documents/${clanA.slug}`, {
    method: 'POST',
    token: ownerToken,
    body: { version_name: '未锁谱', style: 'traditional', layout: 'su' },
  })
  check('F02', '自由模式仍禁止未锁谱生成册谱', unlockedGenerate.status === 409 && msg(unlockedGenerate.data).includes('请先完成终审定稿锁谱，再生成册谱'), msg(unlockedGenerate.data))
  check('L03', '未锁谱生成接口返回同一句提示', msg(unlockedGenerate.data) === '请先完成终审定稿锁谱，再生成册谱')

  await patchSettings(clanA.slug, ownerToken, { mode: 'serial' })
  const suspended = await patchSettings(clanA.slug, ownerToken, { suspend: 'digitize' })
  w = suspended.data
  check('P01', '旧谱电子化变为 suspended', stage(w, 'digitize').status === 'suspended')
  check('P01', '其后节点置灰且悬停为搁置文案', ['internal_review', 'lock', 'print'].every((key) => stage(w, key).blocked && hoverTitle(stage(w, key), w.stages) === '本项目当前已搁置，恢复流转后才可继续推进'))
  check('P01', '搁置不计入 done', w.done_count === 1 && w.progress_paused === true)
  const resumed = await patchSettings(clanA.slug, ownerToken, { resume: 'digitize' })
  w = resumed.data
  check('P02', '取消搁置后旧谱电子化回到 current', stage(w, 'digitize').status === 'current' && w.progress_paused === false)
  check('P02', '其后节点仍按串行置灰', stage(w, 'internal_review').blocked && hoverTitle(stage(w, 'internal_review'), w.stages) === '请先完成上一环节：旧谱电子化')

  const earlyVolume = await prisma.bookVolume.create({
    data: { clan_id: clanA.id, title: '提前卷', type: 'document', created_by: ownerId, content: 'x' },
  })
  res = await status(clanA.slug, ownerToken)
  w = res.data
  check('S02', '排在未完成节点后的册谱即使已有卷宗也置灰', stage(w, 'render').status === 'done' && stage(w, 'render').blocked === true)
  await prisma.bookVolume.delete({ where: { id: earlyVolume.id } })

  const person = await prisma.person.create({
    data: { clan_id: clanA.id, full_name: '用例甲祖', gender: 'male' },
  })
  res = await status(clanA.slug, ownerToken)
  check('S02', '有人物后旧谱电子化完成，谱稿初审成为 current', stage(res.data, 'digitize').status === 'done' && stage(res.data, 'internal_review').status === 'current' && res.data.done_count === 2)

  await prisma.bioReview.create({
    data: {
      person_id: person.id,
      author_id: ownerId,
      reviewer_id: ownerId,
      title: '生平',
      content: '通过',
      status: 'APPROVED',
      reviewed_at: new Date(),
    },
  })
  await prisma.crowdsourceNotice.create({
    data: {
      clan_id: clanA.id,
      title: '勘误通知',
      content: '请核对',
      status: 'sent',
      token: `case-${suffix}-notice`,
      created_by: ownerId,
    },
  })
  const approvedErrata = await prisma.personModificationRequest.create({
    data: {
      person_id: person.id,
      clan_id: clanA.id,
      requester_user_id: editorId,
      field_name: 'birth_place',
      new_value: '建阳',
      status: 'APPROVED',
      reviewer_id: ownerId,
      reviewed_at: new Date(),
    },
  })
  res = await status(clanA.slug, ownerToken)
  check('S02', '初审、下发、汇总勘误完成后终审定稿成为 current', ['internal_review', 'errata_notice', 'errata_revise'].every((key) => stage(res.data, key).status === 'done') && stage(res.data, 'lock').status === 'current', res.data.stages.map((item) => `${item.key}:${item.status}`).join(','))

  const finalize = await api(`/api/genealogy/${clanA.slug}/finalize`, {
    method: 'POST',
    token: ownerToken,
    body: { version_name: '用例定稿', editors: ['测试主修'], description: 'case' },
  })
  check('S02', '终审定稿接口锁谱', finalize.status === 201, `status=${finalize.status} ${msg(finalize.data)}`)
  const lockState = await api(`/api/genealogy/${clanA.slug}/pedigree-lock`, { token: ownerToken })
  check('L04', '族长看到已锁谱且可解锁', lockState.data?.data?.locked === true && lockState.data?.data?.can_unlock === true, JSON.stringify(lockState.data?.data))
  const editorLock = await api(`/api/genealogy/${clanA.slug}/pedigree-lock`, { token: editorToken })
  check('L01', '主修账号 can_unlock 为 false', editorLock.data?.data?.can_unlock === false, JSON.stringify(editorLock.data?.data))
  const editorUnlock = await api(`/api/genealogy/${clanA.slug}/finalize/unlock`, { method: 'POST', token: editorToken })
  check('L01', '主修调用解锁被拒绝', editorUnlock.status === 403, `status=${editorUnlock.status}`)

  const editWhileLocked = await api(`/api/tree/person/${person.id}`, {
    method: 'PATCH',
    token: ownerToken,
    body: { full_name: '不该改成' },
  })
  check('L04', '锁谱后不能改人物核心信息', editWhileLocked.status === 409 && msg(editWhileLocked.data).includes('谱系已终审锁稿'), msg(editWhileLocked.data))
  const pendingErrata = await prisma.personModificationRequest.create({
    data: {
      person_id: person.id,
      clan_id: clanA.id,
      requester_user_id: editorId,
      field_name: 'full_name',
      new_value: '不该入库',
      status: 'PENDING',
    },
  })
  const approveWhileLocked = await api(`/api/genealogy/${clanA.slug}/crowdsource/submissions/${pendingErrata.id}/approve`, {
    method: 'POST',
    token: ownerToken,
  })
  check('L04', '锁谱后勘误通过不能入库', approveWhileLocked.status === 409 && msg(approveWhileLocked.data).includes('谱系已终审锁稿'), msg(approveWhileLocked.data))

  await prisma.bookVolume.create({
    data: { clan_id: clanA.id, title: '卷一', type: 'document', created_by: ownerId, content: '定稿后' },
  })
  await prisma.printOrder.create({
    data: { clan_id: clanA.id, user_id: ownerId, specification: 'A4', quantity: 1, amount: 1 },
  })
  res = await status(clanA.slug, ownerToken)
  check('S02', '八个节点全部 done，进度 100', res.data.done_count === 8 && res.data.progress === 100 && res.data.current_stage === null, `done=${res.data.done_count} current=${res.data.current_stage}`)

  const unlock = await api(`/api/genealogy/${clanA.slug}/finalize/unlock`, { method: 'POST', token: ownerToken })
  res = await status(clanA.slug, ownerToken)
  w = res.data
  check('L02', '解锁接口成功且锁记录清空', unlock.status === 201 && stage(w, 'lock').status === 'todo', `status=${unlock.status} lock=${stage(w, 'lock').status}`)
  check('L02', '流程回流到汇总勘误', stage(w, 'errata_revise').status === 'returned' && stage(w, 'errata_revise').returned_from_label === '终审定稿' && stage(w, 'errata_revise').return_notice?.reason === '定稿已解锁，本次定稿记录作废')
  check('L02', '解锁后的处理要求指向汇总勘误', stage(w, 'errata_revise').return_notice?.requirement === '定稿已解除。请在汇总勘误、修订谱稿中修订后，再提交终审定稿。')
  const editAfterUnlock = await api(`/api/tree/person/${person.id}`, {
    method: 'PATCH',
    token: ownerToken,
    body: { full_name: '用例甲祖' },
  })
  check('L02', '解锁后可以修改人物', editAfterUnlock.status === 200, `status=${editAfterUnlock.status} ${msg(editAfterUnlock.data)}`)

  await api(`/api/genealogy/${clanA.slug}/finalize`, {
    method: 'POST',
    token: ownerToken,
    body: { version_name: '用例再定稿', editors: ['测试主修'] },
  })
  const rejected = await api(`/api/genealogy/${clanA.slug}/finalize/reject`, {
    method: 'POST',
    token: ownerToken,
    body: { reason: '世系仍有争议' },
  })
  res = await status(clanA.slug, ownerToken)
  w = res.data
  check('R04', '终审驳回后 lock 为 todo', rejected.status === 201 && stage(w, 'lock').status === 'todo' && stage(w, 'lock').status !== 'returned')
  check('R04', '汇总勘误变为终审回流', stage(w, 'errata_revise').status === 'returned' && stage(w, 'errata_revise').returned_from_label === '终审定稿' && stage(w, 'errata_revise').return_notice?.reason === '世系仍有争议')
  check('R04', '其后节点置灰，悬停指向汇总勘误', stage(w, 'render').blocked && hoverTitle(stage(w, 'render'), w.stages) === '终审定稿环节已驳回，请先处理：汇总勘误、修订谱稿')
  check('R04', '驳回处理要求是修订后再终审', stage(w, 'errata_revise').return_notice?.requirement === '终审未通过。请修订谱稿后，再提交终审定稿。')

  const personB = await prisma.person.create({
    data: { clan_id: clanB.id, full_name: '用例乙祖', gender: 'male' },
  })
  await prisma.bioReview.create({
    data: {
      person_id: personB.id,
      author_id: ownerId,
      reviewer_id: ownerId,
      title: '生平',
      content: '驳回',
      status: 'REJECTED',
      reject_reason: '缺少权威文献出处',
      reviewed_at: new Date(),
    },
  })
  await prisma.crowdsourceNotice.create({
    data: {
      clan_id: clanB.id,
      title: '勘误通知',
      content: '请核对',
      status: 'sent',
      token: `case-${suffix}-b`,
      created_by: ownerId,
    },
  })
  res = await status(clanB.slug, ownerToken)
  w = res.data
  check('R01', '旧谱电子化变为谱稿初审回流', stage(w, 'digitize').status === 'returned' && stage(w, 'digitize').returned_from_label === '谱稿初审')
  check('R01', '谱稿初审本身不是 returned，但被串行拦住', stage(w, 'internal_review').status === 'done' && stage(w, 'internal_review').blocked === true)
  check('R01', '驳回原因和处理要求', stage(w, 'digitize').return_notice?.reason === '缺少权威文献出处' && stage(w, 'digitize').return_notice?.requirement === '请按驳回意见修订世系和人物资料，改完再提交谱稿初审。')
  check('R01', '后续节点悬停指向旧谱电子化', hoverTitle(stage(w, 'errata_notice'), w.stages) === '谱稿初审环节已驳回，请先处理：旧谱电子化')
  check('T01', '3 个 done 且存在回流时进度为 38%', w.done_count === 3 && w.progress === 38 && w.stages.some((item) => item.status === 'returned'), `done=${w.done_count} progress=${w.progress}`)

  const held = await patchSettings(clanB.slug, ownerToken, { suspend: 'digitize' })
  w = held.data
  check('P03', '回流节点搁置后 status 为 suspended 且保留 returned 标记', stage(w, 'digitize').status === 'suspended' && stage(w, 'digitize').returned === true && stage(w, 'digitize').return_notice?.reason === '缺少权威文献出处')
  check('P03', '搁置期间后置悬停用搁置文案', hoverTitle(stage(w, 'lock'), w.stages) === '本项目当前已搁置，恢复流转后才可继续推进')
  const heldBack = await patchSettings(clanB.slug, ownerToken, { resume: 'digitize' })
  check('P03', '取消搁置后回到 returned，驳回原因还在', stage(heldBack.data, 'digitize').status === 'returned' && stage(heldBack.data, 'digitize').return_notice?.reason === '缺少权威文献出处')

  const resubmit = await patchSettings(clanB.slug, ownerToken, { resubmit: 'digitize' })
  w = resubmit.data
  check('R02', '重新送审后旧谱电子化 done、谱稿初审 current、驳回条清除', stage(w, 'digitize').status === 'done' && stage(w, 'digitize').return_notice == null && stage(w, 'internal_review').status === 'current')
  check('R02', '谱稿初审之后继续置灰', stage(w, 'errata_revise').blocked === true)
  check('R02', '没有其他回流时进度旁不再需要警告', w.stages.every((item) => item.status !== 'returned'))

  await prisma.personModificationRequest.create({
    data: {
      person_id: personB.id,
      clan_id: clanB.id,
      requester_user_id: editorId,
      field_name: 'birth_place',
      new_value: '无出处',
      status: 'REJECTED',
      reject_reason: '无确凿史料支持',
      reviewer_id: ownerId,
      reviewed_at: new Date(),
    },
  })
  res = await status(clanB.slug, ownerToken)
  check('R02', '仍有勘误回流时警告条件保留', res.data.stages.some((item) => item.status === 'returned'))
  check('R03', '勘误驳回落在汇总勘误', stage(res.data, 'errata_revise').status === 'returned' && stage(res.data, 'errata_revise').return_notice?.reason === '无确凿史料支持')
  check('R03', '终审、册谱、印刷置灰', ['lock', 'render', 'print'].every((key) => stage(res.data, key).blocked))
  check('R03', '处理要求写明主修审核后才入库', stage(res.data, 'errata_revise').return_notice?.requirement.includes('主修审核通过后才入库'))

  await prisma.bioReview.create({
    data: {
      person_id: personB.id,
      author_id: ownerId,
      reviewer_id: ownerId,
      title: '再次驳回',
      content: '新驳回',
      status: 'REJECTED',
      reject_reason: '新的出处仍不足',
      reviewed_at: new Date(Date.now() + 5000),
    },
  })
  res = await status(clanB.slug, ownerToken)
  check('R02', '更晚的新驳回再次回流旧谱电子化', stage(res.data, 'digitize').status === 'returned' && stage(res.data, 'digitize').return_notice?.reason === '新的出处仍不足')
  const serialReturned = res.data

  await patchSettings(clanB.slug, ownerToken, { mode: 'free' })
  res = await status(clanB.slug, ownerToken)
  check('F03', '自由模式仍标记回流，后置节点可跳转', stage(res.data, 'digitize').status === 'returned' && stage(res.data, 'print').blocked === false)

  const todoHover = hoverTitle(stage(resumed.data, 'internal_review'), resumed.data.stages)
  check('T02', '未完成前置的悬停', todoHover === '请先完成上一环节：旧谱电子化', todoHover)
  const returnedHover = hoverTitle(stage(serialReturned, 'errata_notice'), serialReturned.stages)
  check('T02', '回流前置的悬停带驳回来源和目标', returnedHover === '谱稿初审环节已驳回，请先处理：旧谱电子化', returnedHover)
  const suspendedHover = hoverTitle(stage(suspended.data, 'lock'), suspended.data.stages)
  check('T02', '搁置前置的悬停', suspendedHover === '本项目当前已搁置，恢复流转后才可继续推进', suspendedHover)

  check('T01', '进度警告原文在工作流条', workflowBar.includes('⚠️ 存在驳回回流项，请先修订。'))
  check('T02', '前端悬停包含回流和搁置两个分支', workflowBar.includes('环节已驳回，请先处理：') && workflowBar.includes('本项目当前已搁置，恢复流转后才可继续推进'))
  check('P01', '搁置按钮和标题标签文案', workflowBar.includes('搁置当前环节') && workflowBar.includes('取消搁置') && workflowBar.includes('进度已搁置：'))
  check('P01', '谱稿初审页也有搁置常驻提示', bioPage.includes('本项目当前已搁置，恢复流转后才可继续推进'))
  check('R01', '旧谱电子化页有重新送审按钮', dataPage.includes('提交重新谱稿初审') && dataPage.includes("resubmit: 'digitize'"))
  check('L02', '解锁确认文案与按钮只对族长显示', finalizePage.includes('解锁定稿将开放世系、人物核心信息编辑，本次定稿记录作废，是否确认？') && finalizePage.includes('lockInfo.locked && lockInfo.can_unlock'))
  check('L03', '册谱页未锁谱提示并禁用生成预览', finalizePage.includes('请先完成终审定稿锁谱，再生成册谱') && finalizePage.includes(':disabled="!lockInfo.locked"'))
  check('C01', '世系编辑是弹窗且不跳进树谱路由', errataPage.includes('treeEditorOpen') && errataPage.includes('世系&人物编辑') && !errataPage.includes('router.push(`/tree/'))
  check('C02', '旧勘误地址按 tab 转到新勘误或谱稿初审', routerFile.includes("tab === 'bio'") && routerFile.includes('genealogy/errata?tab=') && routerFile.includes("tab === 'submissions' || tab === 'revise'"))
  check('C02', '旧生成地址转到册谱版式渲染', routerFile.includes("genealogy/generate") && routerFile.includes('/genealogy/typeset') && finalizePage.includes("route.query.tab === 'generate'"))
  check('C03', '工作流随完整路由刷新，页面按 fullPath 区分', workflowBar.includes('route.fullPath') && layoutFile.includes('r.fullPath'))
  check('REG', '家族管理仍保留内部初审菜单名', layoutFile.includes("title: '内部初审'"))
} catch (error) {
  check('ENV', '用例执行中断', false, error?.stack || error?.message || String(error))
} finally {
  for (const id of createdClanIds) {
    await prisma.personModificationRequest.deleteMany({ where: { clan_id: id } }).catch(() => {})
    await prisma.printOrder.deleteMany({ where: { clan_id: id } }).catch(() => {})
    await prisma.clan.delete({ where: { id } }).catch((error) => {
      console.log(`清理族谱 ${id} 失败: ${error.message}`)
    })
  }
  await prisma.$disconnect()
  const summary = {
    base: BASE,
    finished_at: new Date().toISOString(),
    total: checks.length,
    failed,
    passed: checks.length - failed,
    checks,
  }
  writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2))
  console.log(`\n${summary.passed}/${summary.total} passed, report: ${REPORT_FILE}`)
}

process.exit(failed === 0 ? 0 : 1)
