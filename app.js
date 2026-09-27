const { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFNumber } = PDFLib;

// pdf.js worker — served as a plain local file alongside this script (fully offline)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

// ---------- Theme ----------
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙';
  }
}

// Default is light, per user preference. No persistence to browser storage —
// this tool is meant to run standalone from disk, so it just resets to light
// each time you open it; use the button to switch for the session.
let currentTheme = 'light';
applyTheme(currentTheme);

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
});

// ---------- State ----------
let files = []; // { id, file, name, size, status: 'ok'|'encrypted'|'invalid', duplicateOf }
let idCounter = 0;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const emptyMsg = document.getElementById('emptyMsg');
const mergeBtn = document.getElementById('mergeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const optBookmarks = document.getElementById('optBookmarks');
const optRenameFields = document.getElementById('optRenameFields');

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function setStatus(msg, type) {
  statusEl.textContent = msg || '';
  statusEl.className = type || '';
}

function updateMergeButtonState() {
  const usableCount = files.filter(f => f.status === 'ok').length;
  mergeBtn.disabled = usableCount < 2;
}

async function renderThumbnail(file, canvasEl) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 34 / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    canvasEl.width = scaledViewport.width;
    canvasEl.height = scaledViewport.height;
    const ctx = canvasEl.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    return true;
  } catch (err) {
    return false;
  }
}

async function checkEncryption(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    await PDFDocument.load(arrayBuffer);
    return false; // loaded fine, not encrypted
  } catch (err) {
    if (err && /encrypted/i.test(err.message || '')) return true;
    return false; // some other error (handled at merge time)
  }
}

function findDuplicate(newFile, existingList) {
  return existingList.find(f => f.name === newFile.name && f.size === newFile.size);
}

function render() {
  fileListEl.innerHTML = '';
  emptyMsg.style.display = files.length ? 'none' : 'block';
  updateMergeButtonState();

  files.forEach((f, idx) => {
    const li = document.createElement('li');
    li.className = 'file-row' + (f.status !== 'ok' || f.duplicateOf ? ' warn' : '');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const canvas = document.createElement('canvas');
    thumb.appendChild(canvas);
    li.appendChild(thumb);

    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${idx + 1}. ${f.name}`;
    info.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'meta';
    let metaText = formatSize(f.size);
    let isWarn = false;
    if (f.status === 'encrypted') {
      metaText += ' — Password-protected, will be skipped';
      isWarn = true;
    } else if (f.status === 'invalid') {
      metaText += ' — Could not read this file (corrupted or not a valid PDF)';
      isWarn = true;
    } else if (f.duplicateOf) {
      metaText += ` — Same name & size as file #${f.duplicateOf}`;
      isWarn = true;
    }
    meta.textContent = metaText;
    if (isWarn) meta.classList.add('warn-text');
    info.appendChild(meta);

    if (f.status === 'encrypted') {
      const hint = document.createElement('div');
      hint.className = 'meta warn-text';
      hint.style.marginTop = '2px';
      hint.textContent = 'Browser-based tools can\u2019t decrypt password-protected PDFs. Open it in a PDF reader, enter the password, then use "Print to PDF" or "Save As" to make an unprotected copy \u2014 then add that copy here.';
      info.appendChild(hint);
    }

    li.appendChild(info);

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => { moveFile(idx, idx - 1); };

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = idx === files.length - 1;
    downBtn.onclick = () => { moveFile(idx, idx + 1); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.onclick = () => { files.splice(idx, 1); render(); };

    li.append(upBtn, downBtn, removeBtn);
    fileListEl.appendChild(li);

    renderThumbnail(f.file, canvas).then(ok => {
      if (!ok) {
        thumb.innerHTML = '<span class="placeholder">PDF</span>';
      }
    });
  });
}

function moveFile(from, to) {
  const [item] = files.splice(from, 1);
  files.splice(to, 0, item);
  render();
}

async function addFiles(fileListInput) {
  setStatus('');
  const incoming = Array.from(fileListInput);
  const rejected = [];
  const newEntries = [];

  for (const file of incoming) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) { rejected.push(file.name); continue; }

    const entry = {
      id: idCounter++,
      file,
      name: file.name,
      size: file.size,
      status: 'ok',
      duplicateOf: null,
    };

    const dup = findDuplicate(entry, [...files, ...newEntries]);
    if (dup) {
      entry.duplicateOf = files.indexOf(dup) + 1 || (newEntries.indexOf(dup) + files.length + 1);
    }

    const encrypted = await checkEncryption(file);
    if (encrypted) {
      entry.status = 'encrypted';
    } else {
      try {
        const buf = await file.arrayBuffer();
        await PDFDocument.load(buf, { ignoreEncryption: true });
      } catch (err) {
        entry.status = 'invalid';
      }
    }

    newEntries.push(entry);
  }

  files.push(...newEntries);

  if (rejected.length) {
    setStatus(`Skipped non-PDF file(s): ${rejected.join(', ')}`, 'error');
  }
  render();
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('active');
  });
});
['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');
  });
});
dropzone.addEventListener('drop', (e) => {
  addFiles(e.dataTransfer.files);
});

clearBtn.addEventListener('click', () => {
  files = [];
  render();
  setStatus('');
});

function sanitizeBookmarkTitle(name) {
  return name.replace(/\.pdf$/i, '');
}

async function buildOutline(mergedPdf, entries) {
  if (entries.length === 0) return;
  const context = mergedPdf.context;
  const itemRefs = entries.map(() => context.nextRef());
  const rootRef = context.nextRef();

  itemRefs.forEach((ref, i) => {
    const entry = entries[i];
    const page = mergedPdf.getPage(entry.pageIndex);
    const dictMap = new Map();
    dictMap.set(PDFName.of('Title'), PDFString.of(entry.title));
    dictMap.set(PDFName.of('Parent'), rootRef);
    if (i > 0) dictMap.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < itemRefs.length - 1) dictMap.set(PDFName.of('Next'), itemRefs[i + 1]);
    const destArr = context.obj([page.ref, PDFName.of('Fit')]);
    dictMap.set(PDFName.of('Dest'), destArr);
    const pdfDict = PDFDict.fromMapWithContext(dictMap, context);
    context.assign(ref, pdfDict);
  });

  const rootMap = new Map();
  rootMap.set(PDFName.of('Type'), PDFName.of('Outlines'));
  rootMap.set(PDFName.of('First'), itemRefs[0]);
  rootMap.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
  rootMap.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));
  const rootDict = PDFDict.fromMapWithContext(rootMap, context);
  context.assign(rootRef, rootDict);

  mergedPdf.catalog.set(PDFName.of('Outlines'), rootRef);
  mergedPdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

function renameFormFields(srcDoc, prefix) {
  try {
    const form = srcDoc.getForm();
    const fields = form.getFields();
    fields.forEach(field => {
      try {
        const current = field.acroField.getPartialName();
        if (current) {
          field.acroField.setPartialName(`${prefix}_${current}`);
        }
      } catch (e) { /* skip field on failure */ }
    });
  } catch (e) {
    // no form / no fields, nothing to do
  }
}

mergeBtn.addEventListener('click', async () => {
  const usable = files.filter(f => f.status === 'ok');
  if (usable.length < 2) return;

  mergeBtn.disabled = true;
  setStatus('Merging PDFs…');

  const skipped = files.filter(f => f.status !== 'ok');

  try {
    const mergedPdf = await PDFDocument.create();
    const outlineEntries = [];

    for (let i = 0; i < usable.length; i++) {
      const f = usable[i];
      const arrayBuffer = await f.file.arrayBuffer();
      let srcDoc;
      try {
        srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      } catch (err) {
        throw new Error(`Could not read "${f.name}". It may be corrupted or in an unsupported format.`);
      }

      if (optRenameFields.checked) {
        renameFormFields(srcDoc, `f${i + 1}`);
      }

      const startPage = mergedPdf.getPageCount();
      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(page => mergedPdf.addPage(page));

      if (optBookmarks.checked) {
        outlineEntries.push({ title: sanitizeBookmarkTitle(f.name), pageIndex: startPage });
      }
    }

    if (optBookmarks.checked) {
      await buildOutline(mergedPdf, outlineEntries);
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    let msg = `Done — merged ${usable.length} file(s) into merged.pdf`;
    if (skipped.length) {
      const names = skipped.map(f => f.name).join(', ');
      msg += `. Skipped ${skipped.length} file(s) that couldn't be included: ${names}`;
    }
    setStatus(msg, 'success');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong while merging.', 'error');
  } finally {
    updateMergeButtonState();
  }
});

render();
