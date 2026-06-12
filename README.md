# skills

Personal cross-agent skill collection — installable into Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI, Cursor, and any other agent supporting the [Agent Skills spec](https://agentskills.io/specification).

## Skills

<!-- skills:start -->
<!-- skills:end -->

## Installation

### Claude Code (native marketplace)

```
/plugin marketplace add alkimake/skills
/plugin install ake-skills@ake-skills        # everything
/plugin install release@ake-skills           # one skill
```

### Any agent (cross-agent installer)

```bash
npx skills add alkimake/skills                       # interactive picker
npx skills add alkimake/skills --skill release       # one skill
npx skills add alkimake/skills -a codex -a cursor    # target specific agents
```

### Gemini CLI

```bash
gemini skills install https://github.com/alkimake/skills
```

### Manual (any agent)

Copy a skill directory into your agent's skill path, e.g.:

```bash
cp -r skills/release ~/.agents/skills/        # cross-agent convention
cp -r skills/release ~/.claude/skills/        # Claude Code native
```

For local development of this repo, symlink instead of copying:

```bash
ln -s "$PWD"/skills/release ~/.claude/skills/release
```

## Adding a new skill

```bash
mkdir skills/my-skill
# write skills/my-skill/SKILL.md with name + description frontmatter
node scripts/generate-manifests.mjs
```

The generator validates frontmatter against the Agent Skills spec and regenerates `.claude-plugin/marketplace.json` plus the skill table above. CI fails if you forget to run it.

## Skill format

Each skill is a directory under `skills/` with a `SKILL.md`:

```markdown
---
name: my-skill            # must match the directory name
description: >
  Use when [specific triggering conditions].
  Triggers on: [phrases users might say].
---

# My Skill

Instructions the agent follows when this skill is invoked.
```

Rules enforced by the generator: `name` is lowercase alphanumeric with single hyphens (max 64 chars) and matches the directory; `description` is required (max 1024 chars).

## Versioning

`VERSION` at the repo root is the single version source, stamped into all marketplace plugin entries. Cut releases with the `/release` skill (bumps `VERSION`, regenerates manifests, commits, tags).

## Related

- [obra/superpowers](https://github.com/obra/superpowers) — upstream superpowers skills this collection extends
- [agentskills.io/specification](https://agentskills.io/specification) — skill format specification
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — the `npx skills` cross-agent installer
