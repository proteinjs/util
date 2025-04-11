/**
 * A function that takes debounced callback args, and returns a key.
 *
 * The key is used to pick a debounce timer for the callback invocation.
 */
export type GetDebounceKey = (...args: any[]) => string | undefined;

export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private keyToTimerMap: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private waitTime: number;
  private getDebounceKey?: GetDebounceKey;

  /**
   * @param waitTime time to wait (ms) with no input before executing `callback`
   * @param getDebounceKey if provided, there will be one timer per key
   */
  constructor(waitTime: number, getDebounceKey?: GetDebounceKey) {
    this.waitTime = waitTime;
    this.getDebounceKey = getDebounceKey;
  }

  public debounce<T extends (...args: any[]) => void>(callback: T, args: any[] = []): void {
    const key = this.getDebounceKey?.(args);
    let timer = this.getTimer(key);
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => callback(...args), this.waitTime);
    this.setTimer(timer, key);
  }

  private getTimer(key?: string) {
    if (key) {
      return this.keyToTimerMap.get(key);
    }

    return this.timer;
  }

  private setTimer(timer: ReturnType<typeof setTimeout>, key?: string) {
    if (key) {
      this.keyToTimerMap.set(key, timer);
    } else {
      this.timer = timer;
    }
  }
}
