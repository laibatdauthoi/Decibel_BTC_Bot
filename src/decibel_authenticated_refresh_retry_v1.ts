// One supervisor-owned retry sequence, independent of execution STOP state.
export class decibel_authenticated_refresh_retry_v1 {
  private failures = 0;
  private lastFailure: string | null = null;

  recordFailure(detail: string): Readonly<{ delayMs: number; shouldLog: boolean }> {
    this.failures = Math.min(6, this.failures + 1);
    const shouldLog = detail !== this.lastFailure;
    this.lastFailure = detail;
    return Object.freeze({
      delayMs: Math.min(30_000, 1_000 * 2 ** (this.failures - 1)),
      shouldLog,
    });
  }

  resetAfterSuccess(): void {
    this.failures = 0;
    this.lastFailure = null;
  }
}
