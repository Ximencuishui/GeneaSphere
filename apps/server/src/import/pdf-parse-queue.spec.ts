import { PdfParseQueue } from './pdf-parse-queue';

describe('PdfParseQueue', () => {
  it('同一时刻只运行一个任务，后来的排在后面', async () => {
    const queue = new PdfParseQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      order.push('first-start');
      await gate;
      order.push('first-end');
    });
    const second = queue.enqueue(async () => {
      order.push('second');
    });

    expect(first).toEqual({ queued: false, queuePosition: 1 });
    expect(second).toEqual({ queued: true, queuePosition: 2 });
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await queue.whenIdle();
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });
});
