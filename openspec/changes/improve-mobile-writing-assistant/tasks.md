## 1. Contract and regression coverage

- [ ] 1.1 Add AI summary contract tests for explicit unchanged clauses, identical quoted replacements, all-filtered fallback and wholly unchanged candidates
- [ ] 1.2 Add component/layout tests for Visual Viewport sizing, keyboard-visible editor chrome, voice collapse/expand state and preservation boundaries
- [ ] 1.3 Add article assistant tests for compact complete menu, one-line-to-bounded autosizing input, voice-only fill and explicit send

## 2. Accurate AI feedback

- [ ] 2.1 Tighten the regular/polish/rewrite prompt contract so current-turn explanations do not enumerate unchanged content
- [ ] 2.2 Implement idempotent deterministic filtering of explicit non-change clauses without altering candidate bodies, citations or statuses

## 3. Mobile editor and speech controls

- [ ] 3.1 Synchronize the application canvas with validated Visual Viewport height/offset values and preserve the `100dvh` fallback
- [ ] 3.2 Add default-visible speech collapse plus a compact expand control, preserving pending text and blocking collapse during active speech

## 4. Compact article assistant

- [ ] 4.1 Rework optimization menu spacing, copy and card hierarchy so all entries are prioritized within common phone heights without shrinking touch targets
- [ ] 4.2 Replace the fixed-height conversation composer with a bounded autosizing textarea and adjacent accessible voice/send controls
- [ ] 4.3 Preserve focus, Escape/back navigation, consent, failure, candidate preview and message scrolling across the compact layouts

## 5. Documentation and verification

- [ ] 5.1 Update the formal design/product/architecture wording and record acceptance evidence for the five user-reported issues
- [ ] 5.2 Run `npm run check`, `npm run build` and browser regression at 360×640, 390×844, 430×932 and 1280×900, including simulated Visual Viewport keyboard changes
- [ ] 5.3 Record real iOS Safari and Android Chrome keyboard, browser-toolbar and background-return results on physical devices; keep the change active if unavailable
