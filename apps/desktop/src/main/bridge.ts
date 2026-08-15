import type { BridgeClientMessage, BridgeServerMessage } from '@draft-overlay/shared';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { rawPick } from './draft';
import { broadcast } from './windows';
import type { BridgeStatus } from '../preload/types';

export const BRIDGE_PORT = 8777;

const token = randomBytes(4).toString('hex').toUpperCase();
let connected = 0;
let lastError: string | undefined;
let lastSite: BridgeStatus['site'];

export function getBridgeInfo(): BridgeStatus {
  return { port: BRIDGE_PORT, token, connected: connected > 0, error: lastError, site: lastSite };
}

function emitStatus(): void {
  broadcast({ type: 'bridge', bridge: getBridgeInfo() });
}

export function startBridge(): void {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: BRIDGE_PORT });
  console.log(`[bridge] listening on ws://127.0.0.1:${BRIDGE_PORT} — pairing token: ${token}`);

  wss.on('error', (err) => {
    lastError = err.message.includes('EADDRINUSE')
      ? `Port ${BRIDGE_PORT} is already in use — is another copy of the app running?`
      : err.message;
    emitStatus();
  });

  wss.on('connection', (ws) => {
    let authed = false;
    const send = (msg: BridgeServerMessage) => ws.send(JSON.stringify(msg));

    ws.on('message', (buf) => {
      let msg: BridgeClientMessage;
      try {
        msg = JSON.parse(String(buf)) as BridgeClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        if (authed) return;
        if (msg.token === token) {
          authed = true;
          connected++;
          lastError = undefined;
          lastSite = msg.site;
          send({ type: 'ok' });
          emitStatus();
        } else {
          send({ type: 'error', message: 'Invalid pairing token' });
          ws.close();
        }
      } else if (msg.type === 'pick' && authed) {
        void rawPick(msg.pick, 'extension');
      }
    });

    ws.on('close', () => {
      if (authed) {
        connected = Math.max(0, connected - 1);
        emitStatus();
      }
    });
  });
}
