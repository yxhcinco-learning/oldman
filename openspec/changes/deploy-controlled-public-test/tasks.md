## 1. Deployment foundation

- [x] 1.1 Add gateway health and content-safe structured operational logs with regression tests
- [x] 1.2 Add reviewed systemd, Nginx, release and rollback templates without secrets or product-layer temporary login
- [x] 1.3 Update environment, product, architecture, privacy and development documentation for the controlled public-test boundary

## 2. Local verification and release

- [x] 2.1 Run security/difference/OpenSpec checks plus the complete `npm run check` and `npm run build`
- [x] 2.2 Build a fixed-commit secret-free release archive, inspect members and record its local SHA-256

## 3. Existing-cloud preparation

- [x] 3.1 Record live Lighthouse identity, capacity, ports, firewall, Nginx, certificates, DNS and the exact pre-deployment rollback state
- [x] 3.2 Create the unused fixed DNS record and prepare isolated server user/directories, root-only project credentials and temporary proxy authentication
- [x] 3.3 Upload the archive, verify the remote hash and member safety, install/build in a new release and pass loopback health checks

## 4. HTTPS activation and operations

- [x] 4.1 Install/enable the two systemd services and validated Nginx same-origin routes, issue/verify TLS and leave only 80/443 public
- [x] 4.2 Verify restart recovery, graceful stop, health/process status, safe logs, log rotation policy and Certbot renewal strategy

## 5. Public acceptance

- [x] 5.1 Verify public authentication reject/success, HTTPS/security headers, static assets, AI/speech status, WebSocket Upgrade and failure paths
- [ ] 5.2 Verify text create/save/refresh and JSON backup in the public Origin plus automated 360×640, 390×844, 430×932 and desktop focus/overflow checks
- [x] 5.3 Run at most one non-sensitive public sample each for regular optimization, polish and text question, plus at most one short synthesized ASR sample when available; record calls and failures honestly
- [ ] 5.4 Complete real Safari/iOS and Android Chrome microphone, keyboard, background and network-switch checks on physical devices

## 6. Delivery evidence

- [x] 6.1 Record URL/access handoff, deployed commit, topology, verified functions, product deviations, cost/privacy limits, rollback and local commits in acceptance documentation
- [x] 6.2 When all scoped tasks have evidence, sync the deployment spec and archive the change; otherwise keep it active with incomplete device items explicit
