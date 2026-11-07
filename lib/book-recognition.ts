'use client';

import type {
  RecognitionCallbacks,
  RecognitionEvent,
} from './book-recognition-types';
export type * from './book-recognition-types';

type Job = { file: Blob; photoId: string };
/** One worker/job at a time. No image bytes leave the browser. enqueue(false) means backpressure. */
export function createBookRecognitionQueue(
  callbacks: RecognitionCallbacks,
  options: {
    maxPending?: number;
    timeoutMs?: number;
    workerFactory?: () => Worker;
  } = {},
) {
  let worker: Worker | null = null;
  let current: Job | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const jobs: Job[] = [];
  const maxPending = options.maxPending ?? 5;
  const timeoutMs = options.timeoutMs ?? 150_000;

  function resetWorker() {
    clearTimeout(timer);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    worker = null;
  }
  function finish(status: 'complete' | 'cancelled' | 'error') {
    if (!current) return;
    const photoId = current.photoId;
    clearTimeout(timer);
    current = null;
    callbacks.onDone?.({ photoId, status });
    if (!disposed)
      queueMicrotask(() => {
        void pump();
      });
  }
  function fail(message: string) {
    if (!current) return;
    callbacks.onWarning?.({ photoId: current.photoId, message });
    resetWorker();
    finish('error');
  }
  // An inactivity deadline, not a total batch deadline: twenty crops may take longer.
  function refreshDeadline() {
    clearTimeout(timer);
    timer = setTimeout(
      () =>
        fail(
          'O reconhecimento demorou demais e foi interrompido. Preencha os títulos manualmente.',
        ),
      timeoutMs,
    );
  }
  async function pump() {
    if (disposed || current || !jobs.length) return;
    current = jobs.shift()!;
    const job = current;
    refreshDeadline();
    try {
      if (!worker) {
        const created = options.workerFactory
          ? options.workerFactory()
          : (
              await import('./book-recognition-worker')
            ).createRecognitionWorker();
        // Cancellation can happen while Vite loads the worker entry chunk.
        if (disposed || current !== job) {
          created.terminate();
          return;
        }
        worker = created;
        worker.onmessage = ({ data }: MessageEvent<RecognitionEvent>) => {
          if (disposed || !current || data.photoId !== current.photoId) return;
          if (data.type === 'crops') {
            refreshDeadline();
            callbacks.onCrops(data);
          } else if (data.type === 'warning') callbacks.onWarning?.(data);
          else finish(data.status);
        };
        worker.onerror = () =>
          fail(
            'O reconhecimento local não está disponível. Você pode preencher o título manualmente.',
          );
        worker.onmessageerror = () =>
          fail('Não foi possível ler o resultado local desta foto.');
      }
      refreshDeadline();
      worker.postMessage(current);
    } catch (error) {
      if (disposed || current !== job) return;
      if (import.meta.env?.DEV)
        console.warn(
          'Local recognition worker initialization failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      fail(
        'Este navegador não oferece reconhecimento local. Você pode preencher o título manualmente.',
      );
    }
  }
  return {
    enqueue(file: Blob, photoId: string = crypto.randomUUID()): boolean {
      if (
        disposed ||
        jobs.length + (current ? 1 : 0) >= maxPending ||
        current?.photoId === photoId ||
        jobs.some((job) => job.photoId === photoId)
      )
        return false;
      jobs.push({ file, photoId });
      void pump();
      return true;
    },
    cancel(photoId: string) {
      for (let index = jobs.length - 1; index >= 0; index--) {
        if (jobs[index].photoId === photoId) {
          jobs.splice(index, 1);
          callbacks.onDone?.({ photoId, status: 'cancelled' });
        }
      }
      if (current?.photoId === photoId) {
        resetWorker();
        finish('cancelled');
      }
    },
    dispose() {
      disposed = true;
      resetWorker();
      jobs
        .splice(0)
        .forEach((job) =>
          callbacks.onDone?.({ photoId: job.photoId, status: 'cancelled' }),
        );
      finish('cancelled');
    },
  };
}
