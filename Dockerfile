# OpenAI Dot is not in v2026.1012.0 (the latest stable release at pin time).
# Use the official development image; its full source commit is in the tag.
# Pin the multi-platform manifest digest so app, Rust Runner, and CLI tools
# advance together, without rebuilding upstream's native toolchain on Railway.
ARG PAPERCLIP_IMAGE=ghcr.io/paperclipai/paperclip:sha-c5ca29dbeff50558c40984fbc03b90cfd4749ae2@sha256:bd48b47f5ffc9b4d37c2e373b224eb5ad4c6f87c8285635c657b877bcd6fc508
FROM ${PAPERCLIP_IMAGE}

# Reject the old source-build override instead of silently ignoring it.
ARG PAPERCLIP_REF=""
RUN if [ -n "${PAPERCLIP_REF}" ]; then \
      echo "PAPERCLIP_REF is no longer supported. Remove it and use PAPERCLIP_IMAGE (see README)." >&2; \
      exit 1; \
    fi

ENV CLAUDE_CODE_BUBBLEWRAP=1

# The upstream image supplies Node >=24.11, the built server/UI, native Runner,
# provider pack, and agent CLIs. Keep our capability-dropping entrypoint;
# setpriv is supplied explicitly rather than assumed to exist in a slim image.
USER root
ARG TAILSCALE_VERSION=1.104.2
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends util-linux openssh-client ca-certificates curl \
    && curl --proto '=https' --tlsv1.2 -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && curl --proto '=https' --tlsv1.2 -fsSL https://pkgs.tailscale.com/stable/debian/trixie.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tailscale=${TAILSCALE_VERSION} \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/runner-ssh.conf /etc/ssh/ssh_config.d/90-paperclip-runner.conf

WORKDIR /wrapper
COPY package.json /wrapper/package.json
RUN npm install --omit=dev && npm cache clean --force
COPY src /wrapper/src
COPY scripts/entrypoint.sh /wrapper/entrypoint.sh
COPY scripts/bootstrap-ceo.mjs /wrapper/template/bootstrap-ceo.mjs
RUN sh -n /wrapper/entrypoint.sh \
    && node --check /wrapper/src/tailscale-supervisor.mjs \
    && chmod +x /wrapper/entrypoint.sh \
    && chown -R node:node /wrapper \
    && test -f /app/server/dist-runtime/index.mjs \
    && command -v setpriv

# The wrapper owns Railway's public port and starts Paperclip on loopback.
EXPOSE 3100
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/wrapper/entrypoint.sh"]
CMD ["node", "/wrapper/src/server.js"]
