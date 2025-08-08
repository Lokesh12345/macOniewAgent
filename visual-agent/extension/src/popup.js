// Enhanced popup with memory and task status
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const taskInfoEl = document.getElementById('taskInfo');
  const taskIdEl = document.getElementById('taskId');
  const taskStatusEl = document.getElementById('taskStatus');
  const connectionTimeEl = document.getElementById('connectionTime');
  const memoryIndicatorEl = document.getElementById('memoryIndicator');
  
  // Check connection status from background script
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    updateStatus(response);
  });
  
  // Update status periodically
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
      updateStatus(response);
    });
  }, 2000); // Update every 2 seconds
  
  function updateStatus(response) {
    if (!response) {
      setDisconnectedState();
      return;
    }
    
    const { connected, currentTaskId, timestamp } = response;
    
    if (connected) {
      statusEl.textContent = '🟢 Connected to Mac App';
      statusEl.className = 'status connected';
      
      // Update connection time
      const now = new Date(timestamp || Date.now());
      connectionTimeEl.textContent = now.toLocaleTimeString();
      
      // Show task information if available
      if (currentTaskId) {
        taskInfoEl.style.display = 'block';
        taskIdEl.textContent = currentTaskId.substring(0, 8) + '...';
        taskStatusEl.textContent = 'Active';
        taskStatusEl.style.color = '#28a745';
        
        // Show memory indicator
        memoryIndicatorEl.style.display = 'inline-flex';
        
        // Update status to show active task
        statusEl.textContent = '🟡 Task in Progress';
        statusEl.className = 'status task-active';
      } else {
        taskInfoEl.style.display = 'none';
        memoryIndicatorEl.style.display = 'none';
      }
    } else {
      setDisconnectedState();
    }
  }
  
  function setDisconnectedState() {
    statusEl.textContent = '🔴 Disconnected';
    statusEl.className = 'status disconnected';
    taskInfoEl.style.display = 'none';
    memoryIndicatorEl.style.display = 'none';
    connectionTimeEl.textContent = 'Never';
  }
  
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
});