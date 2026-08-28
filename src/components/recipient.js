import { DEFAULT_GITHUB_CONFIG } from "../lib/config.js";
import { GitHubClient } from "../services/github.js";
import { deriveKey, decryptTextObject, decryptBuffer, humanBytes, toBase64 } from "../utils/crypto.js";
import { getDropIdFromLocation } from "../utils/routing.js";
import { formatDropAge } from "../lib/dropModel.js";

export async function renderRecipientView(root, { setMode, onNotify }) {
  const dropId = getDropIdFromLocation();
  if (!dropId) {
    root.classList.add("hidden");
    return;
  }

  const tagName = `mbs-drop-${dropId}`;
  root.innerHTML = `
    <h2 class="section-title">Secure drop access</h2>
    <p class="inline-note">
      Temporary file exchange<br />
      Files are password-protected for convenience but should not be considered completely secure. Download the files you need and avoid leaving sensitive material online longer than necessary.
    </p>
    <div class="grid" id="recipientGate">
      <label for="dropPassword">Drop password</label>
      <input id="dropPassword" type="password" autocomplete="new-password" />
      <div class="button-row">
        <button id="unlockDrop" class="btn-primary">Unlock drop</button>
        <button id="openOwnerMode" class="btn-plain btn-inline">Owner mode</button>
      </div>
      <p class="muted small">If this is your own drop, use Owner Mode for link management and deletion.</p>
      <p class="small" id="recipientStatus" aria-live="polite"></p>
    </div>
    <div id="contentArea" class="hidden">
      <div id="dropHeader"></div>
      <div id="manifestArea" class="files"></div>
      <div class="button-row">
        <button id="downloadAll" class="btn-secondary">Download all</button>
      </div>
    </div>
  `;

  const passwordInput = root.querySelector("#dropPassword");
  const unlockDrop = root.querySelector("#unlockDrop");
  const openOwnerMode = root.querySelector("#openOwnerMode");
  const recipientStatus = root.querySelector("#recipientStatus");
  const contentArea = root.querySelector("#contentArea");
  const dropHeader = root.querySelector("#dropHeader");
  const manifestArea = root.querySelector("#manifestArea");

  const client = new GitHubClient({ owner: DEFAULT_GITHUB_CONFIG.owner, repo: DEFAULT_GITHUB_CONFIG.repo, token: "" });

  let manifest = null;
  let decryptedFiles = [];

  unlockDrop.addEventListener("click", async () => {
    const password = passwordInput.value;
    recipientStatus.textContent = "Unlocking…";
    manifest = null;
    try {
      const release = await client.getReleaseByTag(tagName);
      if (!release?.assets?.length) {
        throw new Error("Drop not found or expired.");
      }
      const manifestAsset = release.assets.find((asset) => asset.name.startsWith("manifest-") && asset.name.endsWith(".enc"));
      if (!manifestAsset) {
        throw new Error("Drop manifest missing.");
      }

      const manifestPayload = await fetch(manifestAsset.browser_download_url).then((response) => {
        if (!response.ok) {
          throw new Error("Could not load encrypted manifest.");
        }
        return response.json();
      });
      const manifestKey = await deriveKey(password, manifestPayload.salt);
      const decrypted = await decryptTextObject(manifestPayload, manifestKey);
      if (!decrypted?.files?.length || !decrypted.salt) {
        throw new Error("Manifest has no files.");
      }
      manifest = decrypted;

      const totalBytes = manifest.files.reduce((acc, item) => acc + (item.size || 0), 0);
      const age = formatDropAge(manifest.createdAt);
      dropHeader.innerHTML = `
        <p><strong>${manifest.name}</strong></p>
        <p class="small">Temporary storage — delete after successful transfer.</p>
        <p class="small">${manifest.files.length} files · ${humanBytes(totalBytes)} · ${age}</p>
      `;
      manifestArea.innerHTML = manifest.files
        .map((file) => {
          const isImage = (file.mimeType || "").startsWith("image/");
          return `<article class="file-row">
            <p class="file-name">${escapeHtml(file.originalName || "Unnamed file")}</p>
            <p class="small">${humanBytes(file.size || 0)} · ${file.mimeType || "application/octet-stream"}</p>
            <label class="small"><input type="checkbox" class="file-select" data-file="${file.id}" checked /> include</label>
            <div class="row-actions">
              <button class="btn-primary btn-inline" data-action="download-file" data-file="${file.id}">Download</button>
              ${isImage ? `<button class="btn-ghost btn-inline" data-action="copy-file" data-file="${file.id}">Copy image</button>` : ""}
            </div>
          </article>`;
        })
        .join("");

      decryptedFiles = manifest.files.map((file) => ({
        ...file,
        asset: release.assets.find((asset) => asset.name === file.assetName),
      })).filter((entry) => entry.asset);
      recipientStatus.textContent = "Drop unlocked.";
      contentArea.classList.remove("hidden");
    } catch (error) {
      recipientStatus.textContent = "";
      alert(`Unable to unlock: ${error.message}`);
    }
  });

  manifestArea.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const fileId = target.dataset.file;
    if (!fileId || !manifest) {
      return;
    }
    const action = target.dataset.action;
    const file = manifest.files.find((entry) => entry.id === fileId);
    const released = decryptedFiles.find((entry) => entry.id === fileId);
    if (!file || !released) {
      return;
    }
    const encryptedBytes = new Uint8Array(await fetch(released.asset.browser_download_url).then((response) => response.arrayBuffer()));
    const key = await deriveKey(passwordInput.value, manifest.salt);
    const plain = await decryptBuffer({ iv: file.iv, ciphertext: toBase64(encryptedBytes) }, key);
    const blob = new Blob([plain], { type: file.mimeType || "application/octet-stream" });
    const fileName = file.originalName || `file-${fileId}`;

    if (action === "download-file") {
      downloadBlob(blob, fileName);
      return;
    }

    if (action === "copy-file" && window.navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ [blob.type]: blob });
      await window.navigator.clipboard.write([item]);
      onNotify("Image copied");
    }
  });

  root.querySelector("#downloadAll").addEventListener("click", async () => {
    if (!manifest) return;
    const filesToDownload = manifest.files;
    for (const file of filesToDownload) {
      const btn = root.querySelector(`button[data-action="download-file"][data-file="${file.id}"]`);
      btn?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  });

  openOwnerMode.addEventListener("click", () => setMode("owner"));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download.bin";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

