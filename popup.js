document.getElementById('runBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const runBtn = document.getElementById('runBtn');
  const progressBar = document.getElementById('progress-bar');
  const progressContainer = document.getElementById('progress-container');
  const foundContainer = document.getElementById('found-container');

  runBtn.disabled = true;
  foundContainer.innerHTML = "";
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const timeEl = document.querySelector('time[datetime]');
      if (!timeEl) return { error: "No date found" };

      // ORIGINAL TIMESTAMP LOGIC
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
    document.getElementById('results').innerHTML = `<b>Epoch:</b> ${data.epoch}`;
    chrome.runtime.sendMessage({ action: "generateList", data });
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateUI") {
    const { current, total, foundUrl } = message;
    
    document.getElementById('progress-bar').style.width = `${Math.floor((current / total) * 100)}%`;

    if (foundUrl && !document.querySelector('#found-container a')) {
      const link = document.createElement('a');
      link.href = foundUrl;
      link.innerText = foundUrl;
      link.target = "_blank";
      document.getElementById('found-container').appendChild(link);
    }

    if (current >= total) {
      document.getElementById('runBtn').disabled = false;
    }
  }
});