# Private MCP gateway origin patch

This optional local image extends the pinned Paperclip image with one administrator-owned HTTPS origin and a service-specific CA. It does not change the Railway image or defaults.

The configuration file is selected by PAPERCLIP_PRIVATE_MCP_CONFIG and mounted read-only. Its origin must be an exact RFC1918 IPv4 HTTPS origin with an explicit unprivileged port. Configure only https://192.168.1.6:3443 for this installation. The root-owned configuration and CA must not be writable by the application. Future gateway paths share this origin; connection grants and tool policies remain independent.

Only matching MCP requests receive the exception and service CA. Socket address pinning, TLS certificate identity validation, and redirect rejection remain enforced. Other private addresses, ports and protocols retain the original guard. Public MCP uses its existing guard and CA trust. No global SSRF, CSRF, authentication or sandbox switch is disabled.

Build with Dockerfile from this directory. The build checks four original source SHA256 hashes, applies exact anchors, compiles the changed modules, runs disposable TLS regression tests, and rebuilds the official runtime bundle. The final image copies no test keys.

tls-proxy.mjs is a separate optional CT109 service. It binds only 192.168.1.6:3443, accepts source 192.168.1.71, and forwards to the existing fixed loopback gateway. It never logs credentials or request URLs. Production service keys are generated on CT109 and never included in this repository. Only its public CA certificate belongs on CT122.

Deploy only after verified rollback backups and successful tests. Keep the original compose file and pinned image for rollback. Repoint existing connections through the supported application API/UI, retaining their vault references and grants. Validate only initialize and tools/list while agents remain paused.

