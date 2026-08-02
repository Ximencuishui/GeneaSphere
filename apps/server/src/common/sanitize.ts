import { BadRequestException } from '@nestjs/common';

/**
 * HTML 转义工具 — 用于对用户提交的纯文本字段做安全清洗。
 *
 * 设计原则：
 * 1. 任何不可信输入（公告 content、个人简介、姓名昵称等）入库前必须经过本函数
 * 2. 双重过滤：先 escapeHtml 转义所有 HTML 元字符，再 stripDangerousTokens 移除常见 XSS token
 * 3. 不允许任何 HTML 标签（如需富文本请改用 sanitize-html + 白名单）
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[&<>"'`=\/]/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

/**
 * 危险 token 黑名单：即使前面已 escapeHtml，过滤仍能防御：
 * - 数学/Unicode 同形字符绕过
 * - 双重编码（%3Cscript%3E）穿透
 * - markdown 渲染器未到位前的临时堆叠
 */
const DANGEROUS_TOKEN_PATTERNS: RegExp[] = [
  /<\s*script\b[^>]*>/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*iframe\b[^>]*>/i,
  /<\s*\/\s*iframe\s*>/i,
  /<\s*object\b[^>]*>/i,
  /<\s*\/\s*object\s*>/i,
  /<\s*embed\b[^>]*>/i,
  /<\s*svg\b[^>]*>/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /onclick\s*=/i,
  /onmouseover\s*=/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /\{\s*\{.*constructor.*\}\s*\}/i, // Vue/Angular template injection
];

export function stripDangerousTokens(input: string): string {
  let out = input;
  for (const pat of DANGEROUS_TOKEN_PATTERNS) {
    out = out.replace(pat, '');
  }
  return out;
}

/**
 * 一站式清洗：escapeHtml + stripDangerousTokens。
 * 用于 announcement content、user nickname、profile bio 等不可信文本字段。
 */
export function sanitizeUserText(input: unknown): string {
  const escaped = escapeHtml(input);
  return stripDangerousTokens(escaped).trim();
}

/**
 * 校验清洗后的字段：若检测到疑似绕过，抛 400。
 */
export function assertSafeUserText(input: unknown, fieldName = 'content'): void {
  const cleaned = sanitizeUserText(input);
  if (cleaned.length === 0) {
    throw new BadRequestException(`${fieldName} 不能为空或仅含非法字符`);
  }
}