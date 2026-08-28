# Setup

## One-time repository setup

1. Confirm the repository is `utahbug/MeganBagelFileShare`.
2. Enable GitHub Pages:
   - GitHub → Settings → Pages → Source: `GitHub Actions`.
3. Push the repository with the provided workflow (`.github/workflows/pages.yml`).
4. Optional: protect the repo from accidental discovery with a short description and no search indexing.

## GitHub token for owner actions

Owner actions require a token with at least:

- **Repository-scoped fine-grained token on `utahbug/MeganBagelFileShare`**
- Permissions (minimum practical, public repository):
  - `Contents: Read and write`
  - `Metadata: Read`

Why `Contents` is enough:
- GitHub releases operations (create/list/read/delete releases and assets) are handled by the `contents` permission in the repository permissions model.

Do not grant global account-level tokens for this app.

For stricter security:
- Use a short expiration window (for example: 7–30 days).
- Prefer this scope on exactly one repository.
- Use a dedicated owner-only workflow token dedicated only to this repository.

In this UI:
- Token is kept only in-memory for the current tab by default.
- Optional "Remember token on this device" stores the token in browser local storage intentionally.
- "Forget GitHub credentials" immediately removes all persisted token state.
- The token is never included in URLs or shared with recipients.

Exact token creation steps (GitHub UI):
1. Visit GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Set token name and expiration.
3. Choose repository access: `Only selected repositories` → `MeganBagelFileShare`.
4. Repository permissions:
   - Set `Contents` to `Read and write`.
   - Leave `Administration`, `Actions`, and all others unset/`No access` unless you have another use case.
5. Save token and enter it once in Owner config.

## Drop location configuration

If you fork the repository, update `DEFAULT_GITHUB_CONFIG` in `src/lib/config.js` so the app points at your fork.

## Browser support

- Chrome / Edge / Chromium-based desktop
- Safari/iOS, Chrome/Edge Android

## Security limits and manual tasks you still need to do

- No webhook-based cleanup is included in v1.
- No automatic expiration/deletion is implemented.
- For strong operational control, manually delete completed Drops from Owner dashboard.
