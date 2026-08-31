import type { TopicSnapshot, WritingMaterial } from '../domain/core';

export const FIRST_INTERVIEW_INTRO = '您好，我是小文，您的写作助手。我会围绕这个话题一次问一个问题。您的回答先保存在当前设备，整理结果也要由您确认后才会进入正文。';
export const FIRST_INTERVIEW_QUESTION = '第一次见面，先简单介绍一下自己吧。怎么称呼您，过去主要做什么？';

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
