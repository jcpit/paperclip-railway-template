// Historical filename retained for existing operator workflows. This now pins
// the complete published image, not a source checkout or the latest stable tag.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const repository = "paperclipai/paperclip";
const imageArgument = /^ARG PAPERCLIP_IMAGE=(.+)$/m;

async function checkedFetch(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${new URL(url).pathname}`);
  return response;
}

export async function resolveImage(ref = "master", { fetchImpl = fetch, githubToken } = {}) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "paperclip-railway-template-bot",
    ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
  };
  const commitResponse = await checkedFetch(fetchImpl,
    `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`, { headers });
  const { sha } = await commitResponse.json();
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Invalid upstream commit SHA");

  // Public pull token only; never persist or print it, or send the GitHub token to GHCR.
  const authResponse = await checkedFetch(fetchImpl,
    `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${repository}:pull`)}`);
  const { token } = await authResponse.json();
  if (typeof token !== "string" || !token) throw new Error("Missing registry pull token");

  const tag = `sha-${sha}`;
  const manifestResponse = await checkedFetch(fetchImpl,
    `https://ghcr.io/v2/${repository}/manifests/${tag}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
      },
    });
  const bytes = Buffer.from(await manifestResponse.arrayBuffer());
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== manifestResponse.headers.get("docker-content-digest")) {
    throw new Error("Registry manifest digest mismatch");
  }
  const manifest = JSON.parse(bytes.toString("utf8"));
  for (const architecture of ["amd64", "arm64"]) {
    if (!manifest.manifests?.some(({ platform }) => platform?.os === "linux" && platform.architecture === architecture)) {
      throw new Error(`Published image missing linux/${architecture}`);
    }
  }
  return { sha, image: `ghcr.io/${repository}:${tag}@${digest}` };
}

export function replaceImage(dockerfile, image) {
  if (!/^ghcr\.io\/paperclipai\/paperclip:sha-[a-f0-9]{40}@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("Expected a commit-tagged, digest-pinned official Paperclip image");
  }
  if (!imageArgument.test(dockerfile)) throw new Error("Could not find PAPERCLIP_IMAGE line");
  return dockerfile.replace(imageArgument, `ARG PAPERCLIP_IMAGE=${image}`);
}

async function main() {
  const ref = process.argv[2] ?? "master";
  const dockerPath = "Dockerfile";
  const dockerfile = fs.readFileSync(dockerPath, "utf8");
  if (!imageArgument.test(dockerfile)) throw new Error("Could not find PAPERCLIP_IMAGE line");
  const { sha, image } = await resolveImage(ref, { githubToken: process.env.GITHUB_TOKEN });
  const next = replaceImage(dockerfile, image);
  console.log(`Upstream ${ref} resolves to ${sha}`);
  console.log(`Published image: ${image}`);
  if (next === dockerfile) {
    console.log("No update needed.");
    return;
  }
  fs.writeFileSync(dockerPath, next);
  console.log("Updated Dockerfile. Review upstream upgrade notes and test before redeploying.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
