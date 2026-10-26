import fs from "node:fs";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { dirname, isAbsolute, resolve } from "node:path";

export type PrivateMcpEndpointPolicy = {
  origin: string;
  address: string;
  ca: string;
};

function administratorFile(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Private MCP paths must be absolute and canonical");
  let current = path;
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022)
        || (current === path ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error("Private MCP configuration must be root owned and not writable by other users");
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error("Unsafe private MCP file");
    return fs.readFileSync(fd, "utf8");
  } finally { fs.closeSync(fd); }
}

export function readPrivateMcpEndpointPolicy(
  env: NodeJS.ProcessEnv = process.env,
): PrivateMcpEndpointPolicy | undefined {
  const path = env.PAPERCLIP_PRIVATE_MCP_CONFIG;
  if (!path) return undefined;
  const config = JSON.parse(administratorFile(path));
  if (config.version !== 1 || Object.keys(config).some((key) => !["version", "origin", "caFile"].includes(key))) {
    throw new Error("Invalid private MCP administrator configuration");
  }
  const endpoint = new URL(config.origin);
  const ip = endpoint.hostname;
  const octets = ip.split(".").map(Number);
  const rfc1918 = isIP(ip) === 4 && (octets[0] === 10
    || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
    || (octets[0] === 192 && octets[1] === 168));
  if (endpoint.protocol !== "https:" || !rfc1918 || !endpoint.port
      || Number(endpoint.port) < 1024 || endpoint.pathname !== "/" || endpoint.search || endpoint.hash
      || endpoint.username || endpoint.password || typeof config.caFile !== "string"
      || !config.caFile.startsWith("/")) {
    throw new Error("Private MCP requires one exact private IPv4 HTTPS origin and a service CA file");
  }
  const ca = administratorFile(config.caFile);
  if (!new X509Certificate(ca).ca) throw new Error("Private MCP trust file must contain its service certificate authority");
  return { origin: endpoint.origin, address: ip, ca };
}

export function matchesPrivateMcpEndpoint(
  endpoint: URL,
  policy?: PrivateMcpEndpointPolicy,
): policy is PrivateMcpEndpointPolicy {
  return !!policy && endpoint.protocol === "https:" && endpoint.origin === policy.origin
    && endpoint.hostname === policy.address && !endpoint.username && !endpoint.password && !endpoint.hash;
}

export function privateMcpEndpointOptions(endpoint: URL | string) {
  const parsed = new URL(endpoint);
  const octets = parsed.hostname.split(".").map(Number);
  const privateAddress = isIP(parsed.hostname) === 4 && (octets[0] === 10
    || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
    || (octets[0] === 192 && octets[1] === 168));
  if (parsed.protocol !== "https:" || !privateAddress) return {};
  const policy = readPrivateMcpEndpointPolicy();
  return matchesPrivateMcpEndpoint(parsed, policy) ? { privateMcpEndpointPolicy: policy } : {};
}

