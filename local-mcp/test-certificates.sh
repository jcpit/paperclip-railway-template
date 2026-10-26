#!/bin/sh
set -eu
d=/private-mcp-test
mkdir -m 755 "$d"
openssl req -new -newkey rsa:2048 -nodes -x509 -days 1 -subj /CN=Disposable-MCP-Test-CA -keyout "$d/ca.key" -out "$d/ca.crt" -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign 2>/dev/null
openssl req -new -newkey rsa:2048 -nodes -subj /CN=Disposable-MCP-Test -keyout "$d/server.key" -out "$d/server.csr" 2>/dev/null
printf 'subjectAltName=IP:192.168.1.6\nextendedKeyUsage=serverAuth\n' > "$d/good.ext"
printf 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > "$d/wrong.ext"
openssl x509 -req -in "$d/server.csr" -CA "$d/ca.crt" -CAkey "$d/ca.key" -CAcreateserial -days 1 -extfile "$d/good.ext" -out "$d/server.crt" 2>/dev/null
openssl x509 -req -in "$d/server.csr" -CA "$d/ca.crt" -CAkey "$d/ca.key" -CAserial "$d/ca.srl" -days 1 -extfile "$d/wrong.ext" -out "$d/wrong-name.crt" 2>/dev/null
chmod 644 "$d"/*.crt

