---
name: release
description: >
  Automate semantic versioning releases: pull latest code, detect changes since the last semver tag,
  generate a human-readable CHANGELOG.md, bump the version, update version in package.json and
  similar files, commit, and tag. Supports pre-release versions (alpha, beta, rc).
  Use this skill whenever the user wants to cut a release, tag a version, create a changelog,
  bump a version number, prepare a release, or says things like "release", "new version",
  "tag a release", "cut a release", "prepare release", "publish version", "changelog",
  "pre-release", "release candidate", "beta release", "alpha release".
  Also triggers for "what changed since last release" if followed by intent to release.
---

# Release Skill

Automates the full release flow for any git repository: pull, changelog generation, version bump, version file updates, commit, and tag. Supports stable and pre-release versions.

## Overview

This skill walks through a structured release process interactively. Every destructive or
externally-visible step requires user confirmation. The goal is to produce a clean release
commit containing CHANGELOG.md updates and version file bumps, tagged with the new semantic version.

## Step-by-step workflow

### 1. Detect repository setup

Before doing anything, gather context about the repo:

```bash
# Detect the default/main branch
git remote show origin | grep 'HEAD branch' | awk '{print $NF}'

# Current branch
git branch --show-current

# Check for dirty working tree
git status --porcelain
```

Detect the following:

- **Main branch**: auto-detect from `origin HEAD branch` (usually `main` or `master` or `develop`).
- **Tag prefix**: inspect existing tags to detect whether the repo uses `v1.2.3` or `1.2.3` style.
- **Monorepo detection**: look for multiple sub-projects by checking for directories that contain their own `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, or `CHANGELOG.md`. Common monorepo patterns include `packages/*/package.json`, `apps/*/package.json`, `services/*/`, or a root with clearly separate project directories.
- **Version files**: find files that contain version numbers to update (see Step 7).

If the working directory has uncommitted changes, **warn the user and stop** — a release should happen on a clean working tree.

Tell the user what you detected and confirm before proceeding.

### 2. Pull latest code and tags

```bash
git fetch origin --tags
git pull origin <current-branch>
```

If the current branch is not the main branch, ask the user:
> "You're on `<current-branch>`. Should I merge it into `<main-branch>` for the release, or release from this branch?"

If they confirm the merge:
```bash
git checkout <main-branch>
git pull origin <main-branch>
git merge <current-branch>
```

If there are merge conflicts, stop and tell the user — do not attempt to auto-resolve.

### 3. Find the latest semantic version tag

```bash
git tag --list --sort=-version:refname
```

Filter to only semantic version tags (with or without `v` prefix). Valid patterns:
- Stable: `v1.2.3` or `1.2.3`
- Pre-release: `v1.2.3-alpha.1`, `v1.2.3-beta.2`, `v1.2.3-rc.1`

Ignore tags that don't match semver (like `release-candidate`, `deploy-prod-2024`, etc.).

**Pre-release awareness**: When identifying the "latest" tag, understand the semver precedence:
- `1.0.0-alpha.1` < `1.0.0-beta.1` < `1.0.0-rc.1` < `1.0.0` (stable)
- A pre-release version has lower precedence than its associated stable version

If no semver tags exist, treat this as the first release (`0.0.0` → `0.1.0`).

### 4. Get the diff since last tag

```bash
git log <latest-tag>..HEAD --oneline --no-merges
```

Also get the detailed diff to understand the scope of changes:
```bash
git diff <latest-tag>..HEAD --stat
```

For monorepos, group commits by which sub-project they affect based on file paths changed:
```bash
git log <latest-tag>..HEAD --oneline --no-merges -- <sub-project-path>/
```

### 5. Determine version bump

First, ask the user what type of release they want:

> "What type of release is this?"
> - **Stable** (e.g., `1.2.0`)
> - **Pre-release** — alpha, beta, or release candidate (e.g., `1.2.0-rc.1`)

#### Pre-release version logic

When the user chooses a pre-release:

| Current tag | User wants | Next version |
|---|---|---|
| `v1.2.3` (stable) | alpha for next minor | `v1.3.0-alpha.1` |
| `v1.3.0-alpha.1` | another alpha | `v1.3.0-alpha.2` |
| `v1.3.0-alpha.3` | promote to beta | `v1.3.0-beta.1` |
| `v1.3.0-beta.2` | promote to rc | `v1.3.0-rc.1` |
| `v1.3.0-rc.1` | promote to stable | `v1.3.0` |

When promoting from pre-release to stable, the version number stays the same — only the pre-release suffix is removed.

#### Stable version logic

Analyze the commit messages to suggest a version bump:

| Signal | Bump | Examples |
|--------|------|----------|
| `BREAKING CHANGE` in body, `!` after type (e.g. `feat!:`) | **major** | API removal, incompatible schema change |
| `feat`, `feature`, new capability | **minor** | New endpoint, new UI feature, new command |
| `fix`, `patch`, `perf`, `refactor`, `docs`, `chore`, `style`, `test`, `ci`, `build` | **patch** | Bug fix, performance tweak, documentation |

If commits contain mixed signals, the highest bump wins (major > minor > patch).

Present the suggestion to the user:
> "Based on the changes, I suggest bumping from `v1.2.3` → `v1.3.0` (minor — new features detected). Does this look right, or would you prefer a different bump?"

Wait for confirmation. The user may override.

### 6. Generate CHANGELOG entry

Write a changelog entry following the [Keep a Changelog](https://keepachangelog.com) format, rewritten for **end-users, not developers**. This changelog may be displayed directly in the application UI, so clarity and readability matter.

**Rewriting rules:**
- Translate developer-speak into user-visible impact:
  - `feat(auth): add JWT refresh token rotation` → "Your login sessions now stay active more reliably"
  - `fix(dashboard): prevent widget overlap on resize` → "Fixed dashboard widgets overlapping when resizing the window"
  - `perf(api): add Redis caching for /prices endpoint` → "Faster price loading times"
- Group related changes meaningfully — don't just mirror conventional commit types
- Omit purely internal changes (`chore`, `ci`, `test`, `refactor`) unless they have user-visible impact
- Use past tense ("Added", "Fixed", "Improved")
- Keep descriptions concise — one line per change, no jargon

**Changelog format (Keep a Changelog):**

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-04-06

### Added
- New feature description visible to users

### Changed
- Improvement or behavior change description

### Fixed
- Bug fix description

### Removed
- Removed feature or capability (if any)
```

**Section rules:**
- Only include sections that have entries
- **Added** — new features or capabilities
- **Changed** — improvements, behavior changes, UI updates
- **Fixed** — bug fixes
- **Deprecated** — features that will be removed in a future release
- **Removed** — features that were removed
- **Security** — security-related fixes (always include these — users care about security)

**For pre-release versions**, mark the entry clearly:
```markdown
## [1.3.0-rc.1] - 2026-04-06
```

**For monorepos**, follow the existing repo convention:
- If sub-projects have their own `CHANGELOG.md`, update each one with only its relevant changes
- If there's a single root `CHANGELOG.md`, add a section header per project:
  ```markdown
  ## [1.3.0] - 2026-04-06

  ### UI
  #### Added
  - ...

  ### API
  #### Fixed
  - ...
  ```

**Prepend** the new entry at the top of the existing CHANGELOG.md (below the header). Never overwrite existing entries.

**Present the draft to the user and wait for approval.** They may want to reword entries, add context, or remove items. Iterate until they're satisfied.

### 7. Update version files

After the changelog is approved, find and update version numbers in project files. Search for these common locations:

| File | Field | Example |
|---|---|---|
| `VERSION` | bare semver string | `1.3.0` (keep trailing newline) |
| `package.json` | `"version"` | `"version": "1.3.0"` |
| `package-lock.json` | `"version"` (root) | `"version": "1.3.0"` |
| `Cargo.toml` | `version` | `version = "1.3.0"` |
| `pyproject.toml` | `version` | `version = "1.3.0"` |
| `version.go` / `version.ts` / `version.py` | version constant | `const VERSION = "1.3.0"` |
| `build.gradle` / `build.gradle.kts` | `version` | `version = "1.3.0"` |
| `pom.xml` | `<version>` | `<version>1.3.0</version>` |
| `*.csproj` | `<Version>` | `<Version>1.3.0</Version>` |

For monorepos, update each sub-project's version files independently.

**Show the user which files will be updated and with what version before making changes.** Example:
> "I'll update the version to `1.3.0` in these files:
> - `ui/package.json` (currently `1.2.3`)
> - `ui/package-lock.json` (currently `1.2.3`)
>
> Proceed?"

For `package-lock.json`, prefer running `npm install --package-lock-only` after updating `package.json` rather than editing it directly — this ensures the lockfile stays consistent.

**Important**: Only update version fields that already exist and are clearly the project's own version. Do not modify dependency version numbers.

### 8. Commit the release

Once the user approves all changes:

```bash
git add CHANGELOG.md <version-files...>
git commit -m "chore(release): vX.Y.Z"
```

Only stage CHANGELOG.md and version files — nothing else should be in this commit. Verify with `git diff --cached --name-only` before committing and show the user.

If the repo generates artifacts from the version (e.g. a manifest generator wired into CI — check the repo's CI config or CLAUDE.md), run the generator after bumping and include its outputs in the release commit; otherwise CI drift checks will fail on the release commit.

### 9. Tag the release

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

Use the same prefix convention (with or without `v`) as existing tags in the repo.

For pre-release tags:
```bash
git tag -a v1.3.0-rc.1 -m "Release v1.3.0-rc.1"
```

### 10. Offer to push

Ask the user:
> "Release `vX.Y.Z` is ready locally. Want me to push the commit and tag to origin?"

If yes:
```bash
git push origin <branch>
git push origin vX.Y.Z
```

If no, remind them:
> "When you're ready, run: `git push origin <branch> && git push origin vX.Y.Z`"

### 11. Summary

After completion, show a clear summary:

```
Release complete:
  Version:   v1.3.0
  Tag:       v1.3.0
  Branch:    main
  Commit:    abc1234
  Files:     CHANGELOG.md, ui/package.json, ui/package-lock.json
  Pushed:    yes/no
```

## Important safety notes

- **Never force-push.** If a push is rejected, stop and tell the user.
- **Never auto-resolve merge conflicts.** Surface them and let the user handle it.
- **Always confirm before**: merging branches, committing, tagging, and pushing.
- **Only modify**: CHANGELOG.md files and version files in the release commit.
- If the working directory has uncommitted changes, warn the user and stop.
- When updating `package-lock.json`, use `npm install --package-lock-only` instead of editing directly.

## Edge cases

- **No commits since last tag**: Tell the user there's nothing to release.
- **No existing tags**: Treat as first release, suggest `v0.1.0` and ask user to confirm.
- **Pre-release to pre-release**: Increment the pre-release number (e.g., `alpha.1` → `alpha.2`).
- **Pre-release to stable**: Drop the pre-release suffix, keep the version (e.g., `1.3.0-rc.1` → `1.3.0`).
- **Stable to pre-release**: Bump the target version first, then add suffix (e.g., `1.2.3` → `1.3.0-alpha.1`).
- **Detached HEAD**: Warn the user and ask them to checkout a branch first.
- **Multiple pre-release tracks**: If tags show both `-alpha` and `-beta` for the same version, use the highest one as the latest.
- **Monorepo with independent versions**: Each sub-project may have different version numbers. Track and bump them independently. Ask the user which sub-projects to include in this release.
