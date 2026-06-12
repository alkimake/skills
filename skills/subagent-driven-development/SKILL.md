---
name: subagent-driven-development
description: >
  Use when executing implementation plans with independent tasks in the current session.
  Extends the upstream superpowers skill with a Codex CLI backend option: when the user
  wants to delegate implementation tasks to Codex agents with specific OpenAI models
  instead of Claude subagents.
  Triggers on: "use codex for this", "delegate to codex", "codex agents", or any mention
  of a specific OpenAI model name.
---

# Subagent-Driven Development (with Codex backend)

This skill extends **superpowers:subagent-driven-development** with an additional
implementation backend: the Codex CLI. Everything else — reviews, process, red flags,
model selection for Claude subagents — follows the upstream skill exactly.

**Load the upstream skill first, then apply the additions below.**

---

## Implementation Backend

At the start of a session, determine which backend to use for **implementer subagents**.
Reviews always use Claude regardless of backend.

```
User mentions "codex", or asks to use a specific OpenAI model?
  → Codex CLI backend
Otherwise
  → Claude subagent backend (upstream skill, no changes)
```

---

## Codex CLI Backend

When in Codex mode, replace the "Dispatch implementer subagent" step with a Codex CLI
invocation via Bash. Everything else in the process stays the same.

### Invocation

```bash
outfile=$(mktemp -t codex.XXXXXX)   # unique per invocation; safe across concurrent sessions
codex exec \
  -m <model> \
  -s <sandbox-mode> \
  -C <project-dir> \
  --ephemeral \
  -o "$outfile" \
  "<full task prompt>" &
codex_pid=$!
( sleep 300 && kill $codex_pid 2>/dev/null ) &
watchdog_pid=$!
wait $codex_pid
exit_code=$?
kill $watchdog_pid 2>/dev/null
```

Key flags:
- `-m` — model slug from `codex debug models`
- `-s` — sandbox mode; see **Sandbox mode** below
- `-C` — project root; set explicitly so Codex doesn't infer from cwd
- `--ephemeral` — don't persist session files (keeps things clean between tasks)
- `-o "$outfile"` — write the agent's final message to the unique temp file

**Timeout:** The watchdog kills Codex after 5 minutes. Adjust `sleep 300` per task size.
On Linux (or macOS with `brew install coreutils`), you can use `gtimeout 300 codex exec ...`
as a simpler alternative.

**Uniqueness:** `mktemp -t codex.XXXXXX` creates a file in the system temp dir with a
random suffix — safe across multiple concurrent Claude sessions each running their own
Codex processes. Never use a hardcoded path.

### Sandbox mode

| Mode | When to use |
|---|---|
| `workspace-write` | Read-only + file edits only; no shell commands that install packages |
| `danger-full-access` | Task needs `npm install`, `pip install`, `cargo build`, test runners, etc. |

Default to `workspace-write`. Escalate to `danger-full-access` when the task spec
mentions installing dependencies, running builds, or executing tests. Tell the user
which mode you chose and why.

### Model selection

Before the first Codex dispatch in a session, fetch the live model catalog:

```bash
codex debug models 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
for m in d['models']:
    if m.get('visibility') == 'list':
        print(m['slug'], '-', m.get('display_name',''))
"
# Field is 'slug', not 'id'. Example output:
# gpt-5.5 - GPT-5.5
# gpt-5.4 - GPT-5.4
# gpt-5.4-mini - GPT-5.4-Mini
```

Use `--bundled` flag if offline. Pick from the results using this heuristic:

| Task type | Pick |
|---|---|
| Mechanical (1-2 files, complete spec) | smallest/fastest model in catalog |
| Integration / multi-file | mid-tier model |
| Architecture / design judgment | most capable model in catalog |

If the user names a specific model, use that and skip the catalog lookup.
Cache the result for the session — no need to re-fetch per task.

### Task prompt construction

Codex receives a single prompt string. Pack it the same way you'd brief a Claude
implementer subagent — full task text, relevant file paths, scene-setting context,
and the expected output. Codex cannot ask questions mid-run, so resolve all ambiguity
**before** invoking.

The prompt must end with this exact instruction:

```
When finished, output your status as the very last word of your response:
DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.
```

Example prompt:

```
You are implementing Task 2 of 5 from a feature plan.

Context: We're adding a rate-limit middleware to an Express API.
Previous task (auth middleware) is complete on branch feat/rate-limit.

Task: Add per-IP rate limiting using the express-rate-limit package.
- Install express-rate-limit
- Add middleware in src/middleware/rateLimit.ts
- Wire it into src/app.ts before route handlers
- Add tests in src/middleware/rateLimit.test.ts (100 req/15min window)

When done, commit with message: "feat: add per-IP rate limiting"
When finished, output your status as the very last word of your response:
DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.
```

### Parsing Codex output

The `-o` file contains the agent's full final message (prose + status token at the end).
Extract the status token with:

```bash
codex_status=$(grep -oE 'DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED' "$outfile" | tail -1)
rm "$outfile"
```

`DONE_WITH_CONCERNS` must appear before `DONE` in the pattern or `DONE` matches inside it.
Use `codex_status` (not `status` — that's a reserved variable in zsh).

If `exit_code` is non-zero, `$outfile` is empty, or `$codex_status` is empty — treat as
BLOCKED and inspect stderr for the error.

### Handling NEEDS_CONTEXT

Codex cannot ask questions interactively. If it outputs `NEEDS_CONTEXT`:

1. Read `$outfile` to see what information it flagged as missing
2. Add that information to the task prompt
3. Re-invoke with the enriched prompt and a fresh `mktemp` file
4. If the same context gap surfaces twice, escalate to human — the task spec is
   insufficient and needs to be rewritten before proceeding

### Git repo requirement

Codex requires the working directory to be inside a git repo. If it isn't, add
`--skip-git-repo-check` to the invocation. For most implementation tasks you'll be in
a real repo, so this is rarely needed.

### Review steps stay on Claude

After a Codex implementer finishes, dispatch spec compliance and code quality reviewers
as Claude subagents exactly as the upstream skill describes. Codex is only for
implementation; reviewers need judgment and codebase context that Claude handles better.

---

## Quick reference: what changes vs upstream

| Step | Upstream | This skill (Codex mode) |
|---|---|---|
| Implementer dispatch | `Agent` tool | `Bash` → `codex exec` |
| Model for implementer | haiku/sonnet/opus | slug from `codex debug models` (field: `slug`) |
| Output capture | subagent return value | `mktemp -t codex.XXXXXX` file via `-o` |
| Status parsing | subagent return value | `grep -oE` against `-o` file into `$codex_status` |
| Pre-task questions | subagent asks before starting | must resolve before invoking |
| Spec compliance review | Claude subagent | Claude subagent (unchanged) |
| Code quality review | Claude subagent | Claude subagent (unchanged) |
| Final review | Claude subagent | Claude subagent (unchanged) |

---

## Red flags (Codex-specific additions)

- **Never** invoke Codex with an ambiguous prompt — resolve questions first, then invoke.
- **Never** skip reviews because "Codex already checked its work" — the two-stage review
  applies regardless of backend.
- **Never** use a hardcoded output path — always `mktemp`; concurrent sessions will
  clobber a shared file.
- If `codex` is not installed: `npm install -g @openai/codex`
- If the model slug is wrong, Codex errors immediately — verify against `codex debug models`
- If `$status` is empty after the grep, Codex didn't follow the prompt instruction —
  re-invoke with a stronger emphasis on the status token requirement
