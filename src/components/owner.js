import {
  DEFAULT_GITHUB_CONFIG,
  DROP_ID_PREFIX,
  APP_SINGLE_FILE_BYTES,
  APP_TOTAL_BYTES,
  OWNER_STORAGE_KEY,
  TOKEN_SESSION_KEY,
  TOKEN_REMEMBER_KEY,
} from "../lib/config.js";
import { GitHubClient } from "../services/github.js";
import { createDropEnvelope, formatDropAge } from "../lib/dropModel.js";
import {
  randomId,
  deriveKey,
  encryptBuffer,
  readFileAsArrayBuffer,
  encryptTextObject,
  toBase64,
  fromBase64,
  humanBytes,
} from "../utils/crypto.js";
import { shareUrlForId } from "../utils/routing.js";

const PERSISTENT_TOKEN_KEY = "mbfs_owner_token_persistent_v1";

function ownerSettings() {
  const raw = localStorage.getItem(OWNER_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_GITHUB_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      owner: parsed.owner || DEFAULT_GITHUB_CONFIG.owner,
      repo: parsed.repo || DEFAULT_GITHUB_CONFIG.repo,
    };
  } catch {
    return { ...DEFAULT_GITHUB_CONFIG };
  }
}

function getSavedToken(rememberToken) {
  if (rememberToken) {
    return localStorage.getItem(PERSISTENT_TOKEN_KEY) || "";
  }
  return sessionStorage.getItem(TOKEN_SESSION_KEY) || "";
}

function setSavedToken(token, rememberToken) {
  if (rememberToken) {
    if (token) {
      localStorage.setItem(PERSISTENT_TOKEN_KEY, token);
      localStorage.setItem(TOKEN_REMEMBER_KEY, "1");
    } else {
      localStorage.removeItem(PERSISTENT_TOKEN_KEY);
      localStorage.removeItem(TOKEN_REMEMBER_KEY);
    }
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
  } else {
    if (token) {
      sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_SESSION_KEY);
    }
    localStorage.removeItem(PERSISTENT_TOKEN_KEY);
    localStorage.removeItem(TOKEN_REMEMBER_KEY);
  }
}

function clearSavedToken() {
  localStorage.removeItem(PERSISTENT_TOKEN_KEY);
  localStorage.removeItem(TOKEN_REMEMBER_KEY);
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
}

function formatSelectedFilesLabel(selected) {
  if (!selected.length) {
    return "No files selected";
  }
  const total = selected.reduce((acc, file) => acc + file.size, 0);
  return `${selected.length} files selected · ${humanBytes(total)}`;
}

export function renderOwnerView(root, { onNotify }) {
  root.innerHTML = `
    <h2 class="section-title">Owner Dashboard</h2>
    <p class="muted small">Temporary file exchange · owner controls</p>

    <section class="section-card">
      <h3>Connection</h3>
      <div class="field-grid">
        <div class="field">
          <label for="githubOwner">GitHub owner</label>
          <input id="githubOwner" type="text" value="${DEFAULT_GITHUB_CONFIG.owner}" />
        </div>
        <div class="field">
          <label for="githubRepo">GitHub repository</label>
          <input id="githubRepo" type="text" value="${DEFAULT_GITHUB_CONFIG.repo}" />
        </div>
        <div class="field">
          <label for="githubToken">GitHub token</label>
          <div class="inline-input-row">
            <input id="githubToken" type="password" autocomplete="off" placeholder="Session-only by default" />
            <button id="toggleOwnerToken" class="btn-plain btn-inline" type="button">Show</button>
          </div>
          <p class="small muted">Owner token is required for creating and deleting Shares.</p>
        </div>
        <div class="field">
          <label><input id="rememberToken" type="checkbox" /> Remember token on this device</label>
          <p class="small muted">Optional: keeps your token on this browser only.</p>
        </div>
        <div class="field"><button id="forgetToken" class="btn-plain btn-inline">Forget GitHub credentials</button></div>
        <div class="field">
          <div class="button-row">
            <button id="saveConfig" class="btn-primary">Save connection</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card">
      <h3>Create a Share</h3>
      <p id="storageLimitNotice" class="small muted">Limits: ${humanBytes(APP_SINGLE_FILE_BYTES)} per file and ${humanBytes(APP_TOTAL_BYTES)} per Share.</p>
      <div class="field-grid">
        <div class="field">
          <label for="shareName">Share name</label>
          <input id="shareName" type="text" value="Family Photos" />
        </div>
        <div class="field">
          <label for="sharePassword">Password</label>
          <div class="inline-input-row">
            <input id="sharePassword" type="password" autocomplete="new-password" />
            <button id="toggleSharePassword" class="btn-plain btn-inline" type="button">Show</button>
          </div>
        </div>
        <div class="field">
          <label for="sharePasswordConfirm">Confirm password</label>
          <div class="inline-input-row">
            <input id="sharePasswordConfirm" type="password" autocomplete="new-password" />
            <button id="toggleSharePasswordConfirm" class="btn-plain btn-inline" type="button">Show</button>
          </div>
          <p id="passwordHelper" class="small muted" role="status" aria-live="polite">Recipients will need this password to open the Share.</p>
        </div>
        <div class="field">
          <label for="shareFilesInput">Files</label>
          <div id="shareDropZone" class="drop-zone" role="button" tabindex="0" aria-label="Upload files">
            <p class="drop-zone-title">Drop files here</p>
            <p class="small muted">or choose files</p>
            <p class="small muted" id="selectedFileSummary">No files selected</p>
          </div>
          <input id="shareFilesInput" type="file" multiple class="hidden-file-input" />
        </div>
      </div>

      <div class="inline-note small">Files are encrypted in your browser before upload. Your password is not stored with the files.</div>
      <p id="ownerStatus" class="status status-warning small" role="alert" aria-live="polite"></p>
      <div class="progress" id="createProgress" aria-live="polite"></div>
      <div class="button-row">
        <button id="createShare" class="btn-primary">Create Share</button>
        <button id="clearShareForm" class="btn-plain">Clear</button>
      </div>
    </section>

    <section class="section-card">
      <h3>Your Shares</h3>
      <div id="dropsList" class="drop-list"></div>
    </section>
  `;

  const githubOwner = root.querySelector("#githubOwner");
  const githubRepo = root.querySelector("#githubRepo");
  const githubToken = root.querySelector("#githubToken");
  const rememberToken = root.querySelector("#rememberToken");
  const forgetToken = root.querySelector("#forgetToken");
  const saveConfig = root.querySelector("#saveConfig");
  const toggleOwnerToken = root.querySelector("#toggleOwnerToken");
  const shareName = root.querySelector("#shareName");
  const sharePassword = root.querySelector("#sharePassword");
  const sharePasswordConfirm = root.querySelector("#sharePasswordConfirm");
  const passwordHelper = root.querySelector("#passwordHelper");
  const toggleSharePassword = root.querySelector("#toggleSharePassword");
  const toggleSharePasswordConfirm = root.querySelector("#toggleSharePasswordConfirm");
  const shareFilesInput = root.querySelector("#shareFilesInput");
  const shareDropZone = root.querySelector("#shareDropZone");
  const selectedSummary = root.querySelector("#selectedFileSummary");
  const status = root.querySelector("#ownerStatus");
  const progress = root.querySelector("#createProgress");
  const createShare = root.querySelector("#createShare");
  const clearShareForm = root.querySelector("#clearShareForm");

  const settings = ownerSettings();
  githubOwner.value = settings.owner;
  githubRepo.value = settings.repo;

  const isRemembered = localStorage.getItem(TOKEN_REMEMBER_KEY) === "1";
  rememberToken.checked = isRemembered;
  githubToken.value = getSavedToken(isRemembered);

  let selectedFiles = [];

  function setFiles(files) {
    selectedFiles = files;
    selectedSummary.textContent = formatSelectedFilesLabel(selectedFiles);
    if (selectedFiles.length) {
      status.textContent = "";
    }
  }

  function renderPasswordError(message) {
    status.textContent = message || "";
    status.className = message ? "status status-bad small" : "status status-warning small";
  }

  function updateSummaryOnPassword() {
    const pass = sharePassword.value.trim();
    const confirm = sharePasswordConfirm.value.trim();
    if (!pass || !confirm) {
      passwordHelper.textContent = "Recipients will need this password to open the Share.";
      return;
    }
    if (pass !== confirm) {
      passwordHelper.textContent = "Passwords do not match. Please make them the same.";
      status.textContent = "Passwords do not match.";
      status.className = "status status-bad small";
      return;
    }
    passwordHelper.textContent = "Recipients will need this password to open the Share.";
    if (pass.length >= 6) {
      passwordHelper.textContent = "Looks good. Recipients will need this password to open the Share.";
    }
    if (status && status.textContent === "Passwords do not match.") {
      status.textContent = "";
    }
  }

  const getClient = () => new GitHubClient({
    owner: githubOwner.value.trim(),
    repo: githubRepo.value.trim(),
    token: githubToken.value.trim(),
  });

  shareDropZone.addEventListener("click", () => shareFilesInput.click());
  shareDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      shareFilesInput.click();
    }
  });
  shareFilesInput.addEventListener("change", () => setFiles(Array.from(shareFilesInput.files || [])));
  shareDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    shareDropZone.classList.add("drop-zone--active");
  });
  shareDropZone.addEventListener("dragleave", () => shareDropZone.classList.remove("drop-zone--active"));
  shareDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    shareDropZone.classList.remove("drop-zone--active");
    setFiles(Array.from(event.dataTransfer.files || []));
    const dt = new DataTransfer();
    for (const file of selectedFiles) {
      dt.items.add(file);
    }
    shareFilesInput.files = dt.files;
  });

  saveConfig.addEventListener("click", () => {
    const payload = {
      owner: githubOwner.value.trim(),
      repo: githubRepo.value.trim(),
    };
    localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(payload));
    setSavedToken(githubToken.value.trim(), rememberToken.checked);
    onNotify("Owner GitHub settings saved.");
  });

  forgetToken.addEventListener("click", () => {
    clearSavedToken();
    githubToken.value = "";
    rememberToken.checked = false;
    setSavedToken("", false);
    onNotify("GitHub credentials have been cleared.");
  });

  rememberToken.addEventListener("change", () => {
    setSavedToken(githubToken.value.trim(), rememberToken.checked);
  });

  githubToken.addEventListener("input", () => {
    setSavedToken(githubToken.value.trim(), rememberToken.checked);
  });

  toggleOwnerToken.addEventListener("click", () => {
    const show = toggleOwnerToken.textContent === "Show";
    toggleOwnerToken.textContent = show ? "Hide" : "Show";
    githubToken.type = show ? "text" : "password";
  });

  toggleSharePassword.addEventListener("click", () => {
    const show = toggleSharePassword.textContent === "Show";
    toggleSharePassword.textContent = show ? "Hide" : "Show";
    sharePassword.type = show ? "text" : "password";
    if (show) {
      sharePassword.focus();
    }
  });

  toggleSharePasswordConfirm.addEventListener("click", () => {
    const show = toggleSharePasswordConfirm.textContent === "Show";
    toggleSharePasswordConfirm.textContent = show ? "Hide" : "Show";
    sharePasswordConfirm.type = show ? "text" : "password";
    if (show) {
      sharePasswordConfirm.focus();
    }
  });

  sharePassword.addEventListener("input", updateSummaryOnPassword);
  sharePasswordConfirm.addEventListener("input", updateSummaryOnPassword);

  clearShareForm.addEventListener("click", () => {
    shareName.value = "Family Photos";
    sharePassword.value = "";
    sharePasswordConfirm.value = "";
    shareFilesInput.value = "";
    selectedFiles = [];
    selectedSummary.textContent = "No files selected";
    renderPasswordError("");
  });

  createShare.addEventListener("click", async () => {
    try {
      if (!selectedFiles.length) {
        renderPasswordError("Select at least one file first.");
        return;
      }
      if (!sharePassword.value.trim()) {
        renderPasswordError("Password is required.");
        return;
      }
      if (sharePassword.value !== sharePasswordConfirm.value) {
        renderPasswordError("Passwords do not match.");
        return;
      }
      if (!githubToken.value.trim()) {
        renderPasswordError("Owner token is required to create a new Share.");
        return;
      }
      const total = selectedFiles.reduce((acc, file) => acc + file.size, 0);
      if (selectedFiles.some((f) => f.size > APP_SINGLE_FILE_BYTES)) {
        renderPasswordError(`Each file must be under ${humanBytes(APP_SINGLE_FILE_BYTES)} for this app version.`);
        return;
      }
      if (total > APP_TOTAL_BYTES) {
        renderPasswordError(`Total upload would exceed ${humanBytes(APP_TOTAL_BYTES)}.`);
        return;
      }

      const client = getClient();
      const dropId = randomId();
      const dropTag = `${DROP_ID_PREFIX}${dropId}`;
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const saltB64 = toBase64(salt);
      const key = await deriveKey(sharePassword.value, saltB64);
      const fileInfos = [];

      progress.textContent = "Encrypting files...";
      for (const file of selectedFiles) {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const encrypted = await encryptBuffer(arrayBuffer, key);
        const encryptedFile = new Blob([fromBase64(encrypted.ciphertext)], {
          type: "application/octet-stream",
        });
        const info = {
          id: randomId(8),
          assetName: `file_${fileInfos.length + 1}_${randomId(6)}.enc`,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          iv: encrypted.iv,
        };
        fileInfos.push({ ...info, blob: encryptedFile });
      }

      const manifest = createDropEnvelope(shareName.value.trim() || "Untitled Share", saltB64, fileInfos.map((file) => {
        const { blob, ...safeInfo } = file;
        return safeInfo;
      }));
      const encryptedManifest = await encryptTextObject(manifest, key);
      const manifestBlob = new Blob([JSON.stringify(encryptedManifest)], { type: "application/json" });
      const releaseName = `${Math.trunc(Date.now() / 1000)}-${shareName.value.trim() || "share"}`;

      progress.textContent = "Creating Share...";
      const release = await client.createRelease(dropTag, releaseName, "Temporary encrypted Share.");
      const uploadUrl = release.upload_url;

      progress.textContent = "Uploading manifest and files...";
      await client.uploadAsset(uploadUrl, `manifest-${dropId}.enc`, manifestBlob, "application/octet-stream");
      for (const file of fileInfos) {
        await client.uploadAsset(uploadUrl, file.assetName, file.blob, "application/octet-stream");
      }

      const shareUrl = shareUrlForId(dropId);
      const details = `Share created.\nShare link: ${shareUrl}\nTag: ${dropTag}\nRepository: ${client.owner}/${client.repo}`;
      onNotify("Share created successfully.");
      window.navigator.clipboard.writeText(details).catch(() => {});
      progress.textContent = "";
      sharePassword.value = "";
      sharePasswordConfirm.value = "";
      shareFilesInput.value = "";
      selectedFiles = [];
      selectedSummary.textContent = "No files selected";
      await listDrops(root, client);
    } catch (error) {
      progress.textContent = "";
      renderPasswordError(error.message || "Failed to create Share.");
    }
  });

  listDrops(root);
}

export async function listDrops(root, providedClient = null) {
  const list = root.querySelector("#dropsList");
  if (!list) return;
  const owner = root.querySelector("#githubOwner")?.value.trim() || DEFAULT_GITHUB_CONFIG.owner;
  const repo = root.querySelector("#githubRepo")?.value.trim() || DEFAULT_GITHUB_CONFIG.repo;
  const token = root.querySelector("#githubToken")?.value.trim() || "";
  const client = providedClient || new GitHubClient({ owner, repo, token });
  list.innerHTML = "<p class='muted small'>Loading Shares…</p>";

  try {
    const releases = await client.listReleases(50);
    const shares = releases
      .filter((release) => release.tag_name && release.tag_name.startsWith(DROP_ID_PREFIX))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!shares.length) {
      list.innerHTML = "<p class='muted small'>No Shares yet.</p>";
      return;
    }
    list.innerHTML = shares
      .map((release) => renderShareCard(client, release))
      .join("");
    list.querySelectorAll("button[data-action='delete-share']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.releaseId;
        if (!window.confirm("Delete this Share permanently?\nThe files will no longer be available through this share.")) {
          return;
        }
        try {
          await client.deleteRelease(id);
          await listDrops(root, client);
        } catch (error) {
          alert(error.message);
        }
      });
    });
    list.querySelectorAll("button[data-action='copy-share']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await window.navigator.clipboard.writeText(btn.dataset.shareUrl);
        renderTemporaryAlert(root, "Link copied");
      });
    });
    list.querySelectorAll("button[data-action='open-share']").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(btn.dataset.url, "_blank", "noopener");
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="status status-bad">Unable to list Shares: ${error.message}</p>`;
  }
}

function renderShareCard(client, release) {
  const id = release.tag_name.replace(DROP_ID_PREFIX, "");
  const age = formatDropAge(release.created_at);
  const shareUrl = shareUrlForId(id);
  return `
    <article class="drop-item">
      <div><strong>${release.name || "Share"}</strong><span class="tag">#${id}</span></div>
      <div class="meta small">
        <span class="status status-ok">active</span>
        <span>Created: ${age}</span>
      </div>
      <div class="small">GitHub release created for this Share.</div>
      <div class="row-actions">
        <button class="btn-plain btn-inline" data-action="copy-share" data-share-url="${shareUrl}">Copy Share Link</button>
        <button class="btn-ghost btn-inline" data-action="open-share" data-url="${shareUrl}">Open Share</button>
        <button class="btn-danger btn-inline" data-action="delete-share" data-release-id="${release.id}">Delete Share</button>
      </div>
    </article>
  `;
}

function renderTemporaryAlert(root, message) {
  const statusArea = root.querySelector("#ownerStatus");
  if (!statusArea) return;
  statusArea.textContent = message;
  statusArea.className = "status status-ok small";
  window.setTimeout(() => {
    if (statusArea.textContent === message) {
      statusArea.textContent = "";
    }
  }, 1800);
}
