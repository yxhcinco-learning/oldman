import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('keeps the AI submission evidence fixture structural and free of user content or credentials', () => {
  const value = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'ai-labeling-evidence.json'), 'utf8')) as {
    schemaVersion: number; containsUserContent: boolean; containsCredentials: boolean;
    cases: Array<{ id: string; expectedAiAssisted: boolean }>; surfaces: string[];
  };
  expect(value).toMatchObject({ schemaVersion: 1, containsUserContent: false, containsCredentials: false });
  expect(new Set(value.cases.map(item => item.id)).size).toBe(value.cases.length);
  expect(value.cases.some(item => item.expectedAiAssisted)).toBe(true);
  expect(value.cases.some(item => !item.expectedAiAssisted)).toBe(true);
  expect(value.surfaces).toEqual(['message', 'candidate-preview', 'modification-history', 'copy', 'txt', 'json-v4']);
});
