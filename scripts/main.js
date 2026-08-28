import { getDropIdFromLocation } from "../src/utils/routing.js";
import { renderOwnerView, listDrops } from "../src/components/owner.js";
import { renderRecipientView } from "../src/components/recipient.js";

const ownerView = document.querySelector("#owner-view");
const recipientView = document.querySelector("#recipient-view");
const notifier = createNotifier();

function createNotifier() {
  let live = null;
  return (message) => {
    if (!message) return;
    if (live) {
      clearTimeout(live.t);
    }
    const area = document.createElement("p");
    area.className = "inline-note";
    area.textContent = message;
    area.dataset.owner = "flash";
    const target = ownerView || recipientView;
    const existing = target?.querySelector("[data-owner='flash']");
    if (existing) existing.remove();
    target?.prepend(area);
    live = { t: window.setTimeout(() => area.remove(), 2200) };
  };
}

function setMode(mode) {
  if (mode === "recipient") {
    ownerView.classList.add("hidden");
    recipientView.classList.remove("hidden");
    return;
  }
  ownerView.classList.remove("hidden");
  recipientView.classList.add("hidden");
}

function bootstrap() {
  const dropId = getDropIdFromLocation();
  if (dropId) {
    setMode("recipient");
    renderRecipientView(recipientView, { setMode, onNotify: notifier });
    ownerView.classList.add("hidden");
  } else {
    setMode("owner");
    renderOwnerView(ownerView, { setMode, onNotify: notifier });
  }
}

window.addEventListener("DOMContentLoaded", bootstrap);

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ownerView && !ownerView.classList.contains("hidden")) {
    listDrops(ownerView).catch(() => {});
  }
});

