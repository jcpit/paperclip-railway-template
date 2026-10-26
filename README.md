# Paperclip Railway Template

One-click deploy of [Paperclip](https://github.com/paperclipai/paperclip) on [Railway](https://railway.com)—no SSH, no scraping logs. You get an app + Postgres + a **setup page** where you generate your first admin invite in one click.

## What you get

- **Paperclip** — the app, native Rust Runner, and agent tools from a digest-pinned official upstream image.
- **Postgres** — a Railway Postgres service; the app uses it for auth and data.
- **Setup UI** at `/setup` — a small page that lets you **generate your first admin invite URL** so you can create the initial admin account. No CLI, no config files.

After you create that admin, you use Paperclip at `/` as usual (login, agents, etc.).

### Current version and OpenAI Dots

This template pins upstream development commit [`c5ca29d`](https://github.com/paperclipai/paperclip/commit/c5ca29dbeff50558c40984fbc03b90cfd4749ae2) (23 October 2026), the latest upstream commit checked when updating this template. It includes **experimental OpenAI Dot support**. The latest stable release at that time, `v2026.1012.0`, does **not** include Dot, so this is deliberately a development build, not a stable-release upgrade. The Dockerfile pins the full image digest; it does not automatically track `master` or `latest`.

For an existing deployment, read [Upgrading an existing instance](#upgrading-an-existing-instance) before rebuilding: this is a large database migration jump from the old `v2026.722.0` default.

## Deploy

1. Click the button below (or use the template URL). Railway will create a new project from this template.
2. In the template editor, **leave the suggested env vars as-is** (see [Required variables](#required-variables) if you need to edit them).
3. Ensure the **Paperclip** service has:
   - **HTTP proxy** on port `3100`
   - **Healthcheck path** `/setup/healthz`
   - A **volume** mounted at `/paperclip` (for app data)
4. Deploy. Once the service is live, open your app URL and go to **`/setup`**.

**Railway plan:** this Dot-capable upstream image exceeds 4 GB. It requires **Hobby or higher** under Railway's current [image-size limits](https://docs.railway.com/pricing/plans#default-plan-resources); Trial and Free allow only 4 GB images.

**Template URL:**

```
https://railway.com/deploy/KJZc89?referralCode=uXzB-u&utm_medium=integration&utm_source=template&utm_campaign=paperclip
```

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/KJZc89?referralCode=uXzB-u&utm_medium=integration&utm_source=template&utm_campaign=paperclip)

## What to do after deploy

1. Open your app’s public URL (e.g. `https://your-app.up.railway.app`).
2. Go to **`/setup`** (e.g. `https://your-app.up.railway.app/setup`).
3. (Optional) If you want AI agents immediately, complete Step 1 on setup:
   - for Claude Code, set `CLAUDE_CODE_OAUTH_TOKEN` in Railway variables — see [Claude agents on your subscription](#claude-agents-on-your-subscription). No Anthropic API key needed.
   - for Codex, set `OPENAI_API_KEY` in Railway variables and run Codex login from setup
4. Click **“Generate admin invite URL”**. The page will show a one-time invite link.
5. Open that link in your browser and complete sign-up. That account is the first admin.
6. From then on, use the app at **`/`** — log in with that admin (or with users you invite later).

You only need the setup page once to bootstrap the first admin. Don’t share `/setup` publicly if you don’t want others generating invite links.

## Required variables

Set these on the **Paperclip** service in Railway (template editor or service Variables). The template may prefill some; adjust if your setup differs.

| Variable | What to set | Why |
|----------|-------------|-----|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Links Paperclip to the Postgres service. Use the Postgres reference variable so Railway injects the URL. |
| `BETTER_AUTH_SECRET` | e.g. `${{secret(64, "abcdef0123456789")}}` or a long random string | Secret for auth cookies/sessions. Must be at least 32 characters. |
| `HOST` | `0.0.0.0` | Bind inside the container so Railway’s proxy can reach the app. |
| `PORT` | `3100` | Port the app listens on (must match the proxy). |
| `SERVE_UI` | `true` | Serve the web UI. |
| `PAPERCLIP_HOME` | `/paperclip` | Data directory; must match the volume mount path. |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` | Require login (recommended). |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `private` | Treat the app as private (recommended). |
| `PAPERCLIP_PUBLIC_URL` | `https://${{Paperclip.RAILWAY_PUBLIC_DOMAIN}}` | Public URL of the app (no trailing slash). Railway’s public domain for this service. |
| `BETTER_AUTH_BASE_URL` | `https://${{Paperclip.RAILWAY_PUBLIC_DOMAIN}}` | Same as above; auth callbacks use this. |

Optional (for AI agents):

- **`CLAUDE_CODE_OAUTH_TOKEN`** — Recommended for Claude agents. A long-lived subscription token that lets the `claude_local` adapter bill against your Claude subscription instead of an API key. See [Claude agents on your subscription](#claude-agents-on-your-subscription).

- **`ANTHROPIC_API_KEY`** — Alternative Claude auth using API billing. **Mutually exclusive with `CLAUDE_CODE_OAUTH_TOKEN`** — leave it unset if you want subscription auth.

- **`OPENAI_API_KEY`** — If set, the wrapper runs Codex login at startup so agents using the Codex adapter work. You can also run Codex login from the setup page. Without it, the app and dashboard work; agents that use Codex will fail until the key is set and login is run. Also used by OpenCode when you add OpenAI-compatible providers.

- **`GEMINI_API_KEY`** — Optional; used by Gemini CLI / Gemini-backed agents.

### Claude agents on your subscription

The `claude_local` adapter can authenticate with your Claude Code subscription, so this template needs **no Anthropic API key at all**.

**1. Mint a subscription token.** On any machine already signed in to Claude Code:

```bash
claude setup-token
```

You can also do this inside the deployed container — `railway ssh`, then run the same command. The image sets `HOME=/paperclip`, which is the mounted volume.

**2. Set it in Railway.** Add a service variable on the **Paperclip** service:

```
CLAUDE_CODE_OAUTH_TOKEN=<the token printed above>
```

Redeploy. `/setup` will show **“Claude: subscription token set”**, and a `claude_local` agent’s **Test Environment** will report `claude_oauth_token_configured`.

**Leave `ANTHROPIC_API_KEY` unset.** An API key takes precedence over subscription credentials in the Claude CLI, and from Paperclip `v2026.824.0` on, a stored subscription binding together with a non-empty `ANTHROPIC_API_KEY` is rejected as `CLAUDE_OAUTH_CREDENTIAL_CONFLICT`.

**Alternative — sign in on the volume.** Instead of a token variable you can log in inside the container:

```bash
railway ssh
claude login
```

Credentials land in `/paperclip/.claude/.credentials.json`, which is on the Railway volume, so the login survives redeploys. `/setup` reports this as **“Claude: signed in on this container”**.

**Note on Paperclip’s own in-app Claude sign-in.** Upstream added a “Sign in to Claude” button to the new-agent page in `v2026.824.0`. It drives `claude setup-token` through a pseudo-terminal inside a *sandbox* execution target and is hard-gated on one — a `local` or `ssh` environment is rejected. This template runs a single container with no sandbox provider, so that button does not appear here. The two methods above are the supported paths.

### OpenCode on this template

OpenCode is already installed in the image (`opencode-ai`) and `OPENCODE_ALLOW_ALL_MODELS=true` is set. To use it:

1. Hire / configure an **OpenCode** (`opencode_local`) agent in the Paperclip UI.
2. Provide provider credentials the same way you would for other adapters — typically Railway service variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or other keys OpenCode’s providers need.
3. Extra models/platforms are configured through OpenCode’s own config under `PAPERCLIP_HOME` (the `/paperclip` volume), not through a separate OpenCode service. You do **not** need to deploy OpenCode beside this template.

If a specific provider still fails after keys are set, check that agent’s run logs in Paperclip — adapter/runtime errors usually surface there rather than on `/setup`.

#### Adding a custom provider or model (gateways, non-default models)

There's no UI for this — Paperclip's `opencode_local` adapter reads it from environment variables. Set **`PAPERCLIP_OPENCODE_PROVIDERS`** as a Railway service variable: a JSON object in OpenCode's own [`provider`](https://opencode.ai/docs/config/) config shape, e.g. for an OpenAI-compatible gateway:

```json
{"my-gateway":{"npm":"@ai-sdk/openai-compatible","options":{"baseURL":"https://gateway.example.com/v1","apiKey":"{env:MY_GATEWAY_KEY}"},"models":{"my-model":{}}}}
```

`{env:VAR}` placeholders are expanded from Railway variables server-side before the config reaches OpenCode. Reference the resulting model as `my-gateway/my-model` in the agent's model field. Since `OPENCODE_ALLOW_ALL_MODELS=true` is set, OpenCode won't refuse a model string it doesn't already know about — but a `provider/model` pair only actually resolves at run time if that provider+model exists in this JSON.

Related variables, also read straight from the environment:

- **`PAPERCLIP_OPENCODE_SMALL_MODEL`** — pins the auxiliary "small" model OpenCode uses for session titles etc. Needed if your default provider (e.g. Anthropic) is repointed at a gateway that doesn't serve OpenCode's built-in default small model — otherwise title generation fails and can abort the run.
- **`PAPERCLIP_OPENCODE_PRINT_LOGS`** — set truthy to have OpenCode's own internal logs surface on stderr in the agent's run output, for diagnosing an opaque "Unexpected server error".

#### Persistent OpenCode login (instead of env-only providers)

For providers OpenCode authenticates interactively (`opencode auth login` / `opencode providers login`) rather than via API key env vars: those credentials are read from `$HOME/.config/opencode` at run time — which, with this image's `HOME=/paperclip`, is `/paperclip/.config/opencode` on the Railway volume, so it survives redeploys. Set it up once over `railway ssh`:

```bash
railway ssh
opencode auth login
```

Each agent run copies this config out before running OpenCode, so nothing here is mutated by a run — updates only happen when you log in again.

### Connect an OpenAI Dot

Dot runs externally in OpenAI; it is not a Codex model or another CLI to install. An `OPENAI_API_KEY` and the setup page's **Run Codex login** button are not used to pair Dot.

1. Use a stable public HTTPS domain and set `PAPERCLIP_PUBLIC_URL` and `BETTER_AUTH_BASE_URL` to that origin. Keep `PAPERCLIP_DEPLOYMENT_MODE=authenticated`.
2. In **Instance settings → Experimental**, enable **Assistant connections (MCP)** and **OpenAI Dot**. The old `PAPERCLIP_ENABLE_OPENAI_DOT` environment flag is not supported. Self-hosted Dot does not require enabling the general Paperclip Runner toggle.
3. Choose **New Agent → Invite an external agent → Dot** (or the standalone **OpenAI Dot** option). Acknowledge external, unmetered provider billing and complete any required hire approval.
4. Copy the **Pair Dot / Set up with Dot** prompt into your Dot. It uses the dedicated `<your-public-origin>/mcp/runner` connection and a one-use pairing code, not the personal `/mcp/paperclip` endpoint.
5. Complete pairing and **Test event delivery**. Wait for the verified event round trip before assigning work; a connected OAuth account alone is not proof of readiness.

The wrapper forwards MCP, OAuth discovery, and pairing routes to Paperclip. No additional service or sandbox provider is needed for the documented self-hosted local-controller path. Keep optional Dot workspace/command access **disabled**: command execution needs Linux bubblewrap and private PID namespaces, which this Railway template has not qualified. Do not bypass those checks. Provider costs are not metered by Paperclip, and cancelling a task does not prove that external Dot activity stopped.

See the [upstream Dot runbook for this exact build](https://github.com/paperclipai/paperclip/blob/c5ca29dbeff50558c40984fbc03b90cfd4749ae2/doc/openai-dot-runner.md) for pairing, recovery, and limitations. A real Dot account and successful event test are still required; shipping the integration does not grant account access.

## Private SSH runner transport

The image includes Tailscale 1.104.2 for an optional private SSH runner. It is disabled by default. The existing Paperclip image pin, application command, node UID and capability drop stay in place.

Before enabling transport, create a tailnet policy that isolates `tag:paperclip-control` and `tag:paperclip-runner`, allowing only control → runner TCP22. Tailscale also permits ICMP for an allowed pair; a separately verified runner firewall must block unsolicited ICMP and other tailnet ingress while preserving necessary connection-related errors. Do not enrol devices under a wildcard allow-all policy.

Use a dedicated, short-lived, non-reusable join key tagged only `tag:paperclip-control`. Set `PAPERCLIP_TAILSCALE_ENABLED=true` and temporarily supply `PAPERCLIP_TAILSCALE_AUTHKEY` as a Railway secret. The supervisor consumes the key from a private temporary file and removes it. It strips the key from child environments and suppresses authentication responses. Remove the Railway join-key variable after successful enrolment; the private identity persists under `/paperclip/runner-tailscale` on the existing volume.

The daemon runs as the unprivileged node user with userspace networking. Its SOCKS listener binds only `127.0.0.1:1055`; it needs no TUN device or added capabilities. DNS changes, subnet routes, exit-node use/advertisement and Tailscale SSH are disabled, and the control node rejects incoming connections. Startup requires the exact control tag; initialization failure does not fall back to local agent execution.

The narrowly matched OpenSSH alias `paperclip-runner` uses `tailscale nc` through the private local socket. Configure Paperclip's supported SSH environment with that host, port22, the dedicated unprivileged runner user/key, and a console-verified pinned host key. Use `codex_local` with the CLI engine and sandbox bypass disabled. No SSH port, SOCKS proxy or Proxmox management port needs public exposure. Keep runner SSH bound only to its intended tailnet address and retain the verified endpoint firewall.

Verify the actual restricted command, subscription hello and project file reads before enabling agent work. Disabling `PAPERCLIP_TAILSCALE_ENABLED` restores the original startup path; remote SSH work will then be unavailable. Retain the prior Railway deployment for packaging rollback. This transport does not change Paperclip's upstream version or database schema.

## Networking and storage (Railway)

- **HTTP proxy:** Enable a public domain for the Paperclip service and set the port to **3100**.
- **Healthcheck:** Set path to **`/setup/healthz`**. Railway uses this to know when the app is ready.
- **Volume:** Add a volume and mount it at **`/paperclip`**. The app stores data here; without it, data is lost on redeploy.

## How this template works

- The **Dockerfile** extends a pinned official `ghcr.io/paperclipai/paperclip` image (`PAPERCLIP_IMAGE`, overridable at **build** time). Upstream supplies Node ≥24.11, the compiled UI/server, native Rust Runner and provider pack, and agent CLIs. The complete image digest pins these together; Railway does not rebuild the Rust toolchain. Persistence is provided by Railway's volume at `/paperclip`.
- At runtime, a small **wrapper server** runs: it starts Paperclip on an internal port, proxies requests to it, and serves the **setup UI** at `/setup` (and health at `/setup/healthz`). So you never need to run CLI bootstrap or read logs to get an invite link.

## Updating the upstream Paperclip version

The complete upstream image is pinned by commit and manifest digest. To resolve the current upstream `master` commit to its published multi-platform image:

```bash
node scripts/bump-paperclip-ref.mjs
```

The historical script name is retained, but it now updates `PAPERCLIP_IMAGE`, not `PAPERCLIP_REF`. It needs no credentials for public access; an already-configured `GITHUB_TOKEN` is optional for GitHub rate limits. You can supply a specific upstream commit or branch as the first argument. If the matching full-commit image has not been published yet, the script fails without changing the Dockerfile. It verifies the manifest digest and both Linux architectures; it does not test Dot functionality or migrations. Review the diff and upstream upgrade notes, then build and validate before redeploying.

### Pin a different Paperclip image (no fork)

Overriding the image is **build-time only**: set the variable, then trigger a **new build**. Use an image containing Dot support; the `2026.1012.0` stable image does not. Prefer an immutable `@sha256:…` manifest digest.

| Where | What to do |
|-------|------------|
| **Railway** | Set **`PAPERCLIP_IMAGE`** to a compatible official image reference. Railway passes service variables into the build when the Dockerfile declares matching `ARG` lines; see [Using variables at build time](https://docs.railway.com/guides/dockerfiles#using-variables-at-build-time). Remove any old **`PAPERCLIP_REF`** and **`PAPERCLIP_REPO`** overrides. A non-empty `PAPERCLIP_REF` now fails the build with migration instructions instead of being silently ignored. |
| **Local `docker build`** | `docker build -t paperclip-railway-template .` uses the pinned default. For an override, add `--build-arg PAPERCLIP_IMAGE=ghcr.io/paperclipai/paperclip@sha256:<manifest-digest>`. |

If you omit `PAPERCLIP_IMAGE`, the default in the Dockerfile is used. The upstream image is large (about 5.2 GB compressed for amd64 at this pin); allow additional space for unpacked layers and the wrapper build. Railway Trial/Free's 4 GB image limit is insufficient; use Hobby or higher. A source tag/branch is no longer a supported build argument.

### Upgrading an existing instance

1. Back up **both PostgreSQL and the `/paperclip` volume** and verify you can restore them. This update jumps from migrations through `0183` in the old default to `0374` in the pinned build; non-interactive startup can apply outstanding migrations automatically. This migration path has not been rehearsed by this template.
2. Drain active tasks and stop **every old server/worker** that writes to the volume before starting the new image. Old and new versions must not run against the same instance root at the same time, including during Railway's deployment overlap. Arrange a stopped-old/start-new upgrade rather than a rolling deployment for this transition.
3. Follow the upstream [workspace restore-lock upgrade notes](https://github.com/paperclipai/paperclip/blob/c5ca29dbeff50558c40984fbc03b90cfd4749ae2/doc/workspace-restore-locks.md) for any legacy directory locks. Never remove the new `.lock.sqlite` files. Review custom tool grants, whose restrictions are now enforced more strictly.
4. Remove legacy build overrides, rebuild, and check Paperclip's own `/api/health`, sign-in, existing data, and a harmless agent task. `/setup/healthz` reports wrapper availability separately from `paperclipReady`; its HTTP 200 alone is not an application smoke test. Enable Dot and complete pairing/event delivery only after those checks pass.
5. For rollback, stop all new writers first and use a compatible **database + volume backup**. Do not assume switching the image back reverses applied migrations or the lock protocol.

## Local test (developers)

From the repo root, after building the image:

```bash
docker network create paperclip_net
docker run --rm -d --name paperclip_pg --network paperclip_net \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=paperclip \
  postgres:16
# Wait a few seconds for Postgres to be ready, then:
docker run --rm -d --name paperclip_app --network paperclip_net -p 3100:3100 \
  -e DATABASE_URL=postgresql://postgres:postgres@paperclip_pg:5432/paperclip \
  -e HOST=0.0.0.0 -e PORT=3100 -e SERVE_UI=true \
  -e PAPERCLIP_HOME=/paperclip \
  -e PAPERCLIP_DEPLOYMENT_MODE=authenticated -e PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  -e PAPERCLIP_PUBLIC_URL=http://localhost:3100 -e BETTER_AUTH_BASE_URL=http://localhost:3100 \
  -e BETTER_AUTH_SECRET=local-dev-secret-32chars-min \
  -v paperclip_local_data:/paperclip \
  paperclip-railway-template
```

Open `http://localhost:3100/setup` and use “Generate admin invite URL” to test. Stop with:

```bash
docker stop paperclip_app paperclip_pg
```

## Support

- **This template / deploy issues:** [this repo’s Issues](https://github.com/Lukem121/paperclip-railway-template/issues).
- **Paperclip app bugs and features:** [paperclipai/paperclip Issues](https://github.com/paperclipai/paperclip/issues).


## Migration maintenance mode

For an approved migration window, pause the agents and record their original states before stopping the application. Paperclip's Pause action cancels queued run attempts while retaining task and run history; do not replay those attempts automatically.

Set the Railway custom start command to:

```text
/usr/bin/tini -s -- /wrapper/entrypoint.sh node /wrapper/src/maintenance.mjs
```

This retains the existing init, privilege drop and optional private transport. It starts no Paperclip server, scheduler, OAuth refresher or agent. GET and HEAD `/setup/healthz` return 200 with `paperclipStarted: false`; all application, setup and MCP routes return 503. The database and persistent volume remain available to the separately authorized export procedure. No diagnostic or export endpoint is exposed over HTTP.

Verify the deployed command and process list before taking the final snapshot. Keep the database, volume and prior source/start configuration for rollback. Clearing the custom start command restores normal startup; resume agents only after the destination or rollback has been checked.
