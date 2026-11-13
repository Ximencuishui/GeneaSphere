import { PDF_PARSE_TIMEOUT_MESSAGE, runWithDeadline } from './pdf-parse-timeout';

describe('PDF 解析超时', () => {
  it('在时限内完成时不清理', async () => {
    const onTimeout = jest.fn();
    const value = await runWithDeadline(async () => 'done', onTimeout, 200);
    expect(value).toBe('done');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('超过时限后执行清理，并让后续检查点看到已超时', async () => {
    const events: string[] = [];
    const result = await runWithDeadline(
      async (isExpired) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        events.push(isExpired() ? 'expired' : 'alive');
        return 'late';
      },
      async () => {
        events.push('cleanup');
      },
      15,
    );

    expect(result).toBeUndefined();
    expect(events[0]).toBe('cleanup');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toContain('expired');
  });

  it('超时文案说明临时文件已清理', () => {
    expect(PDF_PARSE_TIMEOUT_MESSAGE).toContain('已中止并清理临时文件');
  });
});
