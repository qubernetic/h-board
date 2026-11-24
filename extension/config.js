// Where the start page comes from. The extension is a thin shell: it hands the new tab to this
// address, so a prototype can be swapped (local mock, another port, a hosted build) without a rebuild.
const QS_DEFAULT_SOURCE = 'http://127.0.0.1:8790/index.html';
const qsSource = () =>
  new Promise(res => chrome.storage.sync.get({source: QS_DEFAULT_SOURCE}, v => res(v.source || QS_DEFAULT_SOURCE)));
