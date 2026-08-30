## 1. Voice Hold and Permission

- [x] 1.1 Separate pointer and keyboard hold endings so ordinary pointer blur cannot release the gesture, while cancel, page leave and cleanup remain safe
- [x] 1.2 Keep permission, connection, recording and finishing button presentation aligned with the physical hold and session phase
- [x] 1.3 Add regression tests for pointer focus changes, one-shot release/cancel, continuous compact-button state and unchanged article dictation behavior

## 2. Compact Conversation Feedback

- [x] 2.1 Add an accessible dialog header action slot and move the conversation modification-record entry into it
- [x] 2.2 Render ordinary action successes as auto-dismissing non-modal notices while keeping conflicts, risks and failures persistent
- [x] 2.3 Restyle candidate actions as one compact hierarchy with a primary result action and secondary undo action
- [x] 2.4 Update UI tests for header navigation, transient feedback, persistent risks and compact accessible action labels

## 3. Documentation and Verification

- [ ] 3.1 Update the design system, architecture/acceptance documentation and change evidence without claiming real microphone or physical-device verification
- [ ] 3.2 Run focused tests, `npm run check`, `npm run build` and browser regression at supported mobile widths
