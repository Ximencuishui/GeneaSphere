/**
 * 进程内解析队列。同一时刻只跑一个任务，避免多份扫描件同时转图片把内存打满。
 */
export class PdfParseQueue {
  private readonly jobs: Array<() => Promise<void>> = [];
  private active = 0;
  private tail: Promise<void> = Promise.resolve();

  get pendingCount(): number {
    return this.active + this.jobs.length;
  }

  enqueue(run: () => Promise<void>): { queued: boolean; queuePosition: number } {
    const queuePosition = this.pendingCount + 1;
    const queued = queuePosition > 1;
    this.jobs.push(run);
    this.kick();
    return { queued, queuePosition };
  }

  whenIdle(): Promise<void> {
    if (this.pendingCount === 0) return Promise.resolve();
    return this.tail.then(() => this.whenIdle());
  }

  private kick(): void {
    if (this.active > 0) return;
    const run = this.jobs.shift();
    if (!run) return;
    this.active = 1;
    let started: Promise<void>;
    try {
      started = Promise.resolve(run());
    } catch (error) {
      started = Promise.reject(error);
    }
    this.tail = started
      .catch(() => undefined)
      .finally(() => {
        this.active = 0;
        this.kick();
      });
  }
}
