document.getElementById('runBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const timeEl = document.querySelector('time[datetime]');
      if (!timeEl) return { error: "No date found" };

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
    document.getElementById('results').innerHTML = `<p><b>Epoch:</b> ${data.epoch}</p>`;

    chrome.runtime.sendMessage({ action: "generateList", data }, (response) => {
      const container = document.getElementById('link-container');
      container.innerHTML = "<strong>Valid URLs found:</strong>";
      response.urls.forEach(url => {
        const link = document.createElement('a');
        link.href = url;
        link.innerText = url;
        link.target = "_blank";
        link.style.display = "block";
        container.appendChild(link);
      });
    });
  });
});