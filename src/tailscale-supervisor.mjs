import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, chmod, lstat, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const expectedTag = "tag:paperclip-control";

export function withoutJoinCredential(environment) {
  const clean = { ...environment };
  delete clean.PAPERCLIP_TAILSCALE_AUTHKEY;
  return clean;
}

export function verifyControlIdentity(status) {
  if (status.BackendState !== "Running" || status.Self?.Tags?.length !== 1 || status.Self.Tags[0] !== expectedTag) {
    throw new Error("Private runner identity is not the dedicated control tag");
  }
}

export async function initializeTransport({
  authKey,
  environment,
  stateDirectory = "/paperclip/runner-tailscale",
  launch = spawn,
  executeCli = execute,
  pause = delay,
}) {
  const cleanEnvironment = withoutJoinCredential(environment);
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const directory = await lstat(stateDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Invalid private state directory");
  await chmod(stateDirectory, 0o700);
  const socket = join(stateDirectory, "tailscaled.sock");
  const daemon = launch("/usr/sbin/tailscaled", [
    "--tun=userspace-networking",
    `--state=${join(stateDirectory, "tailscaled.state")}`,
    `--socket=${socket}`,
    "--socks5-server=127.0.0.1:1055",
    "--port=0",
  ], { env: cleanEnvironment, stdio: "ignore" });
  let failedToSpawn = false;
  daemon.on("error", () => { failedToSpawn = true; });
  const cli = (arguments_) => executeCli("/usr/bin/tailscale", [`--socket=${socket}`, ...arguments_], {
    env: cleanEnvironment, timeout: 35000, maxBuffer: 1024 * 1024,
  });
  let keyDirectory;
  try {
    let status;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (failedToSpawn || daemon.exitCode !== null || daemon.signalCode) throw new Error("Private transport daemon exited");
      try {
        let response;
        try { response = await cli(["status", "--json"]); }
        catch (error) { response = error; } // NeedsLogin also returns useful JSON with a nonzero exit.
        status = JSON.parse(response.stdout);
      } catch { /* Local socket may not exist yet. */ }
      if (status?.BackendState) break;
      await pause(250);
    }
    if (!status?.BackendState) throw new Error("Private transport socket did not become ready");
    const up = ["up", "--hostname=paperclip-control", `--advertise-tags=${expectedTag}`,
      "--accept-dns=false", "--accept-routes=false", "--shields-up=true", "--ssh=false",
      "--advertise-routes=", "--advertise-exit-node=false", "--exit-node=", "--timeout=30s"];
    if (status.BackendState !== "Running") {
      if (!authKey) throw new Error("Private transport needs its dedicated join credential");
      keyDirectory = await mkdtemp(join(tmpdir(), "paperclip-tailnet-key-"));
      const keyFile = join(keyDirectory, "auth-key");
      await writeFile(keyFile, authKey.trim(), { mode: 0o600, flag: "wx" });
      up.push(`--auth-key=file:${keyFile}`);
    }
    try {
      await cli(up);
      verifyControlIdentity(JSON.parse((await cli(["status", "--json"])).stdout));
    } catch {
      // execFile errors include captured output. Never propagate auth responses to logs.
      throw new Error("Private transport authentication or identity verification failed");
    }
    return daemon;
  } catch (error) {
    daemon.kill("SIGTERM");
    throw error;
  } finally {
    if (keyDirectory) await rm(keyDirectory, { recursive: true, force: true });
  }
}

export async function superviseApplication(command, daemon, environment, launch = spawn) {
  const app = launch(command[0], command.slice(1), { env: withoutJoinCredential(environment), stdio: "inherit" });
  const forward = (signal) => { app.kill(signal); daemon.kill(signal); };
  const term = () => forward("SIGTERM");
  const interrupt = () => forward("SIGINT");
  process.on("SIGTERM", term);
  process.on("SIGINT", interrupt);
  try {
    return await new Promise((done) => {
      app.once("error", () => done(1));
      app.once("exit", (code, signal) => done(code ?? (signal === "SIGTERM" ? 143 : 1)));
    });
  } finally {
    process.off("SIGTERM", term);
    process.off("SIGINT", interrupt);
    daemon.kill("SIGTERM");
    const timer = setTimeout(() => daemon.kill("SIGKILL"), 5000);
    timer.unref();
    daemon.once("exit", () => clearTimeout(timer));
  }
}

async function main() {
  const authKey = process.env.PAPERCLIP_TAILSCALE_AUTHKEY;
  delete process.env.PAPERCLIP_TAILSCALE_AUTHKEY;
  const environment = withoutJoinCredential(process.env);
  if (process.getuid?.() === 0 || process.argv.length < 3) throw new Error("Private transport requires an unprivileged application command");
  const daemon = await initializeTransport({ authKey, environment });
  process.exitCode = await superviseApplication(process.argv.slice(2), daemon, environment);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Private runner transport could not initialize; the application was not started. Check dedicated enrollment and state.");
    process.exitCode = 1;
  });
}
