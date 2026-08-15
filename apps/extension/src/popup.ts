const tokenInput = document.getElementById('token') as HTMLInputElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

const LABELS: Record<string, string> = {
  connected: 'Connected to desktop app',
  connecting: 'Connecting…',
  disconnected: 'Desktop app not reachable — is it running?',
  'bad-token': 'Token rejected — copy it from the launcher window',
};

function refreshStatus(): void {
  chrome.runtime.sendMessage({ type: 'status' }, (res) => {
    const status: string = res?.status ?? 'disconnected';
    statusEl.textContent = LABELS[status] ?? status;
    statusEl.className = status;
  });
}

void chrome.storage.local.get('token').then(({ token }) => {
  if (typeof token === 'string') tokenInput.value = token;
});

saveButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'set-token', token: tokenInput.value });
  setTimeout(refreshStatus, 600);
});

refreshStatus();
setInterval(refreshStatus, 1500);
