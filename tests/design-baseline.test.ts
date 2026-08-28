// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');
const previewCss = readFileSync('previews/echoes-of-time/styles.css', 'utf8');
function rule(selector: string, source = css): Record<string, string> {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line.startsWith(selector + ' {'));
  expect(start, `Missing style rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const block = lines.slice(start).join('\n').slice(selector.length + 2).split('}')[0];
  return Object.fromEntries(block.split(';').filter(part => part.trim()).map(part => {
    const colon = part.indexOf(':');
    return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
  }));
}

it('uses the approved Echoes palette and local font stacks', () => {
  const tokens = rule(':root');
  for (const name of ['--paper', '--white', '--surface', '--surface-mid', '--ink', '--muted', '--forest', '--forest-soft', '--tint', '--sienna', '--line', '--serif', '--sans']) {
    expect(tokens[name]).toBe(rule(':root', previewCss)[name]);
  }
  expect(tokens['--paper']).toBe('#fbf9f8');
  expect(tokens['--forest']).toBe('#153b2e');
  expect(css).not.toMatch(/https?:\/\//);
});

it('retains the approved canvas, title and speech geometry without a mock keyboard', () => {
  expect(rule('.phone-shell')).toMatchObject({ 'max-width': '800px', height: '100dvh', 'min-height': '0' });
  expect(rule('.title-input')).toMatchObject({ height: '68px', padding: '16px 0', font: '600 26px/36px var(--serif)', 'margin-bottom': '24px', 'border-bottom': '1px solid var(--line)' });
  expect(rule('.title-input::placeholder')).not.toHaveProperty('font-size');
  expect(rule('.voice-panel')['grid-template-rows']).toBe('122px 84px 20px');
  expect(rule('.voice-panel')['grid-template-rows']).toBe(rule('.voice-panel', previewCss)['grid-template-rows']);
  expect(rule('.live-transcript p, .pending-transcript p')).toMatchObject({ height: '90px', 'min-height': '90px', 'line-height': '30px', 'overflow-y': 'auto' });
  expect(rule('.mic-button')).toMatchObject({ width: '76px', height: '76px', 'touch-action': 'none' });
  expect(rule('.mode-tabs button, .editor-actions button')['height']).toBe('52px');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).not.toMatch(/\.(?:mock-keyboard|work-row|work-menu|library-links|save-row|creation-controls|story-paragraph)\b/);
});

it('keeps body typography and paragraph spacing identical between real input modes', () => {
  expect(rule('.writing-canvas')).toEqual({ display: 'flex', 'flex-direction': 'column' });
  expect(rule('.writing-body')).toMatchObject({ 'white-space': 'pre-wrap', 'overflow-wrap': 'break-word' });
  expect(rule('.full-text-editor')).toMatchObject({ 'font-size': '18px', 'line-height': '32px' });
  expect(rule('.writing-body::placeholder, .writing-placeholder')).toMatchObject({ color: '#949b94', opacity: '1' });
  expect(rule('.writing-placeholder')).toEqual({ margin: '0', font: 'inherit' });
  expect(rule('.writing-paragraph')).toMatchObject({ display: 'block', width: '100%', padding: '0', margin: '0', border: '0', background: 'transparent', font: 'inherit', 'white-space': 'inherit', 'text-align': 'inherit', 'overflow-wrap': 'inherit' });
  expect(rule('.writing-paragraph > span')).toEqual({ display: 'block' });
  expect(rule('.writing-paragraph + .writing-paragraph, .writing-piece + .writing-piece')['margin-top']).toBe(rule('.full-text-editor')['line-height']);
});

it('keeps failures and simulation labels visible without displacing footer controls', () => {
  expect(rule('.storage-error')).toMatchObject({ order: '2', 'flex-shrink': '0', 'overflow-y': 'auto' });
  expect(rule('.editor-dock')['order']).toBe('3');
  expect(rule('.create-dock')['order']).toBe('3');
  expect(Number(rule('.demo-banner')['z-index'])).toBeGreaterThan(Number(rule('.sheet-backdrop')['z-index']));
  expect(rule('.product-dialog')).toMatchObject({ 'max-height': '90dvh', 'overflow-y': 'auto', 'border-radius': '24px 24px 0 0' });
});

it('copies only pure SVG presentation assets and keeps the preview runtime outside production', () => {
  expect(readFileSync('components/Visuals.tsx', 'utf8').replace(/\r\n/g, '\n')).toBe(readFileSync('previews/echoes-of-time/Visuals.tsx', 'utf8').replace(/\r\n/g, '\n'));
  for (const file of ['features/writing/ProductApp.tsx', 'features/writing/Editor.tsx', 'features/writing/WorksHome.tsx', 'features/speech/VoicePanel.tsx', 'components/WritingControls.tsx', 'components/Visuals.tsx']) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"][^'"]*(?:previews\/|mock-data|Preview)/);
  }
});
