# Skill test: subagent-driven-development (Codex backend)

Paste this prompt into a fresh Claude Code session opened in any git repo.

---

## Test prompt

I want to use subagent-driven-development with the Codex backend to execute this small plan.

Before starting, use `codex debug models` to pick an appropriate model for a mechanical task.

**Plan — 2 tasks:**

**Task 1:** Create a file `codex-test/greeting.ts` with a function `greet(name: string): string` that returns `"Hello, <name>!"`. Export it as default. No dependencies needed.

**Task 2:** Create a file `codex-test/greeting.test.ts` that imports the function and asserts `greet("World") === "Hello, World!"` using Node's built-in `assert` module.

Execute both tasks using the Codex CLI backend. Use `workspace-write` sandbox mode. After each task, run the two-stage review (spec compliance then code quality) with Claude subagents.

---

## What to verify

- [ ] Claude fetches model catalog via `codex debug models` and picks a model
- [ ] Each task invokes `codex exec` (not `codex`) with `-m`, `-s workspace-write`, `-C`, `--ephemeral`, `-o`
- [ ] Output file is created with `mktemp -t codex.XXXXXX` (unique path, not hardcoded)
- [ ] Status is parsed with `grep -oE 'DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED'` into `$codex_status`
- [ ] Spec compliance review runs (Claude subagent) before code quality review
- [ ] Code quality review runs (Claude subagent) after spec compliance passes
- [ ] Both files exist and are valid TypeScript after completion
