import { DEFAULT_GITHUB_CONFIG } from "../lib/config.js";
import { GitHubClient } from "../services/github.js";
import { deriveKey, decryptTextObject, decryptBuffer, humanBytes, toBase64 } from "../utils/crypto.js";
import { getDropIdFromLocation } from "../utils/routing.js";
import { formatDropAge } from "../lib/dropModel.js";

export async function renderRecipientView(root, { onNotify }) {
  const dropId = getDropIdFromLocation();
  if (!dropId) {
    root.classList.add("hidden");
    return;
  }

  const tagName = `mbs-drop-${dropId}`;
  root.innerHTML = `
    <h2 class="section-title">Files Sent to You</h2>
    <p class="inline-note">These files are intended for temporary transfer.<br />Enter the password provided by the sender.</p>
    <div class="grid" id="recipientGate">
      <label for="dropPassword">Password</label>
      <div class="inline-input-row">
        <input id="dropPassword" type="password" autocomplete="new-password" />
        <button id="toggleRecipientPassword" class="btn-plain btn-inline" type="button">Show</button>
      </div>
      <div class="button-row">
        <button id="unlockDrop" class="btn-primary">Open Files</button>
      </div>
      <p class="small" id="recipientStatus" aria-live="polite"></p>
    </div>
    <div id="contentArea" class="hidden">
      <div id="dropHeader"></div>
      <div id="manifestArea" class="files"></div>
      <div class="button-row">
        <button id="downloadAll" class="btn-secondary">Save All Files</button>
      </div>
    </div>
  `;

  const passwordInput = root.querySelector("#dropPassword");
  const unlockDrop = root.querySelector("#unlockDrop");
  const toggleRecipientPassword = root.querySelector("#toggleRecipientPassword");
  const recipientStatus = root.querySelector("#recipientStatus");
  const contentArea = root.querySelector("#contentArea");
  const dropHeader = root.querySelector("#dropHeader");
  const manifestArea = root.querySelector("#manifestArea");

  const client = new GitHubClient({ owner: DEFAULT_GITHUB_CONFIG.owner, repo: DEFAULT_GITHUB_CONFIG.repo, token: "" });

  let manifest = null;
  let decryptedFiles = [];

  toggleRecipientPassword.addEventListener("click", () => {
    const show = toggleRecipientPassword.textContent === "Show";
    toggleRecipientPassword.textContent = show ? "Hide" : "Show";
    passwordInput.type = show ? "text" : "password";
  });

  unlockDrop.addEventListener("click", async () => {
    const password = passwordInput.value;
    if (!password) {
      recipientStatus.textContent = "Enter the recipient password first.";
      return;
    }
    recipientStatus.textContent = "Opening files…";
    manifest = null;
    try {
      const release = await client.getReleaseByTag(tagName);
      if (!release?.assets?.length) {
        throw new Error("This file link is not available.");
      }
      const manifestAsset = release.assets.find((asset) => asset.name.startsWith("manifest-") && asset.name.endsWith(".enc"));
      if (!manifestAsset) {
        throw new Error("File package details are missing.");
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
        throw new Error("No files were found in this package.");
      }
      manifest = decrypted;

      const totalBytes = manifest.files.reduce((acc, item) => acc + (item.size || 0), 0);
      const age = formatDropAge(manifest.createdAt);
      dropHeader.innerHTML = `
        <p><strong>${manifest.name}</strong></p>
        <p class="small">These files are intended for temporary transfer.</p>
        <p class="small">${manifest.files.length} files · ${humanBytes(totalBytes)} · ${age}</p>
      `;
      manifestArea.innerHTML = manifest.files
        .map((file) => {
          const isImage = (file.mimeType || "").startsWith("image/");
          return `<article class="file-row">
            <p class="file-name">${escapeHtml(file.originalName || "Unnamed file")}</p>
            <p class="small">${humanBytes(file.size || 0)} · ${file.mimeType || "application/octet-stream"}</p>
            <div class="row-actions">
              <button class="btn-primary btn-inline" data-action="download-file" data-file="${file.id}">Save This File</button>
              ${isImage ? `<button class="btn-ghost btn-inline" data-action="copy-file" data-file="${file.id}">Copy Image</button>` : ""}
            </div>
          </article>`;
        })
        .join("");

      decryptedFiles = manifest.files.map((file) => ({
        ...file,
        asset: release.assets.find((asset) => asset.name === file.assetName),
      })).filter((entry) => entry.asset);
      recipientStatus.textContent = "Files unlocked.";
      contentArea.classList.remove("hidden");
    } catch (error) {
      recipientStatus.textContent = `Unable to open files: ${error.message}`;
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
    onNotify?.("Saving all files.");
  });
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
