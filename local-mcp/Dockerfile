FROM ghcr.io/paperclipai/paperclip:sha-c5ca29dbeff50558c40984fbc03b90cfd4749ae2@sha256:bd48b47f5ffc9b4d37c2e373b224eb5ad4c6f87c8285635c657b877bcd6fc508 AS private-mcp-verified
USER root
COPY . /opt/private-mcp/
WORKDIR /opt/private-mcp
RUN node apply.mjs /app && node prepare-tests.mjs /app/server/src/services && sh test-certificates.sh && MCP_TEST_CERT_DIR=/private-mcp-test node --test test/*.test.mjs && node /app/server/scripts/bundle-runtime.mjs
FROM ghcr.io/paperclipai/paperclip:sha-c5ca29dbeff50558c40984fbc03b90cfd4749ae2@sha256:bd48b47f5ffc9b4d37c2e373b224eb5ad4c6f87c8285635c657b877bcd6fc508
COPY --from=private-mcp-verified /app/server/src/services/ /app/server/src/services/
COPY --from=private-mcp-verified /app/server/dist/ /app/server/dist/
COPY --from=private-mcp-verified /app/server/dist-runtime/ /app/server/dist-runtime/
LABEL io.jcpit.paperclip.patch="private-mcp-origin-v1"

