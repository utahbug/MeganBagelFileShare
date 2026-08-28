export const APP_NAME = "File Share";
export const OWNER_STORAGE_KEY = "mbfs_owner_settings_v1";
export const DROP_ID_PREFIX = "mbs-drop-";
export const RELEASE_NAME_PREFIX = "Drop:";
export const MAX_SINGLE_FILE_BYTES = 90 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 220 * 1024 * 1024;
export const ZIP_WARNING_BYTES = 180 * 1024 * 1024;

export const DEFAULT_GITHUB_CONFIG = {
  owner: "utahbug",
  repo: "MeganBagelFileShare",
};

export function storageLocation(owner, repo) {
  return `https://github.com/${owner}/${repo}`;
}

