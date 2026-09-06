export const productEvents = [
  'app.opened',
  'topic.opened',
  'writing.started.blank',
  'writing.started.topic',
  'writing.started.interview',
  'backup.exported',
  'backup.imported',
] as const;

export type ProductEvent = typeof productEvents[number];
