import { DEFAULT_GITHUB_CONFIG, DROP_ID_PREFIX, MAX_SINGLE_FILE_BYTES, MAX_TOTAL_BYTES, OWNER_STORAGE_KEY } from "../lib/config.js";
import { GitHubClient } from "../services/github.js";
import { createDropEnvelope, formatDropAge, totalsFromFiles } from "../lib/dropModel.js";
import { randomId, deriveKey, encryptBuffer, readFileAsArrayBuffer, encryptTextObject, toBase64, fromBase64, humanBytes } from "../utils/crypto.js";
import { shareUrlForId, getDropIdFromLocation } from "../utils/routing.js";

function ownerSettings() {
  const raw = localStorage.getItem(OWNER_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_GITHUB_CONFIG, token: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      owner: parsed.owner || DEFAULT_GITHUB_CONFIG.owner,
      repo: parsed.repo || DEFAULT_GITHUB_CONFIG.repo,
      token: parsed.token || "",
    };
  } catch {
    return { ...DEFAULT_GITHUB_CONFIG, token: "" };
  }
}

export function renderOwnerView(root, { setMode, onNotify }) {
  root.innerHTML = `
    <h2 class="section-title">Owner dashboard</h2>
    <p class="muted small">Share only temporary encrypted drops. Passwords never leave the browser.</p>
    <div class="grid">
      <section class="grid">
        <h3>GitHub config</h3>
        <div class="field-grid">
          <div class="field"><label for="githubOwner">GitHub owner</label><input id="githubOwner" type="text" value="${DEFAULT_GITHUB_CONFIG.owner}" /></div>
          <div class="field"><label for="githubRepo">GitHub repository</label><input id="githubRepo" type="text" value="${DEFAULT_GITHUB_CONFIG.repo}" /></div>
          <div class="field"><label for="githubToken">GitHub token (owner only)</label><input id="githubToken" type="password" autocomplete="off" placeholder="Store token locally only" /></div>
        </div>
        <div class="button-row">
          <button id="saveConfig" class="btn-primary">Save config</button>
          <button id="refreshDrops" class="btn-plain btn-inline">Refresh drops</button>
        </div>
      </section>

      <section class="grid">
        <h3>Create new Drop</h3>
        <div class="inline-note">Temporary file exchange</div>
        <div class="field-grid">
          <div class="field"><label for="dropName">Drop name</label><input id="dropName" type="text" value="Family Photos" /></div>
          <div class="field"><label for="dropPassword">Password</label><input id="dropPassword" type="password" autocomplete="new-password" /></div>
          <div class="field"><label for="dropFiles">Files</label><input id="dropFiles" type="file" multiple /></div>
        </div>
        <div class="inline-note small">Files are encrypted in your browser before upload using a password-derived key.</div>
        <div class="progress" id="createProgress" aria-live="polite"></div>
        <div class="button-row">
          <button id="createDrop" class="btn-secondary">Create Drop</button>
          <button id="clearDropForm" class="btn-ghost">Clear</button>
        </div>
      </section>

      <section class="grid">
        <h3>Your Drops</h3>
        <div id="dropsList" class="drop-list"></div>
      </section>
    </div>
  `;

  const githubOwner = root.querySelector("#githubOwner");
  const githubRepo = root.querySelector("#githubRepo");
  const githubToken = root.querySelector("#githubToken");
  const saveConfig = root.querySelector("#saveConfig");
  const refreshDrops = root.querySelector("#refreshDrops");
  const createDrop = root.querySelector("#createDrop");
  const clearDropForm = root.querySelector("#clearDropForm");
  const dropName = root.querySelector("#dropName");
  const dropPassword = root.querySelector("#dropPassword");
  const dropFiles = root.querySelector("#dropFiles");
  const progress = root.querySelector("#createProgress");

  const settings = ownerSettings();
  githubOwner.value = settings.owner;
  githubRepo.value = settings.repo;
  githubToken.value = settings.token;

  const getClient = () => new GitHubClient({
    owner: githubOwner.value.trim(),
    repo: githubRepo.value.trim(),
    token: githubToken.value.trim(),
  });

  saveConfig.addEventListener("click", () => {
    const payload = {
      owner: githubOwner.value.trim(),
      repo: githubRepo.value.trim(),
      token: githubToken.value.trim(),
    };
    localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(payload));
    onNotify("Owner GitHub settings saved.");
  });

  clearDropForm.addEventListener("click", () => {
    dropName.value = "Family Photos";
    dropPassword.value = "";
    dropFiles.value = "";
  });

  refreshDrops.addEventListener("click", () => {
    listDrops(root);
  });

  createDrop.addEventListener("click", async () => {
    try {
      const selected = Array.from(dropFiles.files || []);
      if (!selected.length) {
        onNotify("Select at least one file first.");
        return;
      }
      if (!dropPassword.value.trim()) {
        onNotify("Password is required.");
        return;
      }
      const tokenMissing = !githubToken.value.trim();
      if (tokenMissing) {
        onNotify("Owner token is required to create a new Drop.");
        return;
      }
      const total = selected.reduce((acc, file) => acc + file.size, 0);
      if (selected.some((f) => f.size > MAX_SINGLE_FILE_BYTES)) {
        onNotify(`Each file must be under ${humanBytes(MAX_SINGLE_FILE_BYTES)} for this app version.`);
        return;
      }
      if (total > MAX_TOTAL_BYTES) {
        onNotify(`Total upload would exceed ${humanBytes(MAX_TOTAL_BYTES)}.`);
        return;
      }

      const client = getClient();
      const dropId = randomId();
      const dropTag = `${DROP_ID_PREFIX}${dropId}`;
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const saltB64 = toBase64(salt);
      const key = await deriveKey(dropPassword.value, saltB64);
      const fileInfos = [];
      progress.textContent = "Encrypting files...";
      for (const file of selected) {
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

      const manifest = createDropEnvelope(dropName.value.trim() || "Untitled Drop", saltB64, fileInfos.map((file) => {
        const { blob, ...safeInfo } = file;
        return safeInfo;
      }));
      const encryptedManifest = await encryptTextObject(manifest, key);
      const manifestBlob = new Blob([JSON.stringify(encryptedManifest)], { type: "application/json" });
      const releaseName = `${Math.trunc(Date.now() / 1000)}-${dropName.value.trim() || "drop"}`;

      progress.textContent = "Creating release...";
      const release = await client.createRelease(dropTag, releaseName, "Temporary encrypted drop.");
      const uploadUrl = release.upload_url;

      progress.textContent = "Uploading manifest and files...";
      await client.uploadAsset(uploadUrl, `manifest-${dropId}.enc`, manifestBlob, "application/octet-stream");
      for (const file of fileInfos) {
        await client.uploadAsset(uploadUrl, file.assetName, file.blob, "application/octet-stream");
      }

      const shareUrl = shareUrlForId(dropId);
      const details = `Drop created.
Share link: ${shareUrl}
Tag: ${dropTag}
Repository location: ${client.owner}/${client.repo}`;
      onNotify("Drop created successfully.");
      window.navigator.clipboard.writeText(details).catch(() => {});
      progress.textContent = "";
      dropPassword.value = "";
      dropFiles.value = "";
      await listDrops(root, client);
    } catch (error) {
      console.error(error);
      progress.textContent = "";
      onNotify(error.message || "Failed to create drop.");
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
  list.innerHTML = "<p class='muted small'>Loading drops…</p>";

  try {
    const releases = await client.listReleases(50);
    const drops = releases
      .filter((release) => release.tag_name && release.tag_name.startsWith(DROP_ID_PREFIX))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!drops.length) {
      list.innerHTML = "<p class='muted small'>No drops found yet.</p>";
      return;
    }
    list.innerHTML = drops
      .map((release) => renderDropCard(client, release))
      .join("");
    list.querySelectorAll("button[data-action='delete-drop']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.releaseId;
        if (!window.confirm("Delete this Drop permanently?\nThe files will no longer be available through this share.")) {
          return;
        }
        try {
          await client.deleteRelease(id);
          await listDrops(root, client);
          const ownerView = root.querySelector("#owner-view");
          ownerView?.dispatchEvent(new CustomEvent("notify", { detail: "Drop deleted." }));
        } catch (error) {
          list.classList.add("status-bad");
          alert(error.message);
        }
      });
    });
    list.querySelectorAll("button[data-action='copy-share']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const shareUrl = btn.dataset.shareUrl;
        await window.navigator.clipboard.writeText(shareUrl);
        alert("Link copied");
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="status status-bad">Unable to list drops: ${error.message}</p>`;
  }
}

function renderDropCard(client, release) {
  const id = release.tag_name.replace(DROP_ID_PREFIX, "");
  const age = formatDropAge(release.created_at);
  const shareUrl = shareUrlForId(id);
  const location = `https://github.com/${client.owner}/${client.repo}/releases/tag/${encodeURIComponent(release.tag_name)}`;
  return `
    <div class="drop-item">
      <div><strong>${release.name || "Drop"}</strong><span class="tag">#${id}</span></div>
      <div class="meta small">
        <span class="status status-ok">active</span>
        <span>Created: ${age}</span>
        <span>Storage: <a href="${location}" target="_blank" rel="noreferrer">GitHub release</a></span>
      </div>
      <div class="small">${release.body || ""}</div>
      <div class="row-actions">
        <button class="btn-plain btn-inline" data-action="copy-share" data-share-url="${shareUrl}">Copy Share Link</button>
        <button class="btn-ghost btn-inline" data-action="open-drop" data-url="${shareUrl}" data-release-url="${location}">Open Drop</button>
        <button class="btn-danger btn-inline" data-action="delete-drop" data-release-id="${release.id}">Delete</button>
      </div>
    </div>
  `;
}
