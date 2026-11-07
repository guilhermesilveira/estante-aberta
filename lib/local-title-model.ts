'use client';
import { validOCRLanguage } from './title-inference.ts';
export type ModelState = {
  status: 'off' | 'loading' | 'ready' | 'error';
  loaded: number;
  total: number;
};
let state: ModelState = { status: 'off', loaded: 0, total: 0 };
let language = 'por+eng';
let worker: Worker | null = null;
let sequence = 0;
let generation = 0;
let queued = 0;
let tail: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const pending = new Map<
  number,
  {
    resolve: (value: string | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function notify(next: ModelState) {
  state = next;
  listeners.forEach((fn) => fn());
}
export const getModelState = () => state;
export const getOCRLanguage = () => language;
export function setOCRLanguage(value: string) {
  language = validOCRLanguage(value);
}
export function subscribeModel(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function stopTitleModel(failed = false) {
  generation++;
  worker?.terminate();
  worker = null;
  pending.forEach(({ resolve, timer }) => {
    clearTimeout(timer);
    resolve(null);
  });
  pending.clear();
  notify({ status: failed ? 'error' : 'off', loaded: 0, total: 0 });
}
function request(
  type: 'prepare' | 'infer',
  timeout: number,
  text?: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const id = ++sequence;
    const timer = setTimeout(() => stopTitleModel(true), timeout);
    pending.set(id, { resolve, timer });
    try {
      worker!.postMessage({ id, type, text });
    } catch {
      stopTitleModel(true);
    }
  });
}
export async function startTitleModel() {
  if (state.status === 'loading' || state.status === 'ready') return;
  if (!('gpu' in navigator)) {
    stopTitleModel(true);
    return;
  }
  const attempt = ++generation;
  notify({ status: 'loading', loaded: 0, total: 0 });
  try {
    const { createTitleModelWorker } = await import('./title-model-worker');
    if (attempt !== generation) return;
    worker = createTitleModelWorker();
    worker.onmessage = ({ data }) => {
      if (attempt !== generation) return;
      if (data.type === 'progress') {
        notify({ ...state, loaded: data.loaded ?? 0, total: data.total ?? 0 });
        return;
      }
      const item = pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(data.id);
      if (data.type === 'error') {
        if (import.meta.env?.DEV)
          console.warn('Local title model:', data.reason);
        item.resolve(null);
        stopTitleModel(true);
        return;
      }
      if (data.type === 'ready')
        notify({ status: 'ready', loaded: 0, total: 0 });
      item.resolve(data.title ?? null);
    };
    worker.onerror = (event) => {
      if (attempt !== generation) return;
      if (import.meta.env?.DEV)
        console.warn('Local title worker failed:', event.message);
      stopTitleModel(true);
    };
    worker.onmessageerror = () => {
      if (attempt === generation) stopTitleModel(true);
    };
    await request('prepare', 180_000);
  } catch (error) {
    if (import.meta.env?.DEV)
      console.warn(
        'Local title worker initialization:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    if (attempt === generation) stopTitleModel(true);
  }
}
/** Bounded serial inference, independent from capture; never required to save. */
export async function refineLocalTitle(text: string): Promise<string | null> {
  if (state.status !== 'ready' || queued >= 20) return null;
  const attempt = generation;
  queued++;
  const task = tail.then(async () => {
    if (attempt !== generation || state.status !== 'ready') return null;
    return request('infer', 20_000, text.slice(0, 6000));
  });
  tail = task.catch(() => null);
  try {
    return await task;
  } finally {
    queued--;
  }
}
