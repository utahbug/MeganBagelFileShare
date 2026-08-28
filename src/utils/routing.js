import { DROP_ID_PREFIX } from "./../lib/config.js";

export function getDropIdFromLocation() {
  if (typeof window === "undefined" || !window?.location) {
    return null;
  }

  const p = window.location.pathname.replace(/\/+$/, "");
  const shareMatch = /\/share\/([^/]+)$/.exec(p);
  if (shareMatch) {
    return shareMatch[1];
  }

  const legacyDropMatch = /\/drop\/([^/]+)$/.exec(p);
  if (legacyDropMatch) {
    return legacyDropMatch[1];
  }

  const q = new URLSearchParams(window.location.search).get("d");
  if (q && /^[A-Za-z0-9]+$/.test(q)) {
    return q;
  }

  return null;
}

export function shareUrlForId(id) {
  if (typeof window === "undefined") {
    return `/share/${id}`;
  }
  const base = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "");
  return `${window.location.origin}${base}/share/${id}`;
}

export function dropRouteUrl(owner, repo, id) {
  return `https://github.com/${owner}/${repo}/releases/tag/${DROP_ID_PREFIX}${id}`;
}

