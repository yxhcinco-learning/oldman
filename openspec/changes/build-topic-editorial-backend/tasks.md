## 1. Contracts and storage foundation

- [x] 1.1 Relax shared topic/source and snapshot schemas to allow zero sources, add explicit placement and editorial DTO schemas, and cover backward-compatible backup parsing
- [x] 1.2 Implement the independent SQLite topic store with strict migrations, integrity checks, revision concurrency, generation/audit records and five-slot scheduling
- [x] 1.3 Add the idempotent 21-topic seed migration and preserve the current first five topics as explicit placements without retaining a runtime seed fallback
- [x] 1.4 Add deterministic store tests for migration, restart, rollback, immutable publication/correction, overlapping slots, time visibility, archive and database failures
- [x] 1.5 Run focused domain/store checks, validate OpenSpec, inspect the scoped diff and commit the verified storage stage

## 2. Runtime and public topic contract

- [x] 2.1 Add topic runtime configuration with a Git-ignored development database, production absolute-path validation and fail-closed health flags
- [x] 2.2 Replace the in-memory public queue with the SQLite store so list results follow active slot order and detail respects publication, expiry and archive time
- [x] 2.3 Update H5 and mini clients to trust server order and render topics with no source section while preserving topic snapshots and old backups
- [x] 2.4 Add public API and client regressions for zero-to-five topics, no-source detail, schedule boundaries, unavailable storage and unchanged local writing paths
- [x] 2.5 Run focused public/shared/mini checks, full check/build and commit the verified public-runtime stage

## 3. Independent admin authentication and editorial API

- [ ] 3.1 Implement single-admin scrypt configuration, interactive password-hash generation, hashed persistent sessions, CSRF, origin/content-type checks, expiry, logout, rotation and login throttling
- [ ] 3.2 Implement authenticated admin topic list/detail, manual draft, optimistic edit, reject, correction, atomic publish/schedule, slot adjustment, archive, generation-history and audit endpoints
- [ ] 3.3 Add authentication and API tests for success, generic login failure, throttling, cookie flags, expiry, rotation, unauthorized/CSRF/origin/content-type rejection, 409 conflicts and log redaction
- [ ] 3.4 Run focused admin checks, full check/build, sensitive-output inspection and commit the verified admin API stage

## 4. DeepSeek topic candidate generation

- [ ] 4.1 Implement a separate DeepSeek Responses adapter using structured topic output and optional `web_search` without altering article Chat Completions
- [ ] 4.2 Add the authenticated generation endpoint with text/link validation, link-only search requirement, one-request concurrency, cancellation, usage/search accounting, fixed failures and manual-draft fallback
- [ ] 4.3 Add non-network contract tests for text, links, combined input, search enabled/disabled, zero sources, invalid URLs, malformed output, timeout, cancellation, concurrency and no retry
- [ ] 4.4 Run focused AI/admin checks, full check/build, verify no test made a paid request and commit the verified generation stage

## 5. Editorial console

- [ ] 5.1 Build `/admin/topics` login and authenticated shell with status/kind/search filters, session expiry handling and no product-navigation exposure
- [ ] 5.2 Build seed generation and manual draft flows, candidate editor, source editing, public preview, save-conflict recovery and generation history
- [ ] 5.3 Build publish/correction/reject/archive actions, five-slot schedule view, overlap feedback, revision history and non-sensitive audit view
- [ ] 5.4 Add responsive Echoes-aligned admin styling and UI regressions for desktop and 390px mobile, including keyboard, focus, failure, empty and busy states
- [ ] 5.5 Run admin browser regression at 1280×900, 1440×900 and 390×844, full check/build, inspect captures and commit the verified console stage

## 6. Deployment, documentation and completion

- [ ] 6.1 Extend environment examples, Nginx/systemd and activation/rollback tooling for independent admin routes, topic health, root-only topic DB, dual backup, integrity and failed-migration recovery without deploying
- [ ] 6.2 Update product, architecture, design, content policy, development, deployment, privacy and acceptance documentation with actual topic/editorial/AI/data boundaries
- [ ] 6.3 Run topic database backup/restore and rollback rehearsal, all relevant H5/mini browser flows, `npm run check`, `npm run build`, strict OpenSpec and sensitive/generated-artifact scans
- [ ] 6.4 Perform at most one non-sensitive real DeepSeek Responses + web search request if local credentials and provider compatibility are available; record actual top-level/search calls, tokens, result and approximate cost separately
- [ ] 6.5 Synchronize delta specs into `openspec/specs`, archive the completed change, update acceptance status and commit only scoped files without connecting, deploying, pushing, uploading or publishing
