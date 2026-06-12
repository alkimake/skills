---
name: glab-workflow
description: >
  GitLab workflow via glab CLI — invoke whenever the user wants to create or comment on a GitLab issue,
  open or merge an MR, check a CI/CD pipeline after a push, link or track work across repos,
  close an issue with evidence, or do anything involving GitLab project management.
  Trigger on phrases like "create issue", "open MR", "check pipeline", "cross-project issue",
  "link issue", "update issue", "close issue", "push and validate",
  or any mention of GitLab, glab, MR, pipeline status, or issue tracking across multiple repos.
  Also trigger when the user describes work that spans multiple repos and asks how to track it.
---

# GitLab Workflow (glab CLI)

## Resolving the Repo Path

Always pass `-R <repo>` explicitly to every `glab` command that targets a project. Never trust the cwd-inferred default — you are frequently in a different repo than where the action belongs. Wrong-repo filings are silent.

**If you're inside the target repo's directory**, derive the path from git:
```bash
REPO=$(git remote get-url origin | sed 's|.*gitlab\.com[/:]||; s|\.git$||')
# e.g. → group/my-repo
```
Then use `$REPO` everywhere: `glab issue create -R "$REPO" ...`

**If the action belongs in a different repo** (e.g. filing an infra issue from a frontend directory), pass the target repo explicitly — `$REPO` would be wrong.

Issue numbers use `#<n>` (e.g. `#42`), MR numbers use `!<n>` (e.g. `!15`). When cross-linking between repos, qualify with the full path: `group/other-repo#87`.

---

## Core Principles

**Issues are durable cross-actor state** — the shared record between all people and tools working on a problem. Not throwaway todos. Always comment with evidence before closing; never re-file an existing finding.

**File issues in the repo that owns the responsibility**, not where the code change happens. A frontend symptom caused by a missing backend endpoint belongs in the backend repo. An API issue caused by a missing infra resource belongs in the infra repo. Ask if the ownership isn't obvious.

**Compose long bodies as `/tmp/<topic>.md` files**, then attach via `$(cat /tmp/<topic>.md)`. Reserve heredoc only for short single-shot commands — this keeps shell history readable and lets you review the markdown before posting.

---

## Issue Lifecycle

### Create
```bash
REPO=$(git remote get-url origin | sed 's|.*gitlab\.com[/:]||; s|\.git$||')

cat > /tmp/<topic>.md << 'EOF'
## Summary
...

## Context / steps to reproduce
...
EOF

glab issue create -R "$REPO" \
  --title "<title>" \
  --description "$(cat /tmp/<topic>.md)" \
  --label "<label>"
# → prints the new issue number, e.g. #42
```
- One finding → one issue. Don't bundle unrelated signals.
- Use the team's established labels consistently. Common pattern: `inconsistency` for drift between desired and actual state, `improvement` for proposed changes. Don't invent new labels casually.

### Comment (progress update, phase completion, new evidence)
```bash
cat > /tmp/<topic>-phase2.md << 'EOF'
## Update — <date>
...evidence, findings, next steps...
EOF

glab issue note 42 -R "$REPO" -m "$(cat /tmp/<topic>-phase2.md)"
```
Name temp files by topic + phase: `feature-phase1.md`, `deploy-phase2.md`, `incident-close.md`.
For multi-phase work, post one comment per phase to the same issue — the thread is the chronology.

### Close (always with evidence first)
```bash
cat > /tmp/<topic>-close.md << 'EOF'
## Resolved — <date>
...evidence that the symptom is gone (command output, metric, deploy SHA)...
EOF

glab issue note 42 -R "$REPO" -m "$(cat /tmp/<topic>-close.md)" && \
  glab issue close 42 -R "$REPO"
```
Never close without an evidence comment — the next reader has no idea what changed or when.

### Update description
```bash
glab issue update 42 -R "$REPO" --description "$(cat /tmp/<topic>.md)"
```

### List open issues by label
```bash
glab issue list -R "$REPO" --label "<label>"
# Note: --state is NOT a valid glab flag — scope with --label or --search instead
```

### Reconcile loop (periodic sweep)
1. `glab issue list -R "$REPO" --label "<label>"` — get open set
2. Re-verify each against live state
3. **Resolved** → comment with evidence + close in one `&&` chain
4. **Still present** → comment with today's date + updated evidence; do NOT re-file a duplicate

---

## MR Lifecycle

### Create
```bash
REPO=$(git remote get-url origin | sed 's|.*gitlab\.com[/:]||; s|\.git$||')

cat > /tmp/mr_body.md << 'EOF'
## What
...

## Why
...

## Test plan
...
EOF

glab mr create -R "$REPO" \
  --source-branch <branch> \
  --target-branch main \
  --title "<conventional-commit-title>" \
  --description "$(cat /tmp/mr_body.md)"
# → prints the MR number, e.g. !15
```

**Title format — conventional commits:**
```
<type>(<scope>): <imperative verb phrase>
```
Types: `feat`, `fix`, `perf`, `refactor`, `ci`, `docs`, `chore`
- No trailing period. Scope in parens. Imperative mood.
- Examples:
  - `fix(auth): wire session refresh to extend TTL on activity`
  - `perf(publisher): cut Kafka publish p99 with acks=1 and snappy compression`
  - `ci: migrate to build machine with socket binding and layer cache`

### Comment on an MR (cross-reference, status note)
```bash
glab mr note 15 -R "$REPO" --message "Tracking issue: group/other-repo#42"
```

### Draft → ready
```bash
glab mr update 15 -R "$REPO" --ready
```

### Merge (one shot, squash + branch cleanup)
```bash
glab mr merge 15 -R "$REPO" --yes --remove-source-branch | tail -10
```
`--yes` skips the confirmation prompt. `--remove-source-branch` keeps the branch list clean. `tail -10` cuts the noisy preamble — you only need the trailing status.

---

## Pipeline Validation

Run after every `git push` on an MR branch — don't move forward until it's green:
```bash
REPO=$(git remote get-url origin | sed 's|.*gitlab\.com[/:]||; s|\.git$||')
glab ci status -R "$REPO"
```

For deeper inspection:
```bash
glab ci view  -R "$REPO"   # interactive pipeline view
glab ci trace -R "$REPO"   # tail job logs live
```

---

## Cross-Repo Issue Management

Use when work in one repo creates a dependency or tracking need in another.

**The rule:** file the issue in the repo that *owns the responsibility*, then cross-link in both directions.

### Pattern: frontend issue caused by a backend gap
```bash
# 1. Create the issue in the backend repo (it owns the fix)
glab issue create -R group/backend-repo \
  --title "feat(auth): add refresh-token endpoint" \
  --description "$(cat /tmp/refresh-endpoint.md)" \
  --label "improvement"
# → e.g. backend-repo#87

# 2. Cross-link from the originating frontend issue
glab issue note 15 -R group/frontend-repo \
  -m "Tracking issue filed in backend: group/backend-repo#87"

# 3. Back-reference on the backend issue
glab issue note 87 -R group/backend-repo \
  -m "Reported via frontend issue group/frontend-repo#15"
```

### Pattern: service issue blocked by an infra gap
```bash
# 1. Create the infra issue in the infra/ops repo
glab issue create -R group/infra-repo \
  --title "feat(ingress): add rate-limit annotation for auth routes" \
  --description "$(cat /tmp/infra-ratelimit.md)" \
  --label "improvement"
# → e.g. infra-repo#31

# 2. Note the blocker on the service issue
glab issue note 56 -R group/service-repo \
  -m "Blocked by infra change: group/infra-repo#31"
```

When the responsible repo isn't obvious, ask before filing — a wrong-repo issue is harder to find and frustrating to move later.
