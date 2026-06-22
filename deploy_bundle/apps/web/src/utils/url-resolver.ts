/**
 * URL 解析工具
 *
 * 统一处理两种 URL 模式：
 * - 相对路径（本地开发模式）：/media/xxx.jpg
 * - 绝对 CDN URL（COS 生产模式）：https://cdn.xungenlu.cn/media/xxx.jpg
 */

/**
 * 获取图片的完整 URL
 * 如果是 CDN URL (http/https)，直接返回
 * 如果是相对路径，加上 API base URL
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';

  // 如果已经是完整 URL（含协议），直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 如果是相对路径，根据环境确定 base URL
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  // 开发环境通过 Vite proxy 访问，不需要额外 base
  if (url.startsWith('/media/') || url.startsWith('/personal/') || url.startsWith('/api/')) {
    // 去掉 baseURL 中的 /api 路径，因为资源路径和 API 路径可能不同
    if (apiBase && !apiBase.endsWith('/')) {
      return `${apiBase}${url}`;
    }
    return url;
  }

  // 其他情况原样返回
  return url;
}

/**
 * 获取图片缩略图 URL
 * 优先使用 thumb_url，其次 display_url，最后 file_url
 */
export function resolveThumbUrl(
  media: {
    thumb_url?: string | null;
    display_url?: string | null;
    file_url?: string | null;
  } | null | undefined
): string {
  if (!media) return '';
  return resolveImageUrl(media.thumb_url || media.display_url || media.file_url);
}

/**
 * 获取图片展示 URL
 * 优先使用 display_url，其次 file_url
 */
export function resolveDisplayUrl(
  media: {
    display_url?: string | null;
    file_url?: string | null;
    thumb_url?: string | null;
  } | null | undefined
): string {
  if (!media) return '';
  return resolveImageUrl(media.display_url || media.file_url);
}

/**
 * 获取头像 URL
 */
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string {
  return resolveImageUrl(avatarUrl || '');
}
