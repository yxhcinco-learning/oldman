## 1. Contract and regression coverage

- [x] 1.1 Add server prompt contract tests for exact “接着问我” and “讲清楚了吗” question intents, including current-body grounding, one-question/three-issue limits, clear-article response and no candidate body
- [x] 1.2 Add controller/domain regressions proving question shortcuts discard an unexpected body, persist an answered turn, preserve old `question`/`chat`/optimization turns and require no schema or backup migration
- [x] 1.3 Replace toolbar/menu UI expectations with a single-slot microphone/keyboard mode switch plus accessible “小文” entry, direct conversation opening, removed chat-unavailable feedback and removed optimization/disabled-feature menu
- [x] 1.4 Add UI coverage for all four shortcut labels and action mappings, non-empty conversation bubbles, preserved unsent free input, consent routing, local invalid-body rejection and busy-state mutual exclusion
- [x] 1.5 Add interaction tests for compact open without input autofocus, explicit expand/collapse, input-focus expansion, short-height scrolling and 48px/two-column quick controls
- [x] 1.6 Add minimize/reopen tests covering focus restoration, unsent current-work input, persisted conversations/candidates, continued in-flight requests and processing/success/failure status on the closed toolbar entry
- [x] 1.7 Retain regressions for free `chat` answer/rewrite behavior, point-to-tap XiaoWen dictation, candidate preview/apply/dismiss/undo, modification records, save failures and history restoration

## 2. Grounded quick intentions

- [x] 2.1 Extend the server `question` prompt so exact “接着问我” uses only current-body evidence, briefly acknowledges a real detail and asks exactly one easy continuation question without inventing experience
- [x] 2.2 Extend the server `question` prompt so exact “讲清楚了吗” reports at most three grounded clarity questions or explicitly says the article is clear without fabricating gaps
- [x] 2.3 Route both read-only shortcuts through existing `question`, keep regular/polish on their existing actions, and ensure invalid, cancelled or malformed responses use current non-retrying failure semantics

## 3. Unified XiaoWen entry and state

- [x] 3.1 Refactor `WritingToolbar` and `Editor` to alternate a small destination-mode microphone/keyboard button beside a separated leaf-icon “小文” action, remove parallel voice/text tabs plus chat/optimize callbacks and toast state, and preserve speech and pending-text boundaries without auto-recording
- [x] 3.2 Change the one-time 80-character hint to “小文可以陪您接着写，也能帮您整理。”, anchor it to XiaoWen, reuse the existing local marker and keep focus/network behavior unchanged
- [x] 3.3 Replace `ProductApp`'s `chat | optimize` entry state with XiaoWen open/minimized state, a current-work in-memory composer draft and background request attention state; cancel only on explicit request cancellation, work exit or disposal
- [x] 3.4 Refactor `ArticleAssistant` so conversation is the home page, remove the optimization menu and entry-dependent close routing, and make preview/history/version/consent back navigation return to the conversation
- [x] 3.5 Add the two-by-two quick-intention group above the composer, dispatch shortcuts without reading or clearing unsent free text, and keep voice/send/input autosizing behavior intact
- [x] 3.6 Make panel close/Escape minimize XiaoWen and restore entry focus while allowing in-flight completion; expose accessible processing, unread-result and failure states on the minimized entry and clear attention after reopening
- [x] 3.7 Preserve old session display labels, candidate status, modification records, citations, retries and JSON v1/v2 import/export without adding fields or rewriting stored history

## 4. Progressive mobile panel and accessibility

- [x] 4.1 Add compact and expanded XiaoWen panel classes and explicit 48px expand/collapse header control while retaining the native modal dialog focus trap and Echoes paper treatment
- [x] 4.2 Keep the composer fixed and messages independently scrollable in both modes; expand on input focus/keyboard-constrained Visual Viewport and preserve safe-area padding, 52–148px input sizing and visible focus rings
- [x] 4.3 Style the Echoes single-slot input switch, separate XiaoWen entry and four quick intentions for 360, 390, 430 and desktop widths without copying the reference screenshot, horizontal scrolling, clipped labels, reduced body type or sub-48px targets
- [x] 4.4 Verify keyboard, screen-reader names, Escape/back/close semantics, reduced motion, busy/disabled states and focus restoration across conversation, consent, result and modification-record pages

## 5. Product and technical documentation

- [x] 5.1 Update `docs/PRODUCT.md` to define XiaoWen as the single user-invoked article companion, list the four phase-one intentions and keep proactive reactions plus other future abilities out of scope
- [x] 5.2 Update `DESIGN-SYSTEM.md` for the Echoes single-slot microphone/keyboard switch, separate XiaoWen entry, compact/expanded panel, quick-intention layout, minimized statuses, discovery hint and mobile keyboard rules
- [x] 5.3 Update `docs/ARCHITECTURE.md` for the unified entry, question-intent contract, ephemeral unsent prompt, background request lifetime and unchanged storage/protocol boundaries
- [x] 5.4 Create a focused acceptance record covering implementation evidence, browser captures, request/action assertions, privacy/cost boundaries and any unverified real-device results

## 6. Verification and delivery

- [x] 6.1 Run targeted server, domain, session and UI tests with non-network transports; confirm no automatic or duplicate paid request occurs on open, expand, minimize, hint display or dictation
- [x] 6.2 Run `npm run check` and `npm run build`, inspect the task-only diff and sensitive/generated-file boundaries, and record exact results
- [x] 6.3 Run browser regression at 360×640, 390×844, 430×932 and 1280×900 for empty/long conversations, compact/expanded modes, four shortcuts, free input, consent, failure, candidate confirmation, history and minimized completion
- [x] 6.4 Record the product owner's Android functional acceptance and 2026-09-04 decision not to require unavailable iOS evidence for this change; do not claim that an iOS test occurred
- [x] 6.5 Perform at most two short, non-sensitive real DeepSeek calls—one per read-only shortcut—record actual behavior and approximate usage, and do not treat mocked prompt tests as real model evidence
- [x] 6.6 Synchronize the delta specs into `openspec/specs`, archive the change, update acceptance status and commit only this change's files without pushing or publishing

## 7. Compact default and plain-language refinement

- [x] 7.1 Update the active proposal, design and delta specs for a half-screen compact default, plain-language shortcut labels, one boundary note and unchanged internal prompt contracts
- [x] 7.2 Add design/UI regressions for the compact height, no short-screen near-full-height override, visible labels, boundary note, action mapping and displayed turn labels
- [x] 7.3 Implement the compact panel refinement and shortcut presentation without changing the Echoes system, request count, action protocol or confirmation boundary
- [x] 7.4 Update product/architecture/acceptance documentation, run check/build/OpenSpec validation and repeat four-size browser regression without additional paid model calls

## 8. Defer preset quick instructions

- [x] 8.1 Update the active proposal, design and delta specs so the conversation exposes only free input, dictation and send while preserving internal action compatibility
- [x] 8.2 Replace shortcut UI regressions with absence, free-send, compact-height and historical-turn compatibility coverage
- [x] 8.3 Remove all preset shortcut controls and helper copy, update product/architecture/acceptance documentation, and repeat full automated and four-size browser verification without paid calls

## 9. Toolbar tone and stable composer focus

- [x] 9.1 Update the active proposal, design and delta specs for a tonal input-mode button and focus-stable compact/expanded panel state
- [x] 9.2 Add design/UI regressions for the non-white shadowless mode button, explicit-only panel expansion and preserved focused composer
- [x] 9.3 Implement the visual and focus-state refinements, update product/design/architecture/acceptance documentation, and run targeted/full/build/four-size browser verification without paid calls

## 10. Stable conversation panel refinement

- [x] 10.1 Update active proposal, design and delta specs to replace compact/expanded panel state with one Visual Viewport constrained chat panel
- [x] 10.2 Remove the panel size control, keep message scrolling and composer reachability, update regressions and documentation, and repeat full/build/four-size browser verification without paid calls

## 11. Interview action alignment refinement

- [x] 11.1 Update active design and delta spec so the current-question action aligns with the question text while retaining its touch target and focus state
- [x] 11.2 Implement the alignment, update focused regressions and repeat check/build/four-size browser verification without paid calls

## 12. Topic interview entry and exit refinement

- [x] 12.1 Update active design and delta specs for the static first-interview introduction and content-aware close routing
- [x] 12.2 Implement the interview transition and minimized processing feedback, update regressions and repeat check/build/four-size browser verification without paid calls
