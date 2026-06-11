# Skills Collection

This project is a personal library of Claude Code skills. Each skill is a self-contained directory with a `SKILL.md` file defining how Claude should behave when the skill is invoked.

## Structure

```
skills/
  <skill-name>/
    SKILL.md        # skill definition (frontmatter + instructions)
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

- When adding a new skill, create a new directory and `SKILL.md` inside it.
- When editing a skill, read the existing `SKILL.md` first to understand its current behavior before modifying.
- The `release/` skill automates semantic versioning — use `/release` to cut a release of any repo.
- The `.memsearch/` directory is managed automatically — do not edit it manually.
