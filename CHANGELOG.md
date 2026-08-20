# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-20

### Added
- Initial skill collection: `glab-workflow` (GitLab issue/MR/pipeline workflows), `release` (semantic versioning releases), `subagent-driven-development` (implementation plan execution with a Codex CLI backend option), and `unslop` (removes tells of AI-generated writing).
- Native Claude Code marketplace — install everything or one skill with `/plugin marketplace add` and `/plugin install`.
- Native Codex CLI marketplace support, generated from the same skill definitions.
- Native Kimi Code marketplace support, generated from the same skill definitions.
- Cross-agent installer (`npx skills`) and Gemini CLI install instructions.
- Auto-generated README skill table and marketplace manifests, kept in sync with each skill's definition and enforced by CI.
