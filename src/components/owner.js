import {
  DEFAULT_GITHUB_CONFIG,
  DROP_ID_PREFIX,
  APP_SINGLE_FILE_BYTES,
  APP_TOTAL_BYTES,
  OWNER_STORAGE_KEY,
  TOKEN_SESSION_KEY,
  TOKEN_REMEMBER_KEY,
} from "../lib/config.js";
import { GitHubApiError, GitHubClient } from "../services/github.js";
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
    return { owner: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.owner), repo: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.repo) };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      owner: sanitizeRepoField(parsed.owner || DEFAULT_GITHUB_CONFIG.owner),
      repo: sanitizeRepoField(parsed.repo || DEFAULT_GITHUB_CONFIG.repo),
    };
  } catch {
    return { owner: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.owner), repo: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.repo) };
  }
}

function sanitizeRepoField(value) {
  return (value || "").trim();
}

function expectedRepository() {
  return {
    owner: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.owner),
    repo: sanitizeRepoField(DEFAULT_GITHUB_CONFIG.repo),
  };
}

function formatGitHubError(error) {
  if (!(error instanceof GitHubApiError)) {
    return error?.message || "GitHub request failed.";
  }
  const docs = error.documentationUrl ? ` Docs: ${error.documentationUrl}` : "";
  const acceptedScopes = error.headers?.acceptedOauthScopes ? ` Accepted scopes: ${error.headers.acceptedOauthScopes}` : "";
  const grantedScopes = error.headers?.oauthScopes ? ` Granted scopes: ${error.headers.oauthScopes}` : "";
  return `GitHub could not ${error.operation} (HTTP ${error.status}). Repository: ${DEFAULT_GITHUB_CONFIG.owner}/${DEFAULT_GITHUB_CONFIG.repo}. Endpoint: ${error.endpoint}. ${error.message || "No response message."}.${docs}${acceptedScopes}${grantedScopes}`;
}

function setOwnerRepoValidation(owner, repo) {
  const expected = expectedRepository();
  const target = `${expected.owner}/${expected.repo}`;
  const configured = `${owner}/${repo}`;
  if (configured !== target) {
    throw new Error(`Repository is ${configured}. This app sends links from ${target}.`);
  }
  return { owner: expected.owner, repo: expected.repo };
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
    <h2 class="section-title">Send Files to Someone</h2>
    <p class="muted small">Add files, create a password, and send the link to the person receiving them.</p>

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
          <p class="small muted">This token is used when creating links and deleting online files.</p>
        </div>
        <div class="field">
          <label><input id="rememberToken" type="checkbox" /> Remember token on this device</label>
          <p class="small muted">Optional: keeps the token in this browser only.</p>
        </div>
        <div class="field"><button id="forgetToken" class="btn-plain btn-inline">Forget token settings</button></div>
        <div class="field">
          <div class="button-row">
            <button id="saveConfig" class="btn-primary">Save settings</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card">
      <h3>Send Files</h3>
      <p id="storageLimitNotice" class="small muted">Up to ${humanBytes(APP_SINGLE_FILE_BYTES)} per file and ${humanBytes(APP_TOTAL_BYTES)} total.</p>
      <details class="small">
        <summary>About file limits</summary>
        <p class="muted">Files are grouped and sent as a single temporary online transfer.</p>
      </details>
      <div class="field-grid">
        <div class="field">
          <label for="shareName">Name this file group</label>
          <input id="shareName" type="text" value="Family Photos" />
        </div>
        <div class="field">
          <label for="sharePassword">Create a password</label>
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
          <p id="passwordHelper" class="small muted" role="status" aria-live="polite">Give this password to the person receiving the files.</p>
        </div>
        <div class="field">
          <label for="shareFilesInput">Add files</label>
          <div id="shareDropZone" class="drop-zone" role="button" tabindex="0" aria-label="Add files">
            <p class="drop-zone-title">Drop files here or choose files</p>
            <p class="small muted" id="selectedFileSummary">No files selected</p>
          </div>
          <input id="shareFilesInput" type="file" multiple class="hidden-file-input" />
        </div>
      </div>

      <div class="inline-note small">Files are encrypted in your browser before they are sent.<br />Your password is not stored with the files.</div>
      <p id="ownerStatus" class="status status-warning small" role="alert" aria-live="polite"></p>
      <div class="progress" id="createProgress" aria-live="polite"></div>
      <div class="button-row">
        <button id="createShare" class="btn-primary">Create Link</button>
        <button id="clearShareForm" class="btn-plain">Clear</button>
      </div>
    </section>

    <section class="section-card">
      <h3>Files You Are Sharing</h3>
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
      passwordHelper.textContent = "Give this password to the person receiving the files.";
      return;
    }
    if (pass !== confirm) {
      passwordHelper.textContent = "The passwords do not match.";
      status.textContent = "Passwords do not match.";
      status.className = "status status-bad small";
      return;
    }
    passwordHelper.textContent = "Give this password to the person receiving the files.";
    if (pass.length >= 6) {
      passwordHelper.textContent = "Give this password to the person receiving the files.";
    }
    if (status && status.textContent === "Passwords do not match.") {
      status.textContent = "";
    }
  }

  let validatedClient = null;
  const getClient = () =>
    new GitHubClient({
      owner: sanitizeRepoField(githubOwner.value),
      repo: sanitizeRepoField(githubRepo.value),
      token: githubToken.value.trim(),
    });
  const resolveOwnerRepo = () =>
    setOwnerRepoValidation(sanitizeRepoField(githubOwner.value), sanitizeRepoField(githubRepo.value));
  const verifyConnection = async () => {
    const { owner, repo } = resolveOwnerRepo();
    const client = new GitHubClient({ owner, repo, token: githubToken.value.trim() });
    await client.getRepo(owner, repo);
    return client;
  };

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

  saveConfig.addEventListener("click", async () => {
    try {
      const payload = {
        owner: sanitizeRepoField(githubOwner.value),
        repo: sanitizeRepoField(githubRepo.value),
      };
      resolveOwnerRepo();
      const client = await verifyConnection();
      localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(payload));
      setSavedToken(githubToken.value.trim(), rememberToken.checked);
      onNotify(`GitHub connection ready.`);
      validatedClient = client;
    } catch (error) {
      renderPasswordError(formatGitHubError(error));
    }
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
        renderPasswordError("Add at least one file.");
        return;
      }
      if (!sharePassword.value.trim()) {
        renderPasswordError("Enter a password.");
        return;
      }
      if (sharePassword.value !== sharePasswordConfirm.value) {
        renderPasswordError("The passwords do not match.");
        return;
      }
      if (!githubToken.value.trim()) {
        renderPasswordError("A token is required to create the link.");
        return;
      }
      const total = selectedFiles.reduce((acc, file) => acc + file.size, 0);
      if (selectedFiles.some((f) => f.size > APP_SINGLE_FILE_BYTES)) {
        renderPasswordError(`Each file must be under ${humanBytes(APP_SINGLE_FILE_BYTES)} for this app version.`);
        return;
      }
      if (total > APP_TOTAL_BYTES) {
        renderPasswordError(`Total send size would exceed ${humanBytes(APP_TOTAL_BYTES)}.`);
        return;
      }

      if (!validatedClient) {
        validatedClient = await verifyConnection();
      }
      const client = getClient();
      const dropId = randomId();
      const dropTag = `${DROP_ID_PREFIX}${dropId}`;
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const saltB64 = toBase64(salt);
      const key = await deriveKey(sharePassword.value, saltB64);
      const fileInfos = [];

      progress.textContent = "Preparing files...";
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

      const manifest = createDropEnvelope(shareName.value.trim() || "Untitled file group", saltB64, fileInfos.map((file) => {
        const { blob, ...safeInfo } = file;
        return safeInfo;
      }));
      const encryptedManifest = await encryptTextObject(manifest, key);
      const manifestBlob = new Blob([JSON.stringify(encryptedManifest)], { type: "application/json" });
      const releaseName = `${Math.trunc(Date.now() / 1000)}-${shareName.value.trim() || "share"}`;

      progress.textContent = "Creating link...";
      const release = await client.createRelease(dropTag, releaseName, "Temporary encrypted file group.");
      const uploadUrl = release.upload_url;

      progress.textContent = "Sending files...";
      await client.uploadAsset(uploadUrl, `manifest-${dropId}.enc`, manifestBlob, "application/octet-stream");
      for (const file of fileInfos) {
        await client.uploadAsset(uploadUrl, file.assetName, file.blob, "application/octet-stream");
      }

      const shareUrl = shareUrlForId(dropId);
      const details = `Copy Link for Recipient:\n${shareUrl}`;
      onNotify("Link created.");
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
      renderPasswordError(formatGitHubError(error) || "Failed to create link.");
    }
  });

  listDrops(root);
}

export async function listDrops(root, providedClient = null) {
  const list = root.querySelector("#dropsList");
  if (!list) return;
  const ownerValue = sanitizeRepoField(root.querySelector("#githubOwner")?.value || "");
  const repoValue = sanitizeRepoField(root.querySelector("#githubRepo")?.value || "");
  const token = root.querySelector("#githubToken")?.value.trim() || "";
  let owner;
  let repo;
  try {
    ({ owner, repo } = setOwnerRepoValidation(ownerValue, repoValue));
  } catch (error) {
    list.innerHTML = `<p class="status status-bad">Unable to load online files: ${error.message || error}</p>`;
    return;
  }
  const client = providedClient || new GitHubClient({ owner, repo, token });
  list.innerHTML = "<p class='muted small'>Loading your file groups…</p>";

  try {
    const releases = await client.listReleases(50);
    const shares = releases
      .filter((release) => release.tag_name && release.tag_name.startsWith(DROP_ID_PREFIX))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!shares.length) {
      list.innerHTML = "<p class='muted small'>No files are currently online.</p>";
      return;
    }
    list.innerHTML = shares
      .map((release) => renderShareCard(client, release))
      .join("");
    list.querySelectorAll("button[data-action='delete-share']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.releaseId;
        if (!window.confirm("Delete these online files permanently?\nThey will no longer be available.")) {
          return;
        }
        try {
          await client.deleteRelease(id);
          await listDrops(root, client);
        } catch (error) {
          alert(formatGitHubError(error));
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
    list.innerHTML = `<p class="status status-bad">Unable to load online files: ${formatGitHubError(error)}</p>`;
  }
}

function renderShareCard(client, release) {
  const id = release.tag_name.replace(DROP_ID_PREFIX, "");
  const age = formatDropAge(release.created_at);
  const shareUrl = shareUrlForId(id);
  return `
    <article class="drop-item">
      <div><strong>${release.name || "File group"}</strong><span class="tag">#${id}</span></div>
      <div class="meta small">
        <span class="status status-ok">online</span>
        <span>Created: ${age}</span>
      </div>
      <div class="small">Still online after 7 days — delete when the transfer is complete.</div>
      <div class="row-actions">
        <button class="btn-plain btn-inline" data-action="copy-share" data-share-url="${shareUrl}">Copy Link for Recipient</button>
        <button class="btn-ghost btn-inline" data-action="open-share" data-url="${shareUrl}">Open</button>
        <button class="btn-danger btn-inline" data-action="delete-share" data-release-id="${release.id}">Delete Online Files</button>
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
