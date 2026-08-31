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

it('retains the approved canvas and speech geometry while moving title editing into the header', () => {
  expect(rule('.phone-shell')).toMatchObject({ 'max-width': '800px', height: 'var(--visual-viewport-height, 100dvh)', 'min-height': '0', transform: 'translateY(var(--visual-viewport-offset, 0px))' });
  expect(rule('.editor-title-button')).toMatchObject({ 'min-width': '0', 'min-height': '48px', overflow: 'hidden' });
  expect(rule('.title-edit-input')).toMatchObject({ width: '100%', height: '56px', 'font-size': '18px' });
  expect(rule('.voice-panel')['grid-template-rows']).toBe('122px 84px 20px');
  expect(rule('.voice-panel')['grid-template-rows']).toBe(rule('.voice-panel', previewCss)['grid-template-rows']);
  expect(rule('.live-transcript p, .pending-transcript p')).toMatchObject({ height: '90px', 'min-height': '90px', 'line-height': '30px', 'overflow-y': 'auto' });
  expect(rule('.mic-button')).toMatchObject({ width: '76px', height: '76px', 'touch-action': 'none' });
  expect(rule('.input-mode-switch')).toMatchObject({ width: '52px', height: '52px' });
  expect(rule('.xiaowen-entry')['min-height']).toBe('52px');
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
  expect(rule('.writing-preview')).toMatchObject({ cursor: 'text', 'touch-action': 'manipulation' });
  expect(rule('.full-text-editor:focus-visible')).toEqual({ outline: 'none', 'box-shadow': 'none' });
  expect(rule('.editor-dock.voice.collapsed')['padding-bottom']).toBe('env(safe-area-inset-bottom)');
  expect(rule('.voice-side-group')['justify-content']).toBe('center');
});

it('keeps failures and simulation labels visible without displacing footer controls', () => {
  expect(rule('.storage-error')).toMatchObject({ order: '2', 'flex-shrink': '0', 'overflow-y': 'auto' });
  expect(rule('.editor-dock')['order']).toBe('3');
  expect(rule('.create-dock')['order']).toBe('3');
  expect(Number(rule('.demo-banner')['z-index'])).toBeGreaterThan(Number(rule('.sheet-backdrop')['z-index']));
  expect(rule('.product-dialog')).toMatchObject({ 'max-height': 'min(90dvh, calc(var(--visual-viewport-height, 100dvh) - 16px))', 'overflow-y': 'auto', 'border-radius': '24px 24px 0 0' });
});

it('keeps AI input focus inside its border and uses a compact optimization hint', () => {
  expect(rule('.ai-composer textarea:focus-visible')).toMatchObject({ outline: '0', 'border-color': 'var(--forest-soft)', 'box-shadow': 'inset 0 0 0 1px var(--forest-soft)' });
  expect(rule('.ai-voice-controls button')).toMatchObject({ 'min-height': '48px', 'touch-action': 'manipulation' });
  expect(rule('.ai-composer textarea')).toMatchObject({ height: '52px', 'min-height': '52px', 'max-height': '148px', resize: 'none' });
  expect(rule('.ai-composer-row')).toMatchObject({ display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)' + ' auto' });
  expect(rule('.xiaowen-panel.compact')).toMatchObject({ height: 'clamp(360px, 52dvh, 440px)', 'padding-bottom': 'max(8px, env(safe-area-inset-bottom))' });
  expect(rule('.xiaowen-panel.expanded')['height']).toBe('min(90dvh, calc(var(--visual-viewport-height, 100dvh) - 16px))');
  expect(css.match(/\.xiaowen-panel\.compact\s*\{/g)).toHaveLength(1);
  expect(css).not.toContain('.voice-panel-expand');
  expect(rule('.optimize-tip')).toMatchObject({ position: 'absolute', width: 'min(250px, calc(100vw - 40px))', 'pointer-events': 'none' });
});

it('keeps pending-edit actions compact and distinguishes text input from pencil editing', () => {
  expect(rule('.pending-edit-cancel')['justify-self']).toBe('start');
  expect(rule('.pending-segment-editor-wrap')['padding-bottom']).toBe('8px');
  expect(rule('.pending-segment-editor-footer')['padding-top']).toBe('8px');
  const controls = readFileSync('components/WritingControls.tsx', 'utf8');
  expect(controls).toContain("target === 'voice' ? 'mic' : 'keyboard'");
  expect(controls).not.toContain('role="tablist"');
  expect(controls).not.toContain('文字会在这里轻轻落下');
});

it('keeps XiaoWen quick intentions in two elder-friendly columns without shrinking tap targets', () => {
  expect(rule('.xiaowen-quick-actions')).toMatchObject({ display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '8px' });
  expect(rule('.xiaowen-quick-actions > button')).toMatchObject({ 'min-height': '48px', 'min-width': '0', 'white-space': 'nowrap' });
  expect(rule('.xiaowen-quick-note')).toMatchObject({ 'font-size': '14px', 'line-height': '22px', color: 'var(--muted)' });
  expect(rule('.xiaowen-panel.ai-page-chat > .sheet-header')['margin-bottom']).toBe('8px');
  expect(css).not.toContain('.mode-tabs');
});

it('copies only pure SVG presentation assets and keeps the preview runtime outside production', () => {
  expect(readFileSync('components/Visuals.tsx', 'utf8').replace(/\r\n/g, '\n')).toBe(readFileSync('previews/echoes-of-time/Visuals.tsx', 'utf8').replace(/\r\n/g, '\n'));
  for (const file of ['features/writing/ProductApp.tsx', 'features/writing/Editor.tsx', 'features/writing/WorksHome.tsx', 'features/speech/VoicePanel.tsx', 'components/WritingControls.tsx', 'components/Visuals.tsx']) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"][^'"]*(?:previews\/|mock-data|Preview)/);
  }
});
