/** 单份 PDF 最多解析 3 分钟。到点就失败、删临时文件，并把队列让给下一份。 */
export const PDF_PARSE_TIMEOUT_MS = 3 * 60 * 1000;

export const PDF_PARSE_TIMEOUT_MESSAGE =
  '解析超过 3 分钟，已中止并清理临时文件。请把 PDF 拆短后重新上传';

export class PdfParseTimeoutError extends Error {
  constructor() {
    super(PDF_PARSE_TIMEOUT_MESSAGE);
    this.name = 'PdfParseTimeoutError';
  }
}

/**
 * 用 Promise.race 限制解析时长。超时后先跑清理，队列即可继续。
 * 卡在原生调用里的那一页停不下来，但后面的页会看到 isExpired 并停下。
 */
export async function runWithDeadline<T>(
  work: (isExpired: () => boolean) => Promise<T>,
  onTimeout: () => Promise<void>,
  timeoutMs = PDF_PARSE_TIMEOUT_MS,
): Promise<T | undefined> {
  let expired = false;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve({ timedOut: true });
    }, timeoutMs);
  });
  const running = work(() => expired).then(
    (value) => ({ timedOut: false as const, value }),
    () => ({ timedOut: false as const, value: undefined }),
  );

  try {
    const outcome = await Promise.race([running, timeout]);
    if (!('value' in outcome)) {
      await onTimeout();
      return undefined;
    }
    return outcome.value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
