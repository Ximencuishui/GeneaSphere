/**
 * placeholder-media.controller.ts - 自托管确定性占位图
 *
 * 背景（2026-11-12）：演示数据的头像/配图原先指向 picsum.photos，
 * 该外网服务在国内网络普遍不可达，导致族谱树每个节点头像加载失败，
 * 控制台被 img error 事件刷屏（Event {isTrusted: true, type: 'error', target: img}）。
 *
 * 本控制器提供同源替代：GET /api/public/pic/:seed/:w/:h
 * - 同一 seed 永远返回同一张图（FNV-1a 哈希 → 色相），视觉上稳定
 * - 头像（宽=高）绘制人形剪影，风景图（宽>高）绘制山峦剪影
 * - 纯 SVG、零外部依赖、带一年 immutable 缓存
 */
import { Controller, Get, Param, Res } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/**
 * FNV-1a 32 位哈希 + 雪崩混合。
 *
 * 单纯 FNV 对「只有末尾字符不同」的序列 seed（xxx-1 / xxx-2）区分度极差：
 * geneasphere-female-3000 与 -3001 的 hue 分别是 110 / 109，肉眼完全同色
 * （2026-11-12 册谱页发现三张头像一模一样）。后面两轮 xorshift-multiply
 * 把低位差异扩散到全部比特位，保证相邻 seed 也能拿到完全不同的颜色。
 */
function hashSeed(seed: string, salt: number): number {
    let h = 0x811c9dc5 ^ Math.imul(salt, 0x9e3779b1);
    const s = seed + ':' + salt;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

function personSvg(w: number, h: number, hue1: number, hue2: number, id: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue1},45%,72%)"/>
      <stop offset="1" stop-color="hsl(${hue2},40%,52%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g${id})"/>
  <g fill="rgba(255,255,255,.85)">
    <circle cx="${w / 2}" cy="${h * 0.38}" r="${Math.min(w, h) * 0.16}"/>
    <path d="M ${w * 0.18} ${h} C ${w * 0.18} ${h * 0.62} ${w * 0.34} ${h * 0.56} ${w / 2} ${h * 0.56}
             C ${w * 0.66} ${h * 0.56} ${w * 0.82} ${h * 0.62} ${w * 0.82} ${h} Z"/>
  </g>
</svg>`;
}

function scenerySvg(w: number, h: number, hue1: number, hue2: number, id: string): string {
    const sunX = w * (0.2 + (hashSeed(id, 7) % 60) / 100);
    const sunY = h * 0.3;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue1},55%,80%)"/>
      <stop offset="1" stop-color="hsl(${hue2},45%,60%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g${id})"/>
  <circle cx="${sunX}" cy="${sunY}" r="${h * 0.12}" fill="rgba(255,255,240,.9)"/>
  <path d="M 0 ${h} L ${w * 0.3} ${h * 0.42} L ${w * 0.52} ${h * 0.8} L ${w * 0.68} ${h * 0.5} L ${w} ${h} Z" fill="rgba(255,255,255,.5)"/>
  <path d="M 0 ${h} L ${w * 0.18} ${h * 0.62} L ${w * 0.4} ${h} Z" fill="rgba(255,255,255,.35)"/>
</svg>`;
}

// 路径带 v2 版本段：占位图内容变更时（如今次加强颜色区分度），
// 旧 URL 仍会被浏览器按 immutable 缓存一年，必须换路径才能让用户拿到新图。
@Controller('api/public/pic')
export class PlaceholderMediaController {
    @Public()
    @Get('v2/:seed/:w/:h')
    getPic(@Param('seed') seed: string, @Param('w') wStr: string, @Param('h') hStr: string, @Res() res: any) {
        return this.sendPic(seed, wStr, hStr, res, true);
    }

    /** 库里已经写死的旧地址。内容和 v2 相同，避免闺秀录配图变成裂图。 */
    @Public()
    @Get(':seed/:w/:h')
    getLegacyPic(@Param('seed') seed: string, @Param('w') wStr: string, @Param('h') hStr: string, @Res() res: any) {
        return this.sendPic(seed, wStr, hStr, res, false);
    }

    private sendPic(seed: string, wStr: string, hStr: string, res: any, immutable: boolean) {
        // seed 只允许 url-safe 字符，防止注入；尺寸限幅
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(seed)) {
            return res.status(400).send('invalid seed');
        }
        const w = Math.min(Math.max(parseInt(wStr, 10) || 200, 16), 1920);
        const h = Math.min(Math.max(parseInt(hStr, 10) || w, 16), 1920);
        const hue1 = hashSeed(seed, 1) % 360;
        const hue2 = (hue1 + 30 + (hashSeed(seed, 2) % 60)) % 360;
        const svg = w === h
            ? personSvg(w, h, hue1, hue2, seed)
            : scenerySvg(w, h, hue1, hue2, seed);
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Cache-Control', immutable
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=86400');
        res.send(svg);
    }
}
