// Hand the new tab to the source by replacing it with a tab opened on the source address, which
// puts the keyboard focus into the page, so f, / and the arrows work at once.
(async () => {
  const src = await qsSource();
  const go = async () => {
    try {
      await fetch(src, {mode: 'no-cors', cache: 'no-store'}); // fails only when nothing answers
    } catch {
      document.getElementById('src').textContent = src;
      document.getElementById('down').hidden = false;
      return;
    }
    // Navigating this tab in place keeps the focus in the address bar. A tab the extension opens
    // with a url gets the page focus, so open one in this tab's place and close this one.
    chrome.tabs.getCurrent(async tab => {
      if (!tab) return location.replace(src);
      await chrome.tabs.create({url: src, index: tab.index, windowId: tab.windowId, active: true});
      chrome.tabs.remove(tab.id);
    });
  };
  document.getElementById('retry').addEventListener('click', go);
  go();
})();
