export const APP_NAME = "File Share";
export const OWNER_STORAGE_KEY = "mbfs_owner_settings_v1";
export const TOKEN_SESSION_KEY = "mbfs_owner_token_session_v1";
export const TOKEN_REMEMBER_KEY = "mbfs_owner_token_remember_v1";
export const DROP_ID_PREFIX = "mbs-drop-";
export const RELEASE_NAME_PREFIX = "Drop:";
export const APP_SINGLE_FILE_BYTES = 512 * 1024 * 1024;
export const APP_TOTAL_BYTES = 1024 * 1024 * 1024;
export const ZIP_WARNING_BYTES = 768 * 1024 * 1024;
export const GITHUB_ESTIMATED_SINGLE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const GITHUB_ESTIMATED_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;

export const DEFAULT_GITHUB_CONFIG = {
  owner: "utahbug",
  repo: "MeganBagelFileShare",
};

export function storageLocation(owner, repo) {
  return `https://github.com/${owner}/${repo}`;
}
