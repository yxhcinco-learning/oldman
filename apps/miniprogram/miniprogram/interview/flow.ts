import type { TopicSnapshot, WritingMaterial } from '../domain/core';

export { INTERVIEW_INTRO as FIRST_INTERVIEW_INTRO, INTERVIEW_FIRST_QUESTION as FIRST_INTERVIEW_QUESTION } from '../domain/core';
import { INTERVIEW_INTRO as FIRST_INTERVIEW_INTRO, INTERVIEW_FIRST_QUESTION as FIRST_INTERVIEW_QUESTION } from '../domain/core';

export interface InterviewMessage { id: string; role: 'assistant' | 'user'; text: string }

export function interviewQuestion(topic: TopicSnapshot, completedAnswers: number, alternative = 0) {
  const pool = [FIRST_INTERVIEW_QUESTION, topic.starterQuestion, ...topic.angles.map(angle => angle.prompt)];
  return pool[(Math.max(0, completedAnswers) + Math.max(0, alternative)) % pool.length]!;
}

export function interviewMessages(materials: WritingMaterial[]): InterviewMessage[] {
  const messages: InterviewMessage[] = [{ id: 'intro', role: 'assistant', text: FIRST_INTERVIEW_INTRO }];
  for (const material of materials.filter(item => item.source === 'interview-answer')) {
    if (material.question) messages.push({ id: `${material.id}-question`, role: 'assistant', text: material.question });
    messages.push({ id: material.id, role: 'user', text: material.text });
  }
  return messages;
}
