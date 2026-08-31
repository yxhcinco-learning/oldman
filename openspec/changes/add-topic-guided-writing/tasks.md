## 1. Product validation and content contract

- [x] 1.1 Select the first target cohort and three to five topic columns, then create at least twenty manually reviewed topic cards covering current, periodic and slow topics
- [ ] 1.2 Run a small target-user pilot comparing summary-only, angle-assisted and experience-question topic cards; record topic-to-input, draft completion, interview exit and source-trust evidence
- [x] 1.3 Confirm the user-facing names for normal writing, guided interview, pause, switch and explicit composition without presenting a second assistant or generic chat product
- [x] 1.4 Define allowed information sources, summary/link rights, correction procedure, review states and publication responsibilities before enabling any automated ingestion

## 2. Topic domain and publication service

- [x] 2.1 Add validated topic, topic revision, source, angle, tag, status and expiry domain schemas with tests for missing, stale, unsafe and corrected content
- [x] 2.2 Implement read-only topic list/detail APIs that expose only reviewed revisions and return bounded, cacheable responses without user article content
- [x] 2.3 Implement a minimal editorial queue for draft, AI-assisted candidate, rejected and published topic states; require human confirmation before publication
- [x] 2.4 Add correction and revision handling so started works retain their snapshot while visibly detecting a newer published topic
- [x] 2.5 Add service limits, source allowlisting, content-safe logs and failure responses without copying full third-party articles or exposing credentials

## 3. Local topic and interview data

- [x] 3.1 Extend the domain model with topic snapshots and source-typed writing materials that remain separate from draft body, pending speech and AI candidates
- [x] 3.2 Add a non-destructive IndexedDB migration and repository transactions for snapshots, interview answers and mode state with revision-conflict coverage
- [x] 3.3 Upgrade versioned JSON export/import validation and ID remapping for topic-linked works while continuing to accept legacy backups
- [x] 3.4 Add rescue-export and offline regressions covering storage failure, unavailable topic service, stale revisions and partially completed interviews

## 4. Curated topic experience

- [x] 4.1 Add a restrained home surface for continuing work, a bounded set of reviewed daily topics and periodic themes without infinite scroll or simulated filler
- [x] 4.2 Build a topic detail view with summary, update time, accessible source links, writing angles and distinct “直接写” / guided-interview entry actions
- [x] 4.3 Add loading, empty, stale, corrected and unavailable states that never block access to existing local works
- [ ] 4.4 Verify Echoes typography, focus, source-link accessibility and 360/390/430/desktop layouts without infantilizing copy or shrinking required targets

## 5. Normal writing with event background

- [x] 5.1 Create or reopen a topic-linked work through the normal editor without generating an outline, starting an interview or modifying the body
- [x] 5.2 Add a collapsible event-background surface showing the saved snapshot, sources and optional angles while preserving editor focus, input mode and scroll state
- [x] 5.3 Show topic-revision updates as an explicit comparison/refresh choice and preserve the original snapshot when the user declines or is offline
- [x] 5.4 Cover free writing that ignores all suggested angles and prove no background text is automatically inserted or represented as the author’s view

## 6. XiaoWen guided interview

- [x] 6.1 Add an explicit interview mode inside the existing XiaoWen identity and article session, with pause, change-question, return-to-writing and later-resume states
- [x] 6.2 Add a server interview action that asks exactly one grounded question, returns no candidate body and rejects invented user experience or topic facts
- [x] 6.3 Save typed and dictated answers as source-typed interview material, preserving cancellation and failure content without appending it to the body
- [x] 6.4 Add explicit material selection and composition into a full candidate with provenance summary, clarification for gaps/conflicts and existing preview/apply/dismiss safeguards
- [x] 6.5 Preserve existing free XiaoWen questions, article rewrites, optimizations, version history and current-work unsent input without restoring a separate generic chat entry

## 7. Documentation, verification and delivery

- [x] 7.1 Update product, design-system and architecture documents only when the corresponding behavior is implemented, keeping planned direction distinct from current status
- [x] 7.2 Add automated success, failure, cancel, offline, stale-source, storage-conflict and backup tests using reviewed fixtures and non-network AI transports
- [ ] 7.3 Run `npm run check`, `npm run build`, OpenSpec validation and task-only diff/sensitive-output review
- [ ] 7.4 Run browser regression for feed, topic detail, both writing paths, switching, interview composition and source updates at 360×640, 390×844, 430×932 and 1280×900
- [ ] 7.5 Record physical iOS Safari and Android Chrome evidence for system keyboard, dictation, background switching, source links and local recovery; do not substitute desktop emulation
- [ ] 7.6 If explicitly approved, run only bounded non-sensitive real topic/AI integration calls, record sources, request count and approximate cost separately, and do not use them in routine CI
- [ ] 7.7 After requirements and evidence pass, synchronize delta specs, archive the change and commit only scoped files without pushing or publishing
