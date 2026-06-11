# skills

Personal Claude Code skills collection.

Skills are self-contained instruction sets that extend Claude Code's behavior when invoked with `/skill-name`. Each one lives in its own directory with a `SKILL.md` that defines when and how it activates.

---

## Installation

Clone the repo and symlink each skill you want into `~/.claude/skills/`:

```bash
git clone git@github.com:alkimake/skills.git ~/Projects/ai/skills
ln -s ~/Projects/ai/skills/subagent-driven-development ~/.claude/skills/subagent-driven-development
```

After symlinking, the skill appears in Claude Code's available skill list immediately — no restart needed.

To install all skills at once:

```bash
for dir in ~/Projects/ai/skills/*/; do
  name=$(basename "$dir")
  ln -sf "$dir" ~/.claude/skills/"$name"
done
```

---

## Skills

### `subagent-driven-development`

Extends [`superpowers:subagent-driven-development`](https://github.com/obra/superpowers) with a **Codex CLI backend** for implementation tasks.

By default the upstream skill dispatches a Claude subagent per task. This skill adds an alternative: when you mention Codex or an OpenAI model, implementation tasks are delegated to `codex exec` instead. Spec compliance and code quality reviews always stay on Claude.

**Trigger phrases:** "use codex for this", "delegate to codex", "codex agents", or any OpenAI model name.

**What it does differently:**

| Step | Upstream | This skill (Codex mode) |
|---|---|---|
| Implementer | Claude subagent via `Agent` tool | `codex exec` via `Bash` |
| Model selection | haiku / sonnet / opus | fetched live from `codex debug models` |
| Output capture | subagent return value | `mktemp -t codex.XXXXXX` file via `-o` |
| Status parsing | subagent return value | `grep -oE 'DONE_WITH_CONCERNS\|DONE\|...'` |
| Reviews | Claude subagent | Claude subagent (unchanged) |

**Requirements:**
- `codex` CLI installed: `npm install -g @openai/codex`
- `OPENAI_API_KEY` set in your environment
- Working directory must be a git repo

**Testing:** See [`subagent-driven-development/TEST.md`](subagent-driven-development/TEST.md) for a ready-made test prompt.

---

### `release`

Automates semantic versioning releases: detects changes since the last tag, generates a `CHANGELOG.md`, bumps the version, commits, and tags. Supports stable and pre-release versions (alpha, beta, rc).

**Trigger phrases:** "release", "cut a release", "tag a version", "bump version", "changelog".

---

## Skill format

Each skill is a directory with a `SKILL.md` using YAML frontmatter:

```
skills/
  my-skill/
    SKILL.md        # required
    supporting.*    # optional: templates, reference docs, scripts
```

```markdown
---
name: my-skill
description: >
  Use when [specific triggering conditions].
  Triggers on: [phrases users might say].
---

# My Skill

Instructions Claude follows when this skill is invoked.
```

**Key rules:**
- `description` should describe *when* to use it, not *what* it does — Claude reads this to decide whether to load the skill
- `name` uses letters, numbers, and hyphens only
- Keep the description under 500 characters

---

## Adding a new skill

```bash
mkdir ~/Projects/ai/skills/my-skill
# write SKILL.md
ln -s ~/Projects/ai/skills/my-skill ~/.claude/skills/my-skill
```

Then invoke it with `/my-skill` in any Claude Code session.

---

## Related

- [obra/superpowers](https://github.com/obra/superpowers) — upstream superpowers skills this collection extends
- [agentskills.io/specification](https://agentskills.io/specification) — skill format specification
