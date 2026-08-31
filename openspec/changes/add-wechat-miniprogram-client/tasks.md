## 1. Shared foundation and safe mini-program scaffold

- [ ] 1.1 Configure the root npm workspace/scripts for the existing web app, a platform-neutral shared core package and `apps/miniprogram`, updating the single lock file without changing the web development port or Sites boundary
- [ ] 1.2 Scaffold the native TypeScript mini-program with safe tracked `project.config.json`, app/page configuration, typings, test/build scripts and `.gitignore` rules for `project.private.config.json`, upload artifacts and developer-tool caches
- [ ] 1.3 Create the untracked local private config from the temporary `ask_job` AppID, prove it is absent from `git ls-files` and sensitive-output scans, and record that it is development/experience-only
- [ ] 1.4 Extract domain schemas, state transitions, backup contracts and topic/AI protocols into the shared package with compatibility re-exports so existing web tests and IndexedDB data remain unchanged
- [ ] 1.5 Add platform-boundary and shared-contract tests that reject React/DOM/Node/`wx` leakage and run identical fixtures through web, server and mini-program consumers
- [ ] 1.6 Run root and mini-program type/unit/build checks for the foundation stage, inspect package size and task-only diff, then commit only the verified scaffold/shared-core files without pushing

## 2. Mini-program local repository and backup

- [ ] 2.1 Define the versioned user-file layout, per-work aggregate schema, rebuildable index, active recovery record, resolved safe paths and deterministic storage error categories
- [ ] 2.2 Implement temporary-file validation/replacement, serialized writes, expected revisions and crash recovery so work/session updates are atomic and stale recovery cannot overwrite newer aggregates
- [ ] 2.3 Implement load, new/save, soft delete, restore, explicit permanent delete and index rebuild without recursive user-directory deletion or silent data loss
- [ ] 2.4 Implement compatible JSON/TXT/copy export, WeChat file selection/share flows, rescue export and validated import-as-copy with complete ID/reference remapping and rollback on partial failure
- [ ] 2.5 Add repository tests for rapid edits, save-during-exit, conflicts, corrupted/missing index, corrupted aggregate, interrupted replacement, capacity/system errors, cleanup and legacy/current backup interchange
- [ ] 2.6 Add visible local-only storage, AppID/device isolation and periodic backup explanations without promising cloud recovery, then run affected checks and commit the verified local-persistence stage

## 3. Native product shell and ordinary writing

- [ ] 3.1 Port the current Echoes design tokens, icons, typography, safe areas and accessible base components to WXSS/WXML without importing the React component tree or restoring historical mock UI
- [ ] 3.2 Build the custom “热门 / 文章 / 我的” navigation with 热门 default, fixed article creation above navigation, real empty/error states and at-least-48px targets
- [ ] 3.3 Build article list, local save/recovery status, recycle bin, backup management and ordinary new/continue writing against the mini-program repository
- [ ] 3.4 Build the native title dialog, voice/text toolbar and text editor using keyboard-height/safe-area events; preserve the visible current interaction and provide the specified paragraph/end fallback when exact DOM-style caret placement is unavailable
- [ ] 3.5 Cover long article rendering, keyboard open/close, page hide/show, interrupted navigation, unsaved input and 360/390/430-width layout behavior with component and developer-tool evidence
- [ ] 3.6 Run focused UI/repository tests plus root check/build, review visual/accessibility differences against the current product, and commit only the verified ordinary-writing stage

## 4. Topic, interview and XiaoWen experience

- [ ] 4.1 Implement the mini-program topic HTTP adapter and reviewed 热门 list/detail pages with source links, stale/corrected/unavailable states and no unreviewed or mock fallback
- [ ] 4.2 Implement “直接写” with a collapsible saved topic background that never inserts background or angles into the author body
- [ ] 4.3 Implement the static first-interview introduction, one-answer/one-question message flow, change-question action, content-aware close routing and material persistence without a second assistant or form-style control clutter
- [ ] 4.4 Port the XiaoWen conversation panel, unsent in-memory composer, typed/dictated input boundary, request status, close/reopen state and short-screen fixed composer behavior
- [ ] 4.5 Implement article/interview compose requests, result explanations, full candidate preview, baseline conflict checks, apply/dismiss/undo and modification records against the shared session contract
- [ ] 4.6 Add success, failure, cancel, close-while-running, offline, stale-topic, insufficient/conflicting material and candidate-conflict tests using non-network transports
- [ ] 4.7 Run the combined topic/interview/XiaoWen checks and four-size developer-tool regression, update any corresponding acceptance evidence, and commit the verified feature-parity stage

## 5. Minimal WeChat identity and business sessions

- [ ] 5.1 Add a narrow SQLite adapter on the pinned/verified Node runtime plus the release-external identity store with users, `(app_id, openid)` identities, hashed opaque sessions, migrations, WAL/integrity settings, expiry/revocation cleanup and transactional repository tests
- [ ] 5.2 Implement a bounded `code2Session` transport using server-only AppID/AppSecret, strict response/error validation, one-use code handling and logs that never contain URL query secrets, OpenID or session keys
- [ ] 5.3 Implement `POST /api/mini/auth/wechat`, minimal user upsert, high-entropy token issuance, active-session limits and unified unauthorized responses with IP/user limits before any paid upstream
- [ ] 5.4 Implement the mini-program single-flight auth client, encrypted token persistence with memory-only fallback, one bounded relogin on 401 and an offline state that never blocks local writing
- [ ] 5.5 Add deterministic success, invalid/expired/replayed code, AppID mismatch, upstream failure, token expiry/revocation, persistence failure, concurrency and no-profile-data tests without real WeChat calls
- [ ] 5.6 Run identity migrations/tests, root security/check/build and a sensitive-output scan, back up the local test database if needed, and commit only the verified identity stage

## 6. Authenticated mini-program AI and network clients

- [ ] 6.1 Add namespaced mini-program AI/status handlers that reuse current validation/upstream code while requiring Bearer sessions and preserving concurrency, timeout, size and no-retry limits
- [ ] 6.2 Implement the mini-program `wx.request` client with bounded response parsing, Abort/cancel equivalents, one auth recovery attempt and user-facing offline/configuration/upstream errors
- [ ] 6.3 Ensure reviewed topic reads remain bounded/cacheable while every mini AI request carries a valid business session and neither path depends on a browser Origin header
- [ ] 6.4 Add contract tests proving web same-origin routes retain current behavior, mini routes reject missing/expired sessions before DeepSeek, and request/response schemas remain identical where intended
- [ ] 6.5 Run AI/topic focused tests plus root check/build, inspect logs and bundles for credentials/identity leakage, and commit the verified authenticated-network stage without real paid calls

## 7. Mini-program realtime speech

- [ ] 7.1 Implement an in-memory cryptographically random speech-ticket store with 60-second TTL, atomic one-time consumption, bounded cleanup and tests for missing, expired, replayed and concurrent tickets
- [ ] 7.2 Add authenticated speech-ticket HTTP and dedicated mini WSS routes that reuse the Tencent accumulator/signing path, preserve all connection/byte/duration/buffer limits and leave the browser Origin route unchanged
- [ ] 7.3 Implement the `RecorderManager` adapter for 16 kHz mono PCM, irregular `ArrayBuffer` buffering on even sample boundaries, local volume feedback, final-frame/end ordering and bounded duration
- [ ] 7.4 Implement long-press, privacy/microphone authorization, release-before-ready, cancel, page hide, system interruption, Socket failure and late-event isolation with text-input fallback
- [ ] 7.5 Integrate dictated text into ordinary writing and XiaoWen composers without auto-sending AI, auto-applying text or retaining original audio files
- [ ] 7.6 Add deterministic recorder/socket/ticket tests for success, partial/final revision, irregular frames, denial, cancellation, weak network, background, timeout, limits and resource release
- [ ] 7.7 Run speech-focused tests and developer-tool flow checks without paid ASR, then run root check/build, inspect resource cleanup and commit the verified speech implementation stage

## 8. AI origin labeling and privacy presentation

- [ ] 8.1 Define and test the deterministic current-work AI-assistance predicate and versioned backup disclosure using applied candidate/session provenance without treating dismissed candidates or user-only work as generated
- [ ] 8.2 Add visible AI-assisted labels and verification copy to web and mini XiaoWen messages, candidate previews and modification records while preserving separation from user answers, sources and body text
- [ ] 8.3 Add compliant visible disclosure to TXT/copy and machine-readable/user-readable disclosure to versioned JSON export/import, with regressions for apply, dismiss, manual edit, restore and cross-client backup
- [ ] 8.4 Update privacy and consent flows for WeChat identity, local storage, microphone/Tencent ASR and article/history/DeepSeek transfer; permission requests occur only at the corresponding user action and refusal retains local/text paths
- [ ] 8.5 Create the AI labeling/privacy submission checklist and non-content evidence fixtures, run web/mini export/UI checks plus root check/build, and commit the verified labeling/privacy stage

## 9. Deployment boundary and manual secret handoff

- [ ] 9.1 Add fail-closed runtime parsing and empty templates for `WECHAT_MINIPROGRAM_APP_ID`, `WECHAT_MINIPROGRAM_APP_SECRET` and `SUIYUE_AUTH_DB_PATH`, with configuration tests that never echo values
- [ ] 9.2 Update host preparation/systemd deployment for the resolved `/var/lib/suiyue-yousheng` identity directory, restrictive ownership, pre-migration backup, integrity checks and rollback that preserves identity data
- [ ] 9.3 Update Nginx with exact Basic-Auth exemptions for reviewed topics and `/api/mini/*`, separate rate limits, WSS Upgrade, no ticket query logging and default denial for unlisted API paths while retaining all web security headers/routes
- [ ] 9.4 Extend deployment verification for web Basic Auth, mini login/session/ticket rejection, loopback-only ports, service restarts, database persistence and no-secret/no-content logs
- [ ] 9.5 Update development, architecture, product, privacy, deployment and acceptance documents with the actual implemented data boundary, temporary AppID warning, manual platform settings and rollback path
- [ ] 9.6 Run configuration/Nginx/deployment-script checks, full root check/build, OpenSpec validation and sensitive release-archive inspection, then commit only the verified deployment/documentation stage without deploying
- [ ] 9.7 Hand off the exact server file `/etc/suiyue-yousheng/runtime.env` and variable names to the user for manual AppSecret entry; record only configured/not-configured evidence and never receive or print the secret

## 10. Developer-tool, controlled integration and physical-device evidence

- [ ] 10.1 Open and compile the local mini-program with the logged-in WeChat developer-tool CLI and temporary private AppID, verify page/package configuration and generate preview evidence without upload, submission or release
- [ ] 10.2 Run developer-tool regression for navigation, ordinary writing, local recovery, recycle bin, backup, topic paths, interview, XiaoWen, candidate application, keyboard changes, permission denial and offline failures at representative phone sizes
- [ ] 10.3 After explicit deployment authorization and the user's manual secret/domain/privacy configuration, deploy one verified server release and test real WeChat code exchange with a non-sensitive account; record request count and non-secret result
- [ ] 10.4 After bounded paid-call authorization, run at most the necessary short DeepSeek and Tencent ASR samples through the mini routes, recording actual counts, results and approximate cost separately without storing user content or audio
- [ ] 10.5 On physical iOS WeChat, record keyboard/safe-area, long-press and permission denial/recovery, realtime/final speech, background interruption, source link, local restart recovery and backup import/export results
- [ ] 10.6 On physical Android WeChat, record keyboard/safe-area, long-press and permission denial/recovery, realtime/final speech, background interruption, source link, local restart recovery and backup import/export results
- [ ] 10.7 Before switching away from the temporary AppID, export a non-sensitive test backup; when the final AppID is available, verify empty isolated startup and explicit import-as-copy without identity/token migration
- [ ] 10.8 Confirm the final AppID subject, name, category, filing, request/socket domains, privacy guide and AI labeling materials; keep upload/review/release pending until the user separately authorizes each external step

## 11. Final verification, archival and delivery

- [ ] 11.1 Run `npm run check`, `npm run build`, mini-program package/developer-tool checks, `openspec validate --all --strict`, task-only diff review and sensitive/generated-artifact scan on the final implementation commit
- [ ] 11.2 Re-run web regression to prove Basic Auth, IndexedDB writing, topic/AI/ASR routes, backups and current interaction were not regressed by shared-core or deployment changes
- [ ] 11.3 Consolidate automated, developer-tool, real WeChat/AI/ASR and physical iOS/Android evidence in the acceptance record, explicitly listing any unverified final-AppID or release item
- [ ] 11.4 When every in-scope task and required external/device evidence is complete, synchronize delta specs into `openspec/specs`, archive the change, update product/architecture/acceptance status and commit only scoped files without pushing, uploading, submitting or publishing
