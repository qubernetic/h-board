// Offscreen page: the service worker can't see the colour scheme, so this page watches it and
// reports every change.
const mq = matchMedia('(prefers-color-scheme: dark)');
const report = () => chrome.runtime.sendMessage({type: 'scheme', dark: mq.matches});
mq.addEventListener('change', report);
report();
