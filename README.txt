PANAGSANGKA 2026 — GITHUB PAGES FRONTEND
=========================================
Upload ALL CONTENTS OF frontend/ (index.html, config.js, app.js,
styles.css, manifest.json, sw.js, assets/) to the root of your
GitHub Pages branch (or another folder selected in GitHub Pages).

Settings > Pages > Deploy from branch > main > /(root), or use GitHub
Actions/Pages appropriate to your repository.

IMPORTANT:
1. config.js points to https://panagsangka.mdmsportal.uk.
2. The Windows backend must be running, along with panagsangka-api
   tunnel, for live data and login. GitHub Pages hosts frontend ONLY.
3. NEVER upload backend/, .env, cloudflare-token.txt, or databases
   to a public GitHub Pages repository.
4. On your phone: open GitHub Pages URL, then Install/Add to Home
   Screen from Chrome/Safari menus when eligible.
5. PWA caches the interface, but official results are never locally
   accepted while backend is offline. Reconnect to submit results.
6. Default ranking starts at 0 until verified placements are approved.
7. Full-screen live tally: select Overall Ranking on public site.

Mobile test targets: iPhone Safari, Android Chrome, tablet portrait,
tablet landscape, desktop Chrome/Edge. Landscape and tablet scroll
are enabled rather than locking document overflow.
