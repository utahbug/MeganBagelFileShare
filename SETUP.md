# Setup

## One-time repository setup

1. Confirm the repository is `utahbug/MeganBagelFileShare`.
2. Enable GitHub Pages:
   - GitHub → Settings → Pages → Source: `GitHub Actions`.
3. Push the repository with the provided workflow (`.github/workflows/pages.yml`).
4. Optional: protect the repo from accidental discovery with a short description and no search indexing.

## GitHub token for owner actions

Owner actions require a token with at least:

- `repo` for private repositories.
- `public_repo` for public repositories.

You can store this in the app each session only; it is saved in your browser's local storage for convenience and never uploaded to GitHub by this app.

## Drop location configuration

If you fork the repository, update `DEFAULT_GITHUB_CONFIG` in `src/lib/config.js` so the app points at your fork.

## Browser support

- Chrome / Edge / Chromium-based desktop
- Safari/iOS, Chrome/Edge Android

## Security limits and manual tasks you still need to do

- No webhook-based cleanup is included in v1.
- No automatic expiration/deletion is implemented.
- For strong operational control, manually delete completed Drops from Owner dashboard.

