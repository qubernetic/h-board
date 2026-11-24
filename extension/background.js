// The toolbar button opens the settings.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The toolbar icon has no background, so its ink follows the browser's colour scheme. The
// offscreen page (theme.html) reports the scheme; pages of the extension report it too.
const toolbarIcon = dark => {
  const v = dark ? 'on-dark' : 'on-light';
  chrome.action.setIcon({path: {16: `icons/toolbar-${v}-16.png`, 24: `icons/toolbar-${v}-24.png`, 32: `icons/toolbar-${v}-32.png`}});
};
chrome.runtime.onMessage.addListener(m => { if (m?.type === 'scheme') toolbarIcon(m.dark); });

async function watchScheme() {
  if (await chrome.offscreen.hasDocument?.()) return;
  try {
    await chrome.offscreen.createDocument({url: 'theme.html', reasons: ['MATCH_MEDIA'],
      justification: 'Follow the colour scheme for the toolbar icon.'});
  } catch { /* already open */ }
}
chrome.runtime.onStartup.addListener(watchScheme);
chrome.runtime.onInstalled.addListener(watchScheme);
watchScheme();
