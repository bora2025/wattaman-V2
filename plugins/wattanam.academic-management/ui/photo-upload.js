/* Student photo upload for Academic Management screens (add student, edit student).
 * Plugin screens can only show images stored in the record itself (data:image), not web links, so
 * the chosen picture is shrunk here (at most 300 × 400 px, JPEG) and kept in the photo field.
 * The photo field stays the single source of the value: uploading writes the image into it, removing
 * clears it, and typing a link still works (with a warning that cards and books cannot show links). */
(function (root) {
  'use strict';
  var MAX_W = 300, MAX_H = 400, LIMIT = 190000;

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Choose a picture file (JPG, PNG or WebP).')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('The picture could not be read.')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('The picture could not be opened.')); };
        image.onload = function () {
          var scale = Math.min(1, MAX_W / image.width, MAX_H / image.height);
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          var g = canvas.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs print on white
          g.drawImage(image, 0, 0, canvas.width, canvas.height);
          var quality = 0.85, data = canvas.toDataURL('image/jpeg', quality);
          while (data.length > LIMIT && quality > 0.4) { quality -= 0.1; data = canvas.toDataURL('image/jpeg', quality); }
          if (data.length > LIMIT) { reject(new Error('The picture is too detailed. Choose a smaller one.')); return; }
          resolve(data);
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }
  function kb(data) { return Math.max(1, Math.round(data.length * 0.75 / 1024)) + ' KB'; }

  // Adds "📷 Upload photo" / "Remove" next to a photo field (an <input>), plus a note.
  function attach(field, onChange) {
    var bar = document.createElement('div'); bar.className = 'photo-upload';
    var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'photo-pick'; pick.textContent = '📷 Upload photo';
    var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.hidden = true;
    pick.addEventListener('click', function () { file.click(); });
    var status = document.createElement('span'); status.className = 'photo-status';
    var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'photo-remove'; remove.textContent = 'Remove';
    var note = document.createElement('p'); note.className = 'photo-note';
    bar.appendChild(pick); bar.appendChild(file); bar.appendChild(status); bar.appendChild(remove);
    // Inside the photo field's own box, under the link input.
    var holder = field.parentNode;
    holder.appendChild(bar);
    holder.appendChild(note);

    function refresh() {
      var value = field.value.trim(), uploaded = /^data:image\//.test(value);
      field.hidden = uploaded;
      status.textContent = uploaded ? '✓ Uploaded photo (' + kb(value) + ')' : '';
      remove.hidden = !value;
      note.className = 'photo-note' + (/^https?:/i.test(value) ? ' warn' : '');
      note.textContent = /^https?:/i.test(value)
        ? '⚠ A web link: ID cards and progress books cannot show it. Upload the photo file instead.'
        : uploaded ? '' : 'Upload the student\'s photo (it is made small automatically) — or paste an https:// link.';
    }
    function set(value) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      refresh();
      if (onChange) onChange(value);
    }
    file.addEventListener('change', function () {
      var chosen = file.files && file.files[0]; file.value = '';
      if (!chosen) return;
      status.textContent = 'Preparing…';
      shrink(chosen).then(set).catch(function (error) { status.textContent = ''; note.className = 'photo-note warn'; note.textContent = '⚠ ' + error.message; });
    });
    remove.addEventListener('click', function () { set(''); });
    field.addEventListener('input', refresh);
    refresh();
    return { refresh: refresh };
  }

  root.WattanamPhoto = { attach: attach, shrink: shrink };
})(typeof self !== 'undefined' ? self : this);
