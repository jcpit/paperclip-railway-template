# Template Changelog

## 2026-10-23

- Changed: deploy the official Paperclip image for upstream development commit `c5ca29dbeff50558c40984fbc03b90cfd4749ae2`, pinned to multi-platform digest `sha256:bd48b47f5ffc9b4d37c2e373b224eb5ad4c6f87c8285635c657b877bcd6fc508`. This includes experimental OpenAI Dot support, which is absent from the latest stable `v2026.1012.0` release. It is not automatic tracking of an unstable channel.
- Changed: inherit upstream's Node ≥24.11 runtime, built Rust Runner, provider pack and bundled agent tools rather than rebuilding Paperclip with Node 22 and no Rust toolchain. The wrapper launches the upstream runtime bundle with Node. Retained the setup page, capability-dropping entrypoint, persistent home, and tini orphan reaping.
- Breaking: `PAPERCLIP_IMAGE` replaces `PAPERCLIP_REF` / `PAPERCLIP_REPO` source-build overrides. Remove legacy variables before rebuilding; a non-empty `PAPERCLIP_REF` fails explicitly. The bump helper now resolves a published commit-tagged image and verifies its multi-platform manifest digest; public access no longer requires a GitHub token.
- Docs: added Dot pairing, experimental settings, HTTPS/event requirements and disabled-by-default workspace guidance. Documented image disk requirements and the significant migration/lock-protocol jump: back up database and volume, stop all old writers before starting the new build, and do not rely on image-only rollback. No live Railway upgrade or real Dot pairing has been qualified here.
- Tests: added offline coverage for image resolution, digest/platform validation, credential separation, updater safety, and the packaged-runtime deployment contract.

## 2026-09-23

- Docs: documented `PAPERCLIP_OPENCODE_PROVIDERS` (custom OpenCode providers/models as JSON, with `{env:VAR}` placeholder expansion), `PAPERCLIP_OPENCODE_SMALL_MODEL`, and `PAPERCLIP_OPENCODE_PRINT_LOGS` — these are the actual mechanism `opencode_local` reads for "add another model/platform," none of which were previously documented (#13). Also documented that persistent OpenCode logins (`opencode auth login` over `railway ssh`) land in `/paperclip/.config/opencode`, on the volume, and survive redeploys.
- Fixed: pinned the AI adapter/tooling versions (`@anthropic-ai/claude-code`, `@openai/codex`, `opencode-ai`, `@google/gemini-cli`, `tsx`) instead of installing `@latest` at build time. Railway rebuilds this image on every deploy, so an unpinned upstream release could silently break new deployments; versions here now only change when this file does. Current pins: `claude-code@2.1.280`, `codex@0.156.1`, `opencode-ai@1.18.32`, `gemini-cli@0.60.0`, `tsx@4.23.15`.

## 2026-09-05

- Fixed: no init process in the container. The entrypoint ends in `exec`, so node ran as PID 1 and never reaped the orphaned `git`/`claude`/`esbuild` descendants that agent runs leave behind; they accumulated as zombies until the cgroup pid limit was reached and every `fork()` failed. `tini` is now PID 1, matching the upstream Paperclip production image.
- Added: Claude agents can authenticate with a Claude subscription instead of `ANTHROPIC_API_KEY`. Set `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) as a service variable, or run `claude login` in the container over `railway ssh` — that writes to `/paperclip/.claude`, which is on the volume. `/setup` now reports the actual Claude auth mode instead of only checking for an API key, and flags an API key set alongside subscription credentials.

## 2026-08-02

- Changed: Paperclip pin `v2026.416.0` → `v2026.722.0` (latest stable at bump time; routine upstream uptake across ~3 months of releases). **Upgrade note:** upstream releases in this range add many additive DB migrations (including Connections v3 / MCP gateway foundations); they run automatically on startup. Existing instances that set a static `PAPERCLIP_API_KEY` to override the harness run token should stop — that override no longer applies (see [v2026.722.0 upgrade guide](https://github.com/paperclipai/paperclip/releases/tag/v2026.722.0)).
- Changed: Runtime image parity with upstream production Dockerfile — install `@google/gemini-cli` and set `GEMINI_SANDBOX=false` (alongside existing OpenCode / Codex / Claude tooling).

## 2026-04-17

- Fixed: WebSocket proxy upstream errors no longer crash the Node process (#6, duplicate #7) — `http-proxy` can pass a socket on WS failures, which has no `writeHead`; the wrapper now sends JSON 503 only for HTTP responses and destroys the socket otherwise.
- Changed: Paperclip pin `v2026.325.0` → `v2026.416.0` (latest stable at bump time; routine upstream uptake). **Upgrade note:** upstream v2026.416.0 adds migrations including `pg_trgm`; embedded Postgres in this template should allow `CREATE EXTENSION`, but external DB users may need DBA to run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` before upgrade — see [paperclip v2026.416.0 release notes](https://github.com/paperclipai/paperclip/releases/tag/v2026.416.0).
- Changed: Runtime image aligned with [upstream Paperclip production Dockerfile](https://github.com/paperclipai/paperclip/blob/master/Dockerfile) — `HOME=/paperclip`, `PAPERCLIP_INSTANCE_ID`, `PAPERCLIP_CONFIG`, `OPENCODE_ALLOW_ALL_MODELS=true`, and apt packages `git`, `openssh-client`, `jq`, `ripgrep` (agent/git tooling parity).

## 2026-04-02

- Fixed: Claude Code adapter fails with `--dangerously-skip-permissions cannot be used with root/sudo privileges` (#4)
  - Set `CLAUDE_CODE_BUBBLEWRAP=1` in Dockerfile — tells Claude Code it is running inside a container sandbox, bypassing the redundant root check while Docker's own isolation remains active
  - Replaced `gosu` with `setpriv --inh-caps=-all` in entrypoint to properly drop inherited Linux capabilities
  - Removed `gosu` package from Dockerfile (no longer needed; `setpriv` is part of the base image)
