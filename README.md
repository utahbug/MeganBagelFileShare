# File Share

`File Share` is a temporary file exchange application built for family and friend use-cases.

The app runs as a static website on GitHub Pages and uses:

- GitHub Releases to store encrypted Drop assets.
- Browser Web Crypto APIs for key derivation and AES-GCM encryption/decryption.
- Client-side code only (no server component).

## Core workflow

1. Owner creates a Drop with a display name and password.
2. Files are encrypted in the browser and uploaded to a dedicated GitHub Release.
3. Owner shares the generated Drop URL.
4. Recipient opens the URL and enters the same password.
5. The app downloads only the encrypted release assets, decrypts locally, and enables download.

## What is included

- Apple/Dropbox-inspired, restrained UI with mobile-first responsiveness.
- Temporary-drop concept with list, copy link, and deletion controls for owners.
- Client-side encryption utilities using Web Crypto.
- Recipient-first password screen.
- GitHub Actions deployment workflow for Pages.
- README, setup, and security documentation.

## Local development

```bash
npm install
npm run build
npm run test
npm run lint
```

Build output is generated into `dist/`.

## Run locally

Use any static server (for example `python -m http.server`) from the repository root.

```bash
npm install
npm run build
cd dist
python -m http.server 8080
```

## Conventions

- Passwords are never sent to GitHub.
- Original metadata can still be inferred from release and file timing if you choose very distinctive names.
- Drop IDs are random and non-sequential.

