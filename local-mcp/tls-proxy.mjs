import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
const allowedSource = '192.168.1.71';
function peer(socket) { return (socket.remoteAddress ?? '').replace(/^::ffff:/, ''); }
function cleanHeaders(headers) {
  const result = { ...headers };
  const hop = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', ...(headers.connection ?? '').split(',').map(s=>s.trim().toLowerCase())];
  for (const name of hop) delete result[name];
  return result;
}
const server = https.createServer({
  key: fs.readFileSync('/etc/paperclip-mcp-tls/server.key'),
  cert: fs.readFileSync('/etc/paperclip-mcp-tls/server.crt'),
  minVersion: 'TLSv1.2',
  maxHeaderSize: 16384,
}, (req, res) => {
  if (peer(req.socket) !== allowedSource) { req.destroy(); return; }
  if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.method === 'CONNECT') {
    res.writeHead(400); res.end(); return;
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method,
    headers: { ...cleanHeaders(req.headers), host: '127.0.0.1:3000' },
    agent: false,
  }, response => {
    res.writeHead(response.statusCode ?? 502, cleanHeaders(response.headers));
    response.pipe(res);
    response.on('error', () => res.destroy());
    res.on('close', () => response.destroy());
  });
  upstream.setTimeout(90000, () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});
server.prependListener('connection', socket => { if (peer(socket) !== allowedSource) socket.destroy(); });
server.on('upgrade', (_req, socket) => socket.destroy());
server.on('connect', (_req, socket) => socket.destroy());
server.on('tlsClientError', () => {});
server.headersTimeout = 15000;
server.requestTimeout = 90000;
server.keepAliveTimeout = 5000;
server.listen(3443, '192.168.1.6', () => console.log('Private MCP TLS listener ready'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));

