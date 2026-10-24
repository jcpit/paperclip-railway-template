import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeTransport, verifyControlIdentity, withoutJoinCredential, superviseApplication } from "../src/tailscale-supervisor.mjs";

const running = { BackendState: "Running", Self: { Tags: ["tag:paperclip-control"] } };
function child() {
  const result = new EventEmitter();
  result.exitCode = null;
  result.signalCode = null;
  result.signals = [];
  result.kill = (signal) => { result.signals.push(signal); result.emit("exit", null, signal); };
  return result;
}

test("join credential is absent from daemon and application environments", async () => {
  assert.deepEqual(withoutJoinCredential({ KEEP: "yes", PAPERCLIP_TAILSCALE_AUTHKEY: "test-only" }), { KEEP: "yes" });
  const daemon = child();
  const app = child();
  const result = superviseApplication(["node", "server.js"], daemon, { PAPERCLIP_TAILSCALE_AUTHKEY: "test-only" }, (_file, _args, options) => {
    assert.equal(options.env.PAPERCLIP_TAILSCALE_AUTHKEY, undefined);
    queueMicrotask(() => app.emit("exit", 7, null));
    return app;
  });
  assert.equal(await result, 7);
  assert.deepEqual(daemon.signals, ["SIGTERM"]);
});

test("reject untagged, additional-tag and incomplete identities", () => {
  verifyControlIdentity(running);
  for (const status of [{ BackendState: "NeedsLogin" }, { ...running, Self: { Tags: [] } }, { ...running, Self: { Tags: ["tag:paperclip-control", "tag:client"] } }]) {
    assert.throws(() => verifyControlIdentity(status), /dedicated control tag/);
  }
});

test("join key uses a private temporary file and is removed even when authentication fails", async (t) => {
  const stateDirectory = await mkdtemp(join(tmpdir(), "paperclip-transport-test-"));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  let keyFile;
  const daemon = child();
  const options = {
    authKey: "test-only-join-key",
    environment: { PAPERCLIP_TAILSCALE_AUTHKEY: "test-only-join-key" },
    stateDirectory,
    launch: (_command, args, spawnOptions) => {
      assert.ok(args.includes("--tun=userspace-networking"));
      assert.ok(args.includes("--socks5-server=127.0.0.1:1055"));
      assert.equal(spawnOptions.env.PAPERCLIP_TAILSCALE_AUTHKEY, undefined);
      assert.equal(spawnOptions.stdio, "ignore");
      return daemon;
    },
    executeCli: async (_command, args, execOptions) => {
      assert.equal(execOptions.env.PAPERCLIP_TAILSCALE_AUTHKEY, undefined);
      if (args.includes("status")) return { stdout: JSON.stringify({ BackendState: "NeedsLogin" }) };
      keyFile = args.find((arg) => arg.startsWith("--auth-key=file:")).slice("--auth-key=file:".length);
      assert.equal(await readFile(keyFile, "utf8"), "test-only-join-key");
      if (process.platform !== "win32") assert.equal((await stat(keyFile)).mode & 0o777, 0o600);
      assert.ok(args.includes("--shields-up=true"));
      throw new Error("sensitive provider response: test-only-join-key");
    },
  };
  await assert.rejects(initializeTransport(options), (error) => !error.message.includes("test-only") && /authentication/.test(error.message));
  await assert.rejects(readFile(keyFile), /ENOENT/);
  assert.deepEqual(daemon.signals, ["SIGTERM"]);
  assert.deepEqual(await readdir(stateDirectory), []);
});

test("initial NeedsLogin JSON is honored even when tailscale status exits nonzero", async (t) => {
  const stateDirectory = await mkdtemp(join(tmpdir(), "paperclip-login-test-"));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const daemon = child();
  let joined = false;
  let keyFile;
  const initialized = await initializeTransport({
    authKey: "test-only",
    environment: {},
    stateDirectory,
    launch: () => daemon,
    pause: () => { throw new Error("Must consume the returned status JSON"); },
    executeCli: async (_file, args) => {
      if (args.includes("status")) {
        if (joined) return { stdout: JSON.stringify(running) };
        throw Object.assign(new Error("not logged in"), { stdout: JSON.stringify({ BackendState: "NeedsLogin" }) });
      }
      assert.ok(args.includes("--accept-dns=false") && args.includes("--accept-routes=false") && args.includes("--ssh=false"));
      keyFile = args.find((arg) => arg.startsWith("--auth-key=file:")).slice("--auth-key=file:".length);
      joined = true;
      return { stdout: "" };
    },
  });
  assert.equal(initialized, daemon);
  await assert.rejects(readFile(keyFile), /ENOENT/);
});
