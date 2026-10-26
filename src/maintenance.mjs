import http from "node:http";
import { pathToFileURL } from "node:url";

// Deliberately imports no Paperclip, database, OAuth or agent modules.
export function createMaintenanceServer() {
  return http.createServer((request, response) => {
    const healthy =
      (request.method === "GET" || request.method === "HEAD") &&
      request.url === "/setup/healthz";
    response.writeHead(healthy ? 200 : 503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "close",
      ...(healthy ? {} : { "Retry-After": "300" }),
    });
    response.end(JSON.stringify(
      healthy
        ? { ok: true, maintenance: true, paperclipStarted: false }
        : { error: "maintenance" },
    ));
    request.resume();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? "3100");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid maintenance port");
  }
  const server = createMaintenanceServer();
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
    console.log("[maintenance] health listener ready; Paperclip is stopped");
  });
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
