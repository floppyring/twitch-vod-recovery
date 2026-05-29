document.getElementById('runBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      // 1. Username
      const userEl = document.querySelector('h1');
      const username = userEl ? userEl.innerText.split('/')[0].trim() : "NOT_FOUND";

      // 2. Date/Time
      const timeEl = document.querySelector('time.ml-2.font-bold');
      const dateTime = timeEl ? timeEl.getAttribute('datetime') : "NO_DATE";

      // 3. ID (From URL)
      // Splitting the URL by '/' and taking the last segment
      const urlParts = window.location.href.split('/');
      const id = urlParts[urlParts.length - 1];

      return { username, dateTime, id };
    }
  }, (results) => {
    const data = results[0].result;
    document.getElementById('results').innerHTML = `
      <p><b>User:</b> ${data.username}</p>
      <p><b>Date:</b> ${data.dateTime}</p>
      <p><b>ID:</b> ${data.id}</p>
    `;
  });
});