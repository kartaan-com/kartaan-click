// Shows whether a newer version exists. The background worker does the asking and
// leaves the answer in storage; this only reads it and puts it on screen.
//
// A separate file rather than a <script> block inside popup.html because
// extensions are not allowed to run script written inline in a page.

'use strict';

const box     = document.getElementById('update');
const version = document.getElementById('version');

version.textContent = 'Version ' + chrome.runtime.getManifest().version;

function render(info) {
  if (!info) return;

  if (info.updateAvailable && info.latest) {
    box.className = 'update new';
    box.textContent = '';

    const line = document.createElement('div');
    line.innerHTML = '<b>Version ' + info.latest + ' is available.</b>';
    box.appendChild(line);

    if (info.notes) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      notes.textContent = info.notes;
      box.appendChild(notes);
    }

    if (info.url) {
      const a = document.createElement('a');
      a.href = info.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Download it';
      box.appendChild(a);
    }

    const how = document.createElement('div');
    how.className = 'notes';
    how.textContent = 'Unzip it over your existing folder, then press the reload '
      + 'arrow on this extension. Keeping the same folder keeps your settings.';
    box.appendChild(how);
    return;
  }

  // An update check that fails is usually just being offline. Say so plainly and
  // quietly rather than hiding it, but never dress it up as a problem.
  if (info.error && !info.latest) {
    box.className = 'update muted';
    box.textContent = 'Could not check for updates right now.';
    return;
  }

  box.className = 'update muted';
  box.textContent = 'Up to date.';
}

chrome.storage.local.get('_updateInfo').then(res => render(res._updateInfo));
chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' }, info => {
  void chrome.runtime.lastError;
  render(info);
});
