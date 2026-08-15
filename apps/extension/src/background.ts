import type { BridgeClientMessage, BridgeServerMessage } from '@draft-overlay/shared';

const BRIDGE_URL = 'ws://127.0.0.1:8777';

type Status = 'disconnected' | 'connecting' | 'connected' | 'bad-token';

let ws: WebSocket | null = null;
let status: Status = 'disconnected';
let queue: BridgeClientMessage[] = [];
let reconnectDelay = 1000;
let keepalive: ReturnType<typeof setInterval> | null = null;

async function getToken(): Promise<string> {
  const { token } = await chrome.storage.local.get('token');
  return typeof token === 'string' ? token : '';
}

function send(msg: BridgeClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN && status === 'connected') {
    ws.send(JSON.stringify(msg));
  } else {
    queue.push(msg);
    connect();
  }
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  status = 'connecting';
  ws = new WebSocket(BRIDGE_URL);

  ws.onopen = async () => {
    const token = await getToken();
    ws?.send(JSON.stringify({ type: 'hello', token, site: 'espn' } satisfies BridgeClientMessage));
  };

  ws.onmessage = (event) => {
    let msg: BridgeServerMessage;
    try {
      msg = JSON.parse(String(event.data)) as BridgeServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'ok') {
      status = 'connected';
      reconnectDelay = 1000;
      const pending = queue;
      queue = [];
      for (const m of pending) ws?.send(JSON.stringify(m));
      if (!keepalive) {
        // Non-JSON ping the bridge ignores; keeps the MV3 service worker alive.
        keepalive = setInterval(() => ws?.send('ping'), 20_000);
      }
    } else if (msg.type === 'error') {
      status = 'bad-token';
    }
  };

  ws.onclose = () => {
    if (status !== 'bad-token') status = 'disconnected';
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    ws = null;
    if (status !== 'bad-token') {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(15_000, reconnectDelay * 2);
    }
  };

  ws.onerror = () => ws?.close();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'pick' && message.pick?.name) {
    send({ type: 'pick', pick: message.pick });
  } else if (message?.type === 'status') {
    sendResponse({ status });
  } else if (message?.type === 'set-token') {
    void chrome.storage.local.set({ token: String(message.token ?? '').trim() }).then(() => {
      status = 'disconnected';
      reconnectDelay = 1000;
      ws?.close();
      connect();
    });
  }
  return false;
});

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
