document.getElementById('runBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // UI Elements
  const runBtn = document.getElementById('runBtn');
  const progressBar = document.getElementById('progress-bar');
  const progressContainer = document.getElementById('progress-container');
  const foundContainer = document.getElementById('found-container');
  const linkContainer = document.getElementById('link-container');

  // Initialization
  runBtn.disabled = true;
  foundContainer.innerHTML = "";
  linkContainer.innerHTML = "";
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const timeEl = document.querySelector('time[datetime]');
      if (!timeEl) return { error: "No date found" };

      // YOUR ORIGINAL TIMESTAMP LOGIC
      const [datePart, timePart] = timeEl.getAttribute('datetime').split(' ');
      const [d, m, y] = datePart.split('-');
      const epoch = Math.floor(new Date(`${y}-${m}-${d}T${timePart}:00Z`).getTime() / 1000);
      
      return { 
        username: document.querySelector('h1')?.innerText.split('/')[0].trim().toLowerCase(),
        id: window.location.href.split('/').pop(),
        epoch: epoch 
      };
    }
  }, (results) => {
    const data = results[0].result;
    if (data.error) {
        alert(data.error);
        runBtn.disabled = false;
        return;
    }
    document.getElementById('results').innerHTML = `<p><b>Epoch:</b> ${data.epoch}</p>`;

    // Start the process in the background
    chrome.runtime.sendMessage({ action: "generateList", data });
  });
});

// Listen for incremental updates from the background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateUI") {
    const { current, total, foundUrl } = message;
    
    // 1. Update Progress Bar
    const percent = Math.floor((current / total) * 100);
    document.getElementById('progress-bar').style.width = `${percent}%`;

    // 2. If a URL was found, add to the GREEN found box
    if (foundUrl) {
      const link = document.createElement('a');
      link.href = foundUrl;
      link.innerText = foundUrl;
      link.target = "_blank";
      document.getElementById('found-container').appendChild(link);
    }

    // 3. Re-enable button when 100% complete
    if (current >= total) {
      document.getElementById('runBtn').disabled = false;
    }
  }
});