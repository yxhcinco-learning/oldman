// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('resamples 48kHz input into 40ms 16kHz PCM16 frames and flushes the tail', () => {
  const output: { frame?: ArrayBuffer; level?: number; type?: string }[] = [];
  type Processor = { process(input: Float32Array[][]): boolean; port: { onmessage: (event: { data: string }) => void } };
  let ProcessorClass!: new () => Processor;
  class Base { port = { onmessage: () => {}, postMessage: (value: typeof output[number]) => output.push(value) }; }
  runInNewContext(readFileSync('public/audio/pcm-worklet.js', 'utf8'), {
    AudioWorkletProcessor: Base, sampleRate: 48000,
    registerProcessor: (_name: string, processor: typeof ProcessorClass) => { ProcessorClass = processor; },
  });
  const processor = new ProcessorClass();
  for (let i = 0; i < 15; i++) processor.process([[new Float32Array(128).fill(0.5)]]);
  const frames = output.filter(item => item.frame); expect(frames).toHaveLength(1); expect(frames[0].frame!.byteLength).toBe(1280);
  expect(new DataView(frames[0].frame!).getInt16(0, true)).toBeGreaterThan(16000);
  processor.process([[new Float32Array(128).fill(0.5)]]); processor.port.onmessage({ data: 'flush' });
  expect(output.at(-1)?.type).toBe('flushed'); expect(output.filter(item => item.frame)).toHaveLength(2); expect(processor.process([[]])).toBe(false);
});
