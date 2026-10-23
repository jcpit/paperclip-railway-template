import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolveImage, replaceImage } from "../scripts/bump-paperclip-ref.mjs";

const sha = "a".repeat(40);
const manifest = JSON.stringify({ manifests: ["amd64", "arm64"].map((architecture) => ({
  platform: { os: "linux", architecture },
})) });
const digest = `sha256:${createHash("sha256").update(manifest).digest("hex")}`;
const image = `ghcr.io/paperclipai/paperclip:sha-${sha}@${digest}`;

function mockRegistry({ commit = sha, status = 200, body = manifest, digestHeader = digest } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("api.github.com")) return Response.json({ sha: commit });
      if (url.includes("/token?")) return Response.json({ token: "public-pull-test-token" });
      return new Response(body, { status, headers: { "docker-content-digest": digestHeader } });
    },
  };
}

test("resolve upstream commit to published, immutable multi-platform image", async () => {
  const registry = mockRegistry();
  assert.deepEqual(await resolveImage("master", registry), { sha, image });
  assert.equal(registry.calls.length, 3);
  assert.ok(registry.calls[2].url.endsWith(`/manifests/sha-${sha}`));
});

test("GitHub credentials never go to the registry and refs are URL encoded", async () => {
  const registry = mockRegistry();
  await resolveImage("feature/dot", { ...registry, githubToken: "test-github-token" });
  assert.ok(registry.calls[0].url.endsWith("/feature%2Fdot"));
  assert.equal(registry.calls[0].options.headers.authorization, "Bearer test-github-token");
  assert.equal(registry.calls[1].options.headers, undefined);
  assert.equal(registry.calls[2].options.headers.authorization, "Bearer public-pull-test-token");
});

test("unpublished commits fail without generating a new pin", async () => {
  await assert.rejects(resolveImage("master", mockRegistry({ status: 404 })), /HTTP 404/);
});

test("reject malformed commit, tampered digest, and incomplete platform index", async () => {
  await assert.rejects(resolveImage("master", mockRegistry({ commit: "not-a-sha" })), /Invalid upstream/);
  await assert.rejects(resolveImage("master", mockRegistry({ digestHeader: "sha256:incorrect" })), /digest mismatch/);
  const body = JSON.stringify({ manifests: [] });
  const digestHeader = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  await assert.rejects(resolveImage("master", mockRegistry({ body, digestHeader })), /missing linux\/amd64/);
});

test("updater replaces only the image pin, refusing invalid input or legacy Dockerfiles", () => {
  const dockerfile = "# retained\nARG PAPERCLIP_IMAGE=old\nFROM ${PAPERCLIP_IMAGE}\n";
  assert.equal(replaceImage(dockerfile, image), `# retained\nARG PAPERCLIP_IMAGE=${image}\nFROM \${PAPERCLIP_IMAGE}\n`);
  assert.throws(() => replaceImage(dockerfile, "ghcr.io/paperclipai/paperclip:latest"), /digest-pinned/);
  assert.throws(() => replaceImage("ARG PAPERCLIP_REF=old\n", image), /Could not find/);
});

test("deployment uses the packaged runtime and preserves the setup proxy and init", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(dockerfile, /^ARG PAPERCLIP_IMAGE=ghcr\.io\/paperclipai\/paperclip:sha-[a-f0-9]{40}@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /test -f \/app\/server\/dist-runtime\/index\.mjs/);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/bin\/tini", "-s", "--", "\/wrapper\/entrypoint\.sh"\]/);
  assert.match(dockerfile, /CMD \["node", "\/wrapper\/src\/server\.js"\]/);
  assert.match(server, /spawn\("node", \["server\/dist-runtime\/index\.mjs"\]/);
  assert.doesNotMatch(server, /spawn\("tsx"/);
});
