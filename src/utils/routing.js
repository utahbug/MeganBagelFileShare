import { DROP_ID_PREFIX } from "./../lib/config.js";

export function getDropIdFromLocation() {
  if (typeof window === "undefined" || !window?.location) {
    return null;
  }
  const p = window.location.pathname.replace(/\/+$/, "");
  const match = /\/drop\/([^/]+)$/.exec(p);
  if (match) {
    return match[1];
  }
  const q = new URLSearchParams(window.location.search).get("d");
  if (q && /^[A-Za-z0-9]+$/.test(q)) {
    return q;
  }
  return null;
}

export function shareUrlForId(id) {
  if (typeof window === "undefined") {
    return `/drop/${id}`;
  }
  const base = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "");
  const separator = window.location.pathname.includes("/drop/") ? "" : "/";
  return `${window.location.origin}${base}${separator}/drop/${id}`;
}

export function dropRouteUrl(owner, repo, id) {
  return `https://github.com/${owner}/${repo}/releases/tag/${DROP_ID_PREFIX}${id}`;
}
