// Get connection status and update UI
chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
  updateUI(response.connected);
});

// Listen for status updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'statusUpdate') {
    updateUI(message.connected);
  }
});

// Connect button handler
document.getElementById('connectBtn').addEventListener('click', () => {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  
  chrome.runtime.sendMessage({ action: 'connect' }, (response) => {
    if (!response.success) {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });
});

function updateUI(isConnected) {
  const status = document.getElementById('status');
  const btn = document.getElementById('connectBtn');
  
  if (isConnected) {
    status.textContent = 'Connected';
    status.className = 'status connected';
    btn.style.display = 'none';
  } else {
    status.textContent = 'Disconnected';
    status.className = 'status disconnected';
    btn.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}