> 2026-09-06 用户修订：小程序唯一用户端，网页仅运营后台；H5 源码与专属验收归档并切断依赖。下文已完成阶段保留历史事实，剩余任务按此范围执行。退役 H5 不代表共享/小程序缺陷或新 AppID 验收完成。

## 1. Shared foundation and safe mini-program scaffold

- [x] 1.1 Configure the root npm workspace/scripts for the existing web app, a platform-neutral shared core package and `apps/miniprogram`, updating the single lock file without changing the web development port or Sites boundary
- [x] 1.2 Scaffold the native TypeScript mini-program with safe tracked `project.config.json`, app/page configuration, typings, test/build scripts and `.gitignore` rules for `project.private.config.json`, upload artifacts and developer-tool caches
- [x] 1.3 Create the untracked local private config from the temporary `ask_job` AppID, prove it is absent from `git ls-files` and sensitive-output scans, and record that it is development/experience-only
- [x] 1.4 Extract domain schemas, state transitions, backup contracts and topic/AI protocols into the shared package with compatibility re-exports so existing web tests and IndexedDB data remain unchanged
- [x] 1.5 Add platform-boundary and shared-contract tests that reject React/DOM/Node/`wx` leakage and run identical fixtures through web, server and mini-program consumers
- [x] 1.6 Run root and mini-program type/unit/build checks for the foundation stage, inspect package size and task-only diff, then commit only the verified scaffold/shared-core files without pushing

## 2. Mini-program local repository and backup

- [x] 2.1 Define the versioned user-file layout, per-work aggregate schema, rebuildable index, active recovery record, resolved safe paths and deterministic storage error categories
- [x] 2.2 Implement temporary-file validation/replacement, serialized writes, expected revisions and crash recovery so work/session updates are atomic and stale recovery cannot overwrite newer aggregates
- [x] 2.3 Implement load, new/save, soft delete, restore, explicit permanent delete and index rebuild without recursive user-directory deletion or silent data loss
- [x] 2.4 Implement compatible JSON/TXT/copy export, WeChat file selection/share flows, rescue export and validated import-as-copy with complete ID/reference remapping and rollback on partial failure
- [x] 2.5 Add repository tests for rapid edits, save-during-exit, conflicts, corrupted/missing index, corrupted aggregate, interrupted replacement, capacity/system errors, cleanup and legacy/current backup interchange
- [x] 2.6 Add visible local-only storage, AppID/device isolation and periodic backup explanations without promising cloud recovery, then run affected checks and commit the verified local-persistence stage

## 3. Native product shell and ordinary writing

- [x] 3.1 Port the current Echoes design tokens, icons, typography, safe areas and accessible base components to WXSS/WXML without importing the React component tree or restoring historical mock UI
- [x] 3.2 Build the custom “热门 / 文章 / 我的” navigation with 热门 default, fixed article creation above navigation, real empty/error states and at-least-48px targets
- [x] 3.3 Build article list, local save/recovery status, recycle bin, backup management and ordinary new/continue writing against the mini-program repository
- [x] 3.4 Build the native title dialog, voice/text toolbar and text editor using keyboard-height/safe-area events; preserve the visible current interaction and provide the specified paragraph/end fallback when exact DOM-style caret placement is unavailable
- [x] 3.5 Cover long article rendering, keyboard open/close, page hide/show, interrupted navigation, unsaved input and 360/390/430-width layout behavior with component and developer-tool evidence
- [x] 3.6 Run focused UI/repository tests plus root check/build, review visual/accessibility differences against the current product, and commit only the verified ordinary-writing stage

## 4. Topic, interview and XiaoWen experience

- [x] 4.1 Implement the mini-program topic HTTP adapter and reviewed 热门 list/detail pages with source links, stale/corrected/unavailable states and no unreviewed or mock fallback
- [x] 4.2 Implement “直接写” with a collapsible saved topic background that never inserts background or angles into the author body
- [x] 4.3 Implement the static first-interview introduction, one-answer/one-question message flow, change-question action, content-aware close routing and material persistence without a second assistant or form-style control clutter
- [x] 4.4 Port the XiaoWen conversation panel, unsent in-memory composer, typed/dictated input boundary, request status, close/reopen state and short-screen fixed composer behavior
- [x] 4.5 Implement article/interview compose requests, result explanations, full candidate preview, baseline conflict checks, apply/dismiss/undo and modification records against the shared session contract
- [x] 4.6 Add success, failure, cancel, close-while-running, offline, stale-topic, insufficient/conflicting material and candidate-conflict tests using non-network transports
- [x] 4.7 Accept the accumulated H5 parity, four-size developer-tool evidence and the product owner's 2026-09-04 functional acceptance; do not repeat the current-client manual matrix solely for closure

## 5. Minimal WeChat identity and business sessions

- [x] 5.1 Add a narrow SQLite adapter on the pinned/verified Node runtime plus the release-external identity store with users, `(app_id, openid)` identities, hashed opaque sessions, migrations, WAL/integrity settings, expiry/revocation cleanup and transactional repository tests
- [x] 5.2 Implement a bounded `code2Session` transport using server-only AppID/AppSecret, strict response/error validation, one-use code handling and logs that never contain URL query secrets, OpenID or session keys
- [x] 5.3 Implement `POST /api/mini/auth/wechat`, minimal user upsert, high-entropy token issuance, active-session limits and unified unauthorized responses with IP/user limits before any paid upstream
- [x] 5.4 Implement the mini-program single-flight auth client, encrypted token persistence with memory-only fallback, one bounded relogin on 401 and an offline state that never blocks local writing
- [x] 5.5 Add deterministic success, invalid/expired/replayed code, AppID mismatch, upstream failure, token expiry/revocation, persistence failure, concurrency and no-profile-data tests without real WeChat calls
- [x] 5.6 Run identity migrations/tests, root security/check/build and a sensitive-output scan, back up the local test database if needed, and commit only the verified identity stage

## 6. Authenticated mini-program AI and network clients

- [x] 6.1 Add namespaced mini-program AI/status handlers that reuse current validation/upstream code while requiring Bearer sessions and preserving concurrency, timeout, size and no-retry limits
- [x] 6.2 Implement the mini-program `wx.request` client with bounded response parsing, Abort/cancel equivalents, one auth recovery attempt and user-facing offline/configuration/upstream errors
- [x] 6.3 Ensure reviewed topic reads remain bounded/cacheable while every mini AI request carries a valid business session and neither path depends on a browser Origin header
- [x] 6.4 Add contract tests proving web same-origin routes retain current behavior, mini routes reject missing/expired sessions before DeepSeek, and request/response schemas remain identical where intended
- [x] 6.5 Run AI/topic focused tests plus root check/build, inspect logs and bundles for credentials/identity leakage, and commit the verified authenticated-network stage without real paid calls

## 7. Mini-program realtime speech

- [x] 7.1 Implement an in-memory cryptographically random speech-ticket store with 60-second TTL, atomic one-time consumption, bounded cleanup and tests for missing, expired, replayed and concurrent tickets
- [x] 7.2 Add authenticated speech-ticket HTTP and dedicated mini WSS routes that reuse the Tencent accumulator/signing path, preserve all connection/byte/duration/buffer limits and leave the browser Origin route unchanged
- [x] 7.3 Implement the `RecorderManager` adapter for 16 kHz mono PCM, irregular `ArrayBuffer` buffering on even sample boundaries, local volume feedback, final-frame/end ordering and bounded duration
- [x] 7.4 Implement long-press, privacy/microphone authorization, release-before-ready, cancel, page hide, system interruption, Socket failure and late-event isolation with text-input fallback
- [x] 7.5 Integrate dictated text into ordinary writing and XiaoWen composers without auto-sending AI, auto-applying text or retaining original audio files
- [x] 7.6 Add deterministic recorder/socket/ticket tests for success, partial/final revision, irregular frames, denial, cancellation, weak network, background, timeout, limits and resource release
- [x] 7.7 Run speech-focused tests and developer-tool flow checks without paid ASR, then run root check/build, inspect resource cleanup and commit the verified speech implementation stage

## 8. AI origin labeling and privacy presentation

- [x] 8.1 Define and test the deterministic current-work AI-assistance predicate and versioned backup disclosure using applied candidate/session provenance without treating dismissed candidates or user-only work as generated
- [x] 8.2 Add visible AI-assisted labels and verification copy to web and mini XiaoWen messages, candidate previews and modification records while preserving separation from user answers, sources and body text
- [x] 8.3 Add compliant visible disclosure to TXT/copy and machine-readable/user-readable disclosure to versioned JSON export/import, with regressions for apply, dismiss, manual edit, restore and cross-client backup
- [x] 8.4 Update privacy and consent flows for WeChat identity, local storage, microphone/Tencent ASR and article/history/DeepSeek transfer; permission requests occur only at the corresponding user action and refusal retains local/text paths
- [x] 8.5 Create the AI labeling/privacy submission checklist and non-content evidence fixtures, run web/mini export/UI checks plus root check/build, and commit the verified labeling/privacy stage

## 9. Deployment boundary and manual secret handoff

- [x] 9.1 Add fail-closed runtime parsing and empty templates for `WECHAT_MINIPROGRAM_APP_ID`, `WECHAT_MINIPROGRAM_APP_SECRET` and `SUIYUE_AUTH_DB_PATH`, with configuration tests that never echo values
- [x] 9.2 Update host preparation/systemd deployment for the resolved `/var/lib/suiyue-yousheng` identity directory, restrictive ownership, pre-migration backup, integrity checks and rollback that preserves identity data
- [x] 9.3 Update Nginx with exact Basic-Auth exemptions for reviewed topics and `/api/mini/*`, separate rate limits, WSS Upgrade, no ticket query logging and default denial for unlisted API paths while retaining all web security headers/routes
- [x] 9.4 Extend deployment verification for web Basic Auth, mini login/session/ticket rejection, loopback-only ports, service restarts, database persistence and no-secret/no-content logs
- [x] 9.5 Update development, architecture, product, privacy, deployment and acceptance documents with the actual implemented data boundary, temporary AppID warning, manual platform settings and rollback path
- [x] 9.6 Run configuration/Nginx/deployment-script checks, full root check/build, OpenSpec validation and sensitive release-archive inspection, then commit only the verified deployment/documentation stage without deploying
- [x] 9.7 Hand off the exact server file `/etc/suiyue-yousheng/runtime.env` and variable names to the user for manual AppSecret entry; record only configured/not-configured evidence and never receive or print the secret

## 10. Developer-tool, controlled integration and physical-device evidence

- [x] 10.1 Open and compile the local mini-program with the logged-in WeChat developer-tool CLI and temporary private AppID, verify page/package configuration and generate preview evidence without upload, submission or release
- [x] 10.2 Accept the accumulated developer-tool regressions and the product owner's current-client functional test as sufficient evidence without repeating the same manual paths
- [x] 10.3 After explicit deployment authorization and the user's manual secret/domain/privacy configuration, deploy one verified server release and test real WeChat code exchange with a non-sensitive account; record request count and non-secret result
- [x] 10.4 正式小程序真实AI接口已单次验证，用户确认新AppID语音转文字与对话通过；本轮9次有界模型联调单列。用户试玩次数/时长及实际账单未统计，不重复收费只为补计数、不保留用户内容，见技术收尾记录
- [x] 10.5 Record the product owner's 2026-09-04 decision not to require unavailable iOS WeChat evidence for the current acceptance scope; do not claim that iOS testing occurred
- [x] 10.6 Record the product owner's confirmation that the current Android WeChat client functions pass their testing; no duplicate agent-run physical-device test is required
- [x] 10.7 已保护旧AppID业务备份，正式AppID空仓储/独立身份通过；非敏感JSON v5在新AppID下独立测试仓储两次导入形成不同ID副本，不迁移身份/token或自动导入旧用户作品，见 docs/FORMAL-APPID-ACCEPTANCE.md
- [x] 10.8 正式身份/存储隔离、用户配置request/socket域名及新AppID基础真机通过；用户明确主体/备案等平台材料由其处理，转发布清单而非技术归档门槛，不记审核通过；上传/提审/发布仍单独授权

## 11. Final verification, archival and delivery

- [x] 11.1 最终代码7cb0521完整check/build、279项测试、17项OpenSpec、包体/差异/边界检查通过；正式AppID首页5条及schema通过，沿用无改动UI的已有模拟器证据，见技术收尾
- [x] 11.2 本轮后台登录/发布真实Fastify及SQLite隔离测试、管理UI组件回归、后端线上鉴权拒绝/API、共享备份和小程序检查通过；网页未改沿用浏览器尺寸证据，不向线上发布测试话题，见技术收尾
- [x] 11.3 自动化、模型、换码及用户Android/ASR确认已分列；iOS未验，平台材料移独立发布清单，未上传/提审/发布，见 docs/TECHNICAL-CLOSURE-20260906.md
- [x] 11.4 约定技术范围验收完成，平台事项按用户要求移发布清单且不记通过；同步增量规范并归档，产品/架构/验收记录更新，仅本地提交；已授权网关部署单列，未推送或上传/提审/发布小程序

## 退役范围（不是验收通过）

H5 用户 UI、浏览器存储/采音、双端视觉对齐和 H5 专属人工验收由用户决定取消维护，归档资料仅追溯。服务端兼容协议测试、运营后台浏览器回归、小程序与核心安全验收仍执行。云端账号/作品/同步另立变更，仅面向小程序。
