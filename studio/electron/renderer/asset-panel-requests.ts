type PreviewCandidate = { id: string; sha256: string; mime: string };
type PreviewJob = { id: string; candidates: PreviewCandidate[] };
type PreviewRequest = { jobId: string; candidate: PreviewCandidate };

const identity = ({ jobId, candidate }: PreviewRequest) =>
  JSON.stringify([jobId, candidate.id, candidate.sha256, candidate.mime]);

/** One workspace lifetime; no provider calls and no durable review-state writes. */
export class AssetPanelRequests {
  disposed = false;
  #refresh: Promise<void> | null = null;
  #nextRefresh: (() => Promise<void>) | null = null;
  #wanted = new Map<string, PreviewRequest>();
  #cache = new Map<string, string>();
  #retryAfter = new Map<string, number>();
  #previewRunning = false;
  #previewActive = false;
  #load: (jobId: string, candidateId: string) => Promise<string>;
  #publish: (previews: Record<string, string>) => void;
  #now: () => number;

  constructor(
    load: (jobId: string, candidateId: string) => Promise<string>,
    publish: (previews: Record<string, string>) => void,
    now = Date.now,
  ) {
    this.#load = load;
    this.#publish = publish;
    this.#now = now;
  }

  /** Coalesce manual refreshes during a poll into one trailing fresh read. */
  refresh(task: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.#nextRefresh = task;
    this.#refresh ??= Promise.resolve().then(async () => {
      try {
        while (this.#nextRefresh && !this.disposed) {
          const next = this.#nextRefresh;
          this.#nextRefresh = null;
          await next();
        }
      } finally {
        this.#refresh = null;
      }
    });
    return this.#refresh;
  }

  setPreviewActive(active: boolean) {
    this.#previewActive = active;
    if (active) void this.#pump();
  }

  updateCandidates(jobs: PreviewJob[]) {
    if (this.disposed) return;
    this.#wanted = new Map(
      jobs.flatMap((job) =>
        job.candidates
          .filter((candidate) => /^(image|audio)\//u.test(candidate.mime))
          .map((candidate) => {
            const request = { jobId: job.id, candidate };
            return [identity(request), request] as const;
          }),
      ),
    );
    let removed = false;
    for (const key of this.#cache.keys()) {
      if (!this.#wanted.has(key)) {
        this.#cache.delete(key);
        removed = true;
      }
    }
    for (const key of this.#retryAfter.keys())
      if (!this.#wanted.has(key)) this.#retryAfter.delete(key);
    if (removed) this.#emit();
    void this.#pump();
  }

  #emit() {
    if (this.disposed) return;
    this.#publish(
      Object.fromEntries(
        [...this.#wanted].flatMap(([key, request]) => {
          const url = this.#cache.get(key);
          return url ? [[request.candidate.id, url]] : [];
        }),
      ),
    );
  }

  async #pump() {
    if (this.#previewRunning || !this.#previewActive || this.disposed) return;
    this.#previewRunning = true;
    try {
      while (this.#previewActive && !this.disposed) {
        const next = [...this.#wanted].find(
          ([key]) =>
            !this.#cache.has(key) &&
            (this.#retryAfter.get(key) ?? 0) <= this.#now(),
        );
        if (!next) break;
        const [key, request] = next;
        try {
          // At most one media decode is in flight, including panel re-entry.
          const url = await this.#load(request.jobId, request.candidate.id);
          if (this.disposed) return;
          if (this.#wanted.has(key)) {
            this.#cache.set(key, url);
            this.#retryAfter.delete(key);
            this.#emit();
          }
        } catch {
          // A bad/missing candidate must not create an IPC storm or block others.
          if (!this.disposed && this.#wanted.has(key))
            this.#retryAfter.set(key, this.#now() + 30_000);
        }
      }
    } finally {
      this.#previewRunning = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.#nextRefresh = null;
    this.#previewActive = false;
    this.#wanted.clear();
    this.#cache.clear();
    this.#retryAfter.clear();
  }
}

/** Schedule from completion, never from elapsed wall time of an in-flight read. */
export function pollAfterCompletion(
  refresh: () => Promise<void>,
  onError: (error: unknown) => void,
  delay = 1_000,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      await refresh();
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    }
  };
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
