document.getElementById('runBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
            const userEl = document.querySelector('h1');
            const timeEl = document.querySelector('time[datetime]');
            
            if (!timeEl) {
                return { error: "Could not find timestamp on this page." };
            }

            const username = userEl ? userEl.innerText.split('/')[0].trim().toLowerCase() : "unknown";
            const dateTime = timeEl.getAttribute('datetime'); // Expects "DD-MM-YYYY HH:MM"
            const id = window.location.href.split('/').pop();

            // Manually parse DD-MM-YYYY HH:MM to avoid JS date parsing errors
            const [datePart, timePart] = dateTime.split(' ');
            const [d, m, y] = datePart.split('-');
            
            // Reconstruct into ISO format: YYYY-MM-DDTHH:MM:00Z
            const isoString = `${y}-${m}-${d}T${timePart}:00Z`;
            const dateObj = new Date(isoString);

            if (isNaN(dateObj.getTime())) {
                return { error: "Failed to parse: " + dateTime };
            }
            
            // Calculate Epoch
            const epoch = Math.floor(dateObj.getTime() / 1000);

            return { username, dateTime, id, epoch };
        }
    }, (results) => {
        if (!results || !results[0] || !results[0].result) {
            document.getElementById('results').innerHTML = `<p style="color:red;">Error: No data found.</p>`;
            return;
        }

        const data = results[0].result;

        if (data.error) {
            document.getElementById('results').innerHTML = `<p style="color:red;">${data.error}</p>`;
            return;
        }

        // Display static info
        document.getElementById('results').innerHTML = `
            <p><b>User:</b> ${data.username}</p>
            <p><b>Date:</b> ${data.dateTime}</p>
            <p><b>ID:</b> ${data.id}</p>
            <p><b>Epoch:</b> ${data.epoch}</p>
        `;

        // Request URL generation
        chrome.runtime.sendMessage({ action: "generateList", data }, (response) => {
            const container = document.getElementById('link-container');
            container.innerHTML = "<strong>Candidate URLs:</strong>";
            
            if (response && response.urls) {
                response.urls.forEach(url => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.innerText = url.split('/').slice(-3)[0]; // Hash part
                    link.target = "_blank";
                    link.style.display = "block";
                    container.appendChild(link);
                });
            } else {
                container.innerHTML = "<p>Error: Check background console.</p>";
            }
        });
    });
});