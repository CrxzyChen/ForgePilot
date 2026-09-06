/** Coalesce presentation work, never commands or durable source events. */
export class CoalescedUpdate {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  #publish: () => void;
  #delayMs: number;
  #onError?: (error: unknown) => void;

  constructor(
    publish: () => void,
    delayMs = 100,
    onError?: (error: unknown) => void,
  ) {
    this.#publish = publish;
    this.#delayMs = delayMs;
    this.#onError = onError;
  }

  request(): void {
    if (this.#disposed || this.#timer !== null) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#disposed) return;
      try {
        this.#publish();
      } catch (error) {
        if (!this.#onError) throw error;
        this.#onError(error);
      }
    }, this.#delayMs);
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
