PDF Merger — Offline Tool
==========================

Folder contents
----------------
index.html               The app page — open this in a browser
style.css                 All styling (light/dark theme included)
app.js                    All application logic (merging, bookmarks, etc.)
vendor/pdf-lib.min.js     Library used to actually merge PDFs
vendor/pdf.min.js         Library used to render page thumbnails
vendor/pdf.worker.min.js  Background worker used by pdf.min.js for thumbnails

Keep this whole folder together — index.html depends on the other files
sitting next to it in the same relative locations.

How to use it
-------------
1. Open index.html in any browser (double-click it, or drag it into a
   browser window). No internet connection is required.
2. Drag PDF files onto the dropzone, or click to browse.
3. Reorder with the up/down arrows if needed.
4. Click "Merge & Download".

Everything happens locally in your browser. Your files are never uploaded
anywhere.

A note on thumbnails
---------------------
Page thumbnails are rendered using a background "worker" script
(vendor/pdf.worker.min.js). Some browsers (mainly Chrome) restrict
background workers when a page is opened directly from disk via the
file:// address bar. If that happens, you'll just see a plain "PDF" label
instead of a real thumbnail — everything else, including merging itself,
works exactly the same either way.

If you want thumbnails to always work, either:
  - Open the folder in Firefox instead of Chrome, or
  - Serve the folder with any simple local web server, e.g. from a
    terminal in this folder: `python3 -m http.server`, then visit
    http://localhost:8000 in your browser.

A note on password-protected PDFs
-----------------------------------
No JavaScript library that runs in the browser can reliably decrypt a
password-protected PDF, including the one this tool uses. If a file is
detected as encrypted, the tool skips it and tells you so. To merge it,
open it in a PDF reader, enter the password, then "Save As" or "Print to
PDF" to create an unprotected copy — then add that copy here instead.
