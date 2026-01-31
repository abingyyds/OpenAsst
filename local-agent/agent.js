#!/usr/bin/env node
/**
 * OpenAsst Local Agent
 * Lightweight local agent that connects browser to local terminal
 */

const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const PORT = process.env.OPENASST_PORT || 3003;
const VERSION = '1.0.0';

// Simple WebSocket implementation
function createWebSocketServer(server) {
  server.on('upgrade', (req, socket) => {
    if (req.headers['upgrade'] !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request');
      return;
    }

    const key = req.headers['sec-websocket-key'];
    const hash = require('crypto')
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${hash}\r\n` +
      '\r\n'
    );

    console.log('[Agent] WebSocket connection established');
    handleWebSocket(socket);
  });
}

function handleWebSocket(socket) {
  socket.on('data', (buffer) => {
    const message = decodeWebSocketFrame(buffer);
    if (!message) return;

    try {
      const data = JSON.parse(message);
      handleMessage(data, socket);
    } catch (e) {
      console.error('[Agent] Failed to parse message:', e.message);
    }
  });

  socket.on('close', () => {
    console.log('[Agent] WebSocket connection closed');
  });

  socket.on('error', (err) => {
    console.error('[Agent] Socket error:', err.message);
  });
}

function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const secondByte = buffer[1];
  const isMasked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let mask = null;
  if (isMasked) {
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  const payload = buffer.slice(offset, offset + payloadLength);

  if (isMasked && mask) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return payload.toString('utf8');
}

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message, 'utf8');
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function sendMessage(socket, data) {
  try {
    const frame = encodeWebSocketFrame(JSON.stringify(data));
    socket.write(frame);
  } catch (e) {
    console.error('[Agent] Failed to send message:', e.message);
  }
}

function handleMessage(data, socket) {
  const { type, id, command } = data;

  if (type === 'ping') {
    sendMessage(socket, { type: 'pong', id });
    return;
  }

  if (type === 'info') {
    sendMessage(socket, {
      type: 'info',
      id,
      data: {
        version: VERSION,
        platform: os.platform(),
        hostname: os.hostname(),
        username: os.userInfo().username,
        homedir: os.homedir(),
        cwd: process.cwd()
      }
    });
    return;
  }

  if (type === 'exec') {
    executeCommand(command, id, socket);
    return;
  }
}

function executeCommand(command, id, socket) {
  console.log(`[Agent] Executing command: ${command}`);

  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/bash';
  const shellArgs = isWindows ? ['/c', command] : ['-c', command];

  const child = spawn(shell, shellArgs, {
    cwd: os.homedir(),
    env: process.env
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
    sendMessage(socket, { type: 'stdout', id, data: data.toString() });
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
    sendMessage(socket, { type: 'stderr', id, data: data.toString() });
  });

  child.on('close', (code) => {
    sendMessage(socket, { type: 'exit', id, code, stdout, stderr });
  });

  child.on('error', (err) => {
    sendMessage(socket, { type: 'error', id, error: err.message });
  });
}

// HTTP server handles CORS and health check
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: VERSION }));
    return;
  }

  if (req.url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      version: VERSION,
      platform: os.platform(),
      hostname: os.hostname(),
      username: os.userInfo().username
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`OpenAsst Local Agent v${VERSION}\n`);
});

createWebSocketServer(server);

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║     OpenAsst Local Agent v' + VERSION + '      ║');
  console.log('  ╠═══════════════════════════════════════╣');
  console.log(`  ║  Status: Running                      ║`);
  console.log(`  ║  Port:   ${PORT}                            ║`);
  console.log(`  ║  URL:    http://127.0.0.1:${PORT}          ║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
  console.log('  Browser can now connect to local terminal!');
  console.log('  Press Ctrl+C to stop the agent');
  console.log('');
});
