const PRESETS = [
  ['helyi mock · 8790', 'http://127.0.0.1:8790/index.html'],
  ['helyi mock · ?fresh', 'http://127.0.0.1:8790/index.html?fresh'],
  ['helyi mock · standby', 'http://127.0.0.1:8790/index.html?standby'],
];
const $ = s => document.querySelector(s);
const input = $('#src'), msg = $('#msg');
$('#ver').textContent = chrome.runtime.getManifest().version;
$('#presets').innerHTML = PRESETS.map(([l, u]) => `<button type="button" class="chip" data-u="${u}">${l}</button>`).join('');
$('#presets').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (b) { input.value = b.dataset.u; input.focus(); }
});
qsSource().then(s => (input.value = s));
const say = t => { msg.textContent = t; };
$('#f').addEventListener('submit', e => {
  e.preventDefault();
  let u;
  try { u = new URL(input.value.trim()); } catch { return say('Ez nem teljes cím. Így kezdődjön: http:// vagy https://'); }
  if (!/^https?:$/.test(u.protocol)) return say('Csak http:// vagy https:// cím lehet.');
  chrome.storage.sync.set({source: u.href}, () => say('Mentve. A következő új lap már innen jön.'));
});
$('#test').addEventListener('click', () => chrome.tabs.create({url: input.value.trim()}));
$('#reset').addEventListener('click', () => { input.value = QS_DEFAULT_SOURCE; say('Alapérték beírva, a mentés gombbal érvényes.'); });
chrome.runtime.sendMessage({type: 'scheme', dark: matchMedia('(prefers-color-scheme: dark)').matches});
