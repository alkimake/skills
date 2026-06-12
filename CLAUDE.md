# Skills Collection

This project is a personal library of cross-agent skills (Claude Code, Codex CLI, Gemini CLI, and other Agent Skills spec adopters). Each skill is a self-contained directory with a `SKILL.md` file defining how Claude should behave when the skill is invoked.

## Structure

```
skills/
  <skill-name>/
    SKILL.md        # skill definition (frontmatter + instructions)
.claude-plugin/
  marketplace.json  # GENERATED — never edit by hand
scripts/
  generate-manifests.mjs        # regenerates marketplace.json + README table
  generate-manifests.test.mjs   # node:test suite for the generator
docs/
  superpowers/      # design specs and implementation plans
VERSION             # single version source, bumped by /release
```

## Skill format

Each `SKILL.md` uses YAML frontmatter followed by markdown instructions:

```markdown
---
name: skill-name
description: >
  One or more lines describing when this skill triggers.
  Include trigger phrases users might say.
---

# Skill Name

Instructions for Claude to follow when this skill is invoked.
```

## Working in this project

- When adding a new skill, create a new directory under `skills/` with a `SKILL.md` inside it.
- When editing a skill, read the existing `SKILL.md` first to understand its current behavior before modifying.
- The `skills/release/` skill automates semantic versioning — use `/release` to cut a release of any repo.
- The `.memsearch/` directory is managed automatically — do not edit it manually.
- After adding or editing a skill's frontmatter, run `node scripts/generate-manifests.mjs` — CI fails on manifest drift.
- `.claude-plugin/marketplace.json` and the README skill table are generated; edit `SKILL.md` frontmatter instead.
- When cutting a release here: bump `VERSION`, run the generator, and include `.claude-plugin/marketplace.json` + `README.md` in the release commit.
