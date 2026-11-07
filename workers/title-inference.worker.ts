/// <reference lib="webworker" />
import {
  titleLines,
  groundSuggestedTitle,
  titlePrompt,
} from '../lib/title-inference';
import { pipeline, env } from '@huggingface/transformers';
const scope = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
// Pinned public weights only. No photo or OCR text is sent to a remote endpoint.
type Generator = (
  messages: { role: string; content: string }[],
  options: Record<string, unknown>,
) => Promise<{ generated_text: string | { content: string }[] }[]>;
let generator: Generator | null = null;
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Generator>;
let loading: Promise<void> | null = null;
async function prepare() {
  if (generator) return;
  if (!loading)
    loading = (async () => {
      if (!('gpu' in navigator)) throw new Error('WebGPU indisponível');
      const adapter = await (
        navigator.gpu as {
          requestAdapter(): Promise<{
            features: { has(name: string): boolean };
          } | null>;
        }
      ).requestAdapter();
      if (!adapter?.features.has('shader-f16'))
        throw new Error('GPU sem suporte a shader-f16');
      generator = await createPipeline(
        'text-generation',
        'onnx-community/Qwen3.5-0.8B-Text-ONNX',
        {
          revision: '25cdf33f386b487a25f3d743e86442517bdb77ff',
          device: 'webgpu',
          dtype: 'q4f16',
          progress_callback: (event: {
            status: string;
            loaded?: number;
            total?: number;
          }) => {
            if (event.status === 'progress')
              scope.postMessage({
                type: 'progress',
                loaded: event.loaded,
                total: event.total,
              });
          },
        },
      );
    })();
  await loading;
}
let tail = Promise.resolve();
scope.onmessage = ({
  data,
}: MessageEvent<{ id: number; type: 'prepare' | 'infer'; text?: string }>) => {
  tail = tail.then(async () => {
    try {
      await prepare();
      if (data.type === 'prepare') {
        scope.postMessage({ id: data.id, type: 'ready' });
        return;
      }
      const lines = titleLines(data.text ?? '');
      if (!lines.length) {
        scope.postMessage({ id: data.id, type: 'result', title: null });
        return;
      }
      const result = await generator!(titlePrompt(lines), {
        max_new_tokens: 64,
        do_sample: false,
        return_full_text: false,
        tokenizer_encode_kwargs: { enable_thinking: false },
      });
      const output = result[0]?.generated_text;
      const text =
        typeof output === 'string'
          ? output
          : Array.isArray(output)
            ? (output.at(-1)?.content ?? '')
            : '';
      scope.postMessage({
        id: data.id,
        type: 'result',
        title: groundSuggestedTitle(String(text), lines),
      });
    } catch (error) {
      scope.postMessage({
        id: data.id,
        type: 'error',
        reason:
          error instanceof Error ? error.message : 'Unknown inference error',
      });
    }
  });
};
