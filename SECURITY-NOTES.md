# Security Notes

## What is encrypted

- File content: encrypted in the browser using AES-GCM.
- Manifest metadata (filenames, MIME types, sizes, file IDs): encrypted in the manifest before upload.
- Password: never stored.

## What the password does

Password derives a symmetric key with PBKDF2 and is used to decrypt the manifest and each file payload.

## What remains public

- GitHub Release IDs, names, and tags (for operational use).
- GitHub asset names and asset sizes after upload.
- Drop creation time and count information as seen in owner dashboard.

## Important limitations

- No file can be guaranteed unrecoverable immediately after deletion because GitHub caches, forks, and mirrors may retain references.
- noindex/robots.txt reduce discoverability but are not security controls.
- This system uses shared-browser APIs and relies on secure HTTPS transport only for transit to GitHub.
- High-sensitivity files should not be shared temporarily here.

## Operational recommendation

Use short retention windows manually. Consider owner-side confirmation and post-transfer deletion as a normal part of the workflow.

