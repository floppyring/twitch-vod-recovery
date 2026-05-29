document.getElementById('runBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const runBtn = document.getElementById('runBtn');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const foundContainer = document.getElementById('found-container');
    const metadataDiv = document.getElementById('metadata');

    // UI Reset
    runBtn.disabled = true;
    foundContainer.innerHTML = "<small style='color: #999;'>Scanning domains...</small>";
    metadataDiv.innerHTML = "";
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
            const timeEl = document.querySelector('time[datetime]');
            if (!timeEl) return { error: "No date found" };

            // YOUR ORIGINAL TIMESTAMP LOGIC
            const rawDateTime = timeEl.getAttribute('datetime');
            const [datePart, timePart] = rawDateTime.split(' ');
            const [d, m, y] = datePart.split('-');
            const epoch = Math.floor(new Date(`${y}-${m}-${d}T${timePart}:00Z`).getTime() / 1000);
            
            return { 
                username: document.querySelector('h1')?.innerText.split('/')[0].trim().toLowerCase(),
                id: window.location.href.split('/').pop(),
                epoch: epoch,
                readableTime: rawDateTime // Pass back the raw string for display
            };
        }
    }, (results) => {
        const data = results[0].result;
        if (data.error) {
            foundContainer.innerHTML = `<small style='color:red;'>${data.error}</small>`;
            runBtn.disabled = false;
            return;
        }

        // SHOW METADATA INSTEAD OF EPOCH
        metadataDiv.innerHTML = `
            <div><span class="meta-label">Streamer:</span> ${data.username}</div>
            <div><span class="meta-label">VOD ID:</span> ${data.id}</div>
            <div><span class="meta-label">Start Time:</span> ${data.readableTime}</div>
        `;
        
        chrome.runtime.sendMessage({ action: "generateList", data });
    });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateUI") {
        const { current, total, foundUrl } = message;
        
        const percentage = Math.floor((current / total) * 100);
        document.getElementById('progress-bar').style.width = percentage + "%";

        if (foundUrl && !document.getElementById('vod-link-display')) {
            const container = document.getElementById('found-container');
            container.innerHTML = "<strong>Result Found:</strong>"; 

            const row = document.createElement('div');
            row.className = 'link-row';

            const linkDisplay = document.createElement('span');
            linkDisplay.id = 'vod-link-display';
            linkDisplay.innerText = foundUrl;
            linkDisplay.onclick = () => window.open(foundUrl, '_blank');

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-icon-btn';
            copyBtn.innerText = "COPY";
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(foundUrl).then(() => {
                    const toast = document.getElementById('copy-toast');
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2000);
                });
            };

            row.appendChild(linkDisplay);
            row.appendChild(copyBtn);
            container.appendChild(row);
        }

        if (current >= total) {
            document.getElementById('runBtn').disabled = false;
            if (!document.getElementById('vod-link-display')) {
                document.getElementById('found-container').innerHTML = "<small style='color:red;'>No VOD found.</small>";
            }
        }
    }
});