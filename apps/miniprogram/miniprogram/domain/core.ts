/** Mini-program boundary: only platform-neutral contracts may cross this module. */
export * from '@suiyue/core';
// Keep the new runtime surface explicit for the DevTools incremental TS compiler.
export { conversationOf, conversationView, prepareDialogue, settleDialogue,
  startInterview, validateDialogueResult } from '@suiyue/core';
