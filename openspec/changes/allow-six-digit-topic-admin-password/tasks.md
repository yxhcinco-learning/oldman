## 1. Password contract

- [ ] 1.1 Change the scrypt hash generator to accept 6–1024 characters without changing the encoded format or verification cost.
- [ ] 1.2 Add focused tests for six-character acceptance, five-character rejection, maximum length and existing long-password login behavior.

## 2. Local configuration and documentation

- [ ] 2.1 Document the six-character minimum and retained security controls.
- [ ] 2.2 Generate the requested credential interactively, store only its hash with username `admin` in ignored `.env.local`, restart the loopback services and verify authenticated access.

## 3. Verification and completion

- [ ] 3.1 Run the focused test, `npm run check`, `npm run build`, strict OpenSpec validation and sensitive-file boundary check without paid upstream calls.
- [ ] 3.2 Synchronize the approved delta into the main spec, record local evidence and archive the completed change without deploying or pushing.
