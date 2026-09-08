---
name: openspec-apply-change
description: Implement or continue an existing OpenSpec change when implementation is requested.
allowed-tools: Bash(openspec:*)
license: MIT
metadata:
  compatibility: Requires the project-local openspec CLI.
  author: openspec
  version: "1.0"
  generatedBy: "1.12.0"
---

Implement tasks from an OpenSpec change.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `openspec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: Optionally specify a change name (e.g., `$openspec-apply-change (Codex) or /openspec-apply-change (other agents) add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Select the only active change only when it matches the requested work; do not redirect an unrelated task to it
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   Briefly identify the selected change once; avoid repeating workflow banners.

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `planningHome`, `changeRoot`, and `actionContext`: planning scope and edit constraints
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)

3. **Get apply instructions**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema - could be proposal/specs/design/tasks or spec/tests/implementation/docs)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state
   - Optional `context`: current required project instruction input from the selected root
   - Optional `operationGuidance`: current advisory guidance for apply

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): use status and artifact instructions to create missing planning within the authorized scope, then recheck readiness; ask only if a material decision or permission is missing. Never bypass the blocked state
   - If `state: "all_done"`: verify acceptance evidence and follow the repository completion policy; archive when already authorized and ready
   - Otherwise: proceed to implementation

   Treat `context` as a required prompt-level input. Read and consider it, and
   apply relevant project facts, conventions, and constraints while implementing.
   Treat `operationGuidance` as optional additive advice. Read and consider every
   entry, and follow entries that are applicable and compatible with the built-in
   workflow.

   Keep both fields separate from CLI-returned state, missing artifacts, tasks,
   progress, `contextFiles`, and the built-in `instruction`. They are not
   evidence of task completion, do not replace the built-in instruction, and do
   not permit bypassing a blocked state. If context conflicts with the built-in
   instruction, an explicit user choice, or a CLI-controlled value, report the
   conflict and preserve the controlling value. If guidance is inapplicable, omit it; if a conflict affects the result, explain it and preserve the controlling input.
   These are prompt-level behavior contracts, not enforceable checks.

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

   Do not copy `context` or `operationGuidance` verbatim into implementation
   files or planning artifacts unless the user separately asks for that content.

5. **Report useful progress**

   Briefly summarize what is complete, what remains and any decision that affects implementation. Avoid repeating CLI fields or unchanged task counts.

6. **Implement tasks (loop until done or blocked)**

   For each pending task:
   - Identify the work when that adds useful context
   - Make the code changes required
   - Keep changes minimal and focused
   - Mark a task `- [x]` only after its specified behavior and required verification have evidence
   - Continue to next task

   **Continue or pause according to the actual decision:**
   - Resolve routine implementation details and repair errors within scope; update affected artifacts when the accepted behavior is unchanged.
   - Ask before materially expanding or departing from the accepted request/spec in scope, observable behavior, compatibility or acceptance criteria, or performing an unauthorized external action. Routine internal implementation choices remain within scope. Do not silently drop, defer or narrow a requirement to make implementation fit.
   - Continue independent work while a required answer or external result is pending. Explain the concrete blocker and the instruction behind a necessary stop.
   - Incorporate user corrections and answer status questions, then continue the goal. Stop when the user explicitly pauses, cancels or replaces it.

7. **Complete or report the actual blocker**

   Verify acceptance and finish already-authorized sync/archive. If evidence or a necessary decision is missing, state the concrete gap and continue any independent work.

**Communication**

Report meaningful progress and decisions concisely. At delivery, state what changed, actual checks, remaining evidence gaps, and sync/archive status. Use task counts only when helpful; the output does not require a fixed banner or per-task transcript.

**Guardrails**
- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- Infer routine details; ask about unresolved ambiguity only when it materially affects the result
- Repair issues within scope and update affected artifacts; surface a change of behavior or scope before proceeding with it
- Keep code changes minimal and scoped to each task
- Update task checkbox immediately after completing each task
- Diagnose recoverable failures; stop dependent work only for a real missing decision, permission, or external prerequisite
- When work materially expands or changes the accepted behavior or scope, surface it and pause dependent work; routine internal implementation details do not require confirmation. Never silently narrow, defer, or simplify away specified behavior
- Only mark a task `- [x]` when its specified behavior is fully implemented, not when it is partially done or deferred
- Use contextFiles from CLI output, don't assume specific file names
- Do not use context or operation guidance as proof that a task is complete
- Apply relevant project context; report conflicts with controlling workflow inputs
- Apply relevant advisory guidance; explain only conflicts that affect the task
- Do not copy runtime context or operation guidance into implementation files or planning artifacts
- Preserve CLI-controlled blocked/ready/all-done behavior and completion criteria

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: Keep artifacts current within accepted behavior; clarify material scope changes
