import { z } from 'zod';

export const writingStateSchema = z.object({
  composer: z.string().max(100_000),
  inputSource: z.enum(['typed', 'dictated']),
}).strict();
export type WritingState = z.infer<typeof writingStateSchema>;
export const emptyWritingState = (): WritingState => ({ composer: '', inputSource: 'typed' });
export const workWritingStateSchema = z.object({ workId: z.string().min(1).max(128), state: writingStateSchema }).strict();
export type WorkWritingState = z.infer<typeof workWritingStateSchema>;
