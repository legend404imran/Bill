# BillBook – Invoice Generator (PWA)
Offline invoice/bill maker. Plain HTML/CSS/JS, no backend, no login. All data stays in your browser (localStorage).

## 1. Run locally
Service workers need http, so don't double-click index.html. In this folder run `python3 -m http.server 8080` and open http://localhost:8080 (or use VS Code "Live Server").

## 2. Upload to GitHub
Create a new repo → **Add file → Upload files** → upload `index.html, style.css, app.js, manifest.json, sw.js, README.md` and the `icons` folder (keep the folder name `icons/`, files `icon-192.png` and `icon-512.png`) → Commit.

## 3. Connect to Netlify
netlify.com → **Add new site → Import an existing project → GitHub** → pick the repo.

## 4. Deploy
Build command: leave empty. Publish directory: `/` (root). Click **Deploy**. Every GitHub commit redeploys automatically.

## 5. Install the PWA
Open the Netlify URL in Chrome (Android) → **Install App** button in the header, or menu → *Add to Home screen*. iPhone: Safari → Share → *Add to Home Screen*.

## 6. Update the app
Edit files on GitHub, commit, and **change `CACHE='billbook-v1'` in `sw.js` to `v2`, `v3`…** so phones pick up the new files. The UPI QR uses the small `qrcode-generator` script from cdnjs; it is cached after the first online load. To make it fully self-hosted, download that file into the repo and change the `<script src>` in `index.html` and `QR` in `sw.js`.

## Notes
- Backup often: Settings → Export Backup (JSON). Restore on another device via Import Backup.
- PDF is A4, multi-page, generated on-device.
