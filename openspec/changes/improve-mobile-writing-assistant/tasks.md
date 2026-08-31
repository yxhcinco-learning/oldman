## 1. Contract and regression coverage

- [x] 1.1 Add AI summary contract tests for explicit unchanged clauses, identical quoted replacements, all-filtered fallback and wholly unchanged candidates
- [x] 1.2 Add component/layout tests for Visual Viewport sizing, keyboard-visible editor chrome, voice collapse/expand state and preservation boundaries
- [x] 1.3 Add article assistant tests for compact complete menu, one-line-to-bounded autosizing input, voice-only fill and explicit send
- [x] 1.4 Add corrective regression tests for mutually exclusive speech controls, fully hidden collapse, article single/double activation, inline normal editing, separate pending editing, comfortable menu spacing and empty composer height
- [x] 1.5 Add regression coverage for title-triggered text mode without focus theft, the removed body focus line, unavailable toolbar chat, tap-toggle XiaoWen dictation and centered collapse controls
- [x] 1.6 Add regression coverage for standard and WebKit point-to-caret APIs, paragraph/newline offset mapping and blank-area fallback
- [x] 1.7 Add regression coverage for non-blocking touch long-press timing/movement cancellation and pending-speech click-to-caret mapping
- [x] 1.8 Add contract coverage for the default, allowed bilingual 1.0/2.0 and rejected Tencent ASR engine model values and signed upstream URL
- [x] 1.9 Add regression coverage for header title confirmation/cancellation, concise idle speech copy, pending-edit cancellation/spacing, compact chat bottom spacing and the keyboard text-mode icon

## 2. Accurate AI feedback

- [x] 2.1 Tighten the regular/polish/rewrite prompt contract so current-turn explanations do not enumerate unchanged content
- [x] 2.2 Implement idempotent deterministic filtering of explicit non-change clauses without altering candidate bodies, citations or statuses

## 3. Mobile editor and speech controls

- [x] 3.1 Synchronize the application canvas with validated Visual Viewport height/offset values and preserve the `100dvh` fallback
- [x] 3.2 Add default-visible speech collapse plus a compact expand control, preserving pending text and blocking collapse during active speech
- [x] 3.3 Replace the compact expand control with body-driven reopen, make idle collapse and pending cancel/complete mutually exclusive, and remove the normal paragraph editor in favor of current-page text editing
- [x] 3.4 Switch expanded voice mode to current-page text state when the title receives focus, preserve pending content, remove the body focus artifact and center the collapse control
- [x] 3.5 Transfer the second body tap position into a collapsed current-page text selection without changing article content
- [x] 3.6 Add touch/pen long-press current-page entry and preserve the clicked pending-speech offset in its separate editor
- [x] 3.7 Load the Tencent ASR engine model from a server-only allowlisted environment setting and pass it into upstream signing
- [x] 3.8 Move title editing into a header-triggered native input dialog, trim idle speech copy, and make pending-speech cancel/complete semantics and spacing explicit

## 4. Compact article assistant

- [x] 4.1 Rework optimization menu spacing, copy and card hierarchy so all entries are prioritized within common phone heights without shrinking touch targets
- [x] 4.2 Replace the fixed-height conversation composer with a bounded autosizing textarea and adjacent accessible voice/send controls
- [x] 4.3 Preserve focus, Escape/back navigation, consent, failure, candidate preview and message scrolling across the compact layouts
- [x] 4.4 Restore comfortable optimization menu rhythm within the one-screen target and keep the empty composer at one line with concise copy independent of placeholder measurement
- [x] 4.5 Make toolbar chat report unavailable without opening XiaoWen, keep the optimization launcher, and replace XiaoWen hold dictation with tap-to-start/tap-to-cancel capture
- [x] 4.6 Reduce the XiaoWen composer bottom gap while preserving safe-area protection and replace the text-mode pencil with a keyboard icon

## 5. Documentation and verification

- [x] 5.1 Update the formal design/product/architecture wording and record acceptance evidence for the five user-reported issues
- [x] 5.2 Run `npm run check`, `npm run build` and browser regression at 360×640, 390×844, 430×932 and 1280×900, including simulated Visual Viewport keyboard changes
- [ ] 5.3 Record real iOS Safari and Android Chrome keyboard, browser-toolbar and background-return results on physical devices; keep the change active if unavailable
- [x] 5.4 Run the complete check/build and browser regression for the corrected speech/body/menu/composer interactions, deploy the fixed release and record public evidence without claiming unavailable physical-device gestures
- [x] 5.5 Run complete checks, build and browser regression for title keyboard handling, chat reservation, tap dictation and control alignment; deploy and record public evidence without claiming unavailable physical-device gestures
- [x] 5.6 Run complete checks, build and browser regression for point-preserving text entry; deploy and record evidence without claiming unavailable physical-device keyboard results
- [x] 5.7 Run complete checks, build and browser regression for long-press and pending-edit caret entry; deploy and record evidence without claiming unavailable physical-device gesture results
- [x] 5.8 Run complete checks/build, deploy the gateway with `16k_zh_en`, verify the public service and rollback setting, and record that real bilingual recognition remains a user/device check
- [x] 5.9 Restore the public gateway to experience-pack-compatible `16k_zh`, restart only the gateway, verify public health/status and record the rollback without making a real ASR call
- [ ] 5.10 Run complete checks, build and four-size browser regression for the header title dialog, trimmed copy, pending-edit layout, compact composer bottom and keyboard icon; record evidence without claiming unavailable physical-device keyboard results
