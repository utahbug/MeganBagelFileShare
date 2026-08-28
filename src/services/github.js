const API_BASE = "https://api.github.com";
const UPLOAD_BASE = "https://uploads.github.com";

export class GitHubClient {
  constructor({ owner, repo, token }) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  headers(authOnly = false) {
    const headers = {
      Accept: "application/vnd.github+json",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (authOnly) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  async request(url, init = {}) {
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await safeJson(response);
      const message = body?.message || `Request failed ${response.status}`;
      throw new Error(message);
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  async createRelease(tagName, name, description) {
    return this.request(`${API_BASE}/repos/${this.owner}/${this.repo}/releases`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        tag_name: tagName,
        name,
        body: description,
        draft: false,
        prerelease: false,
      }),
    });
  }

  async getReleaseByTag(tagName) {
    return this.request(`${API_BASE}/repos/${this.owner}/${this.repo}/releases/tags/${encodeURIComponent(tagName)}`);
  }

  async listReleases(perPage = 20) {
    return this.request(`${API_BASE}/repos/${this.owner}/${this.repo}/releases?per_page=${perPage}`);
  }

  async uploadAsset(uploadUrl, assetName, blob, contentType) {
    const url = `${uploadUrl.replace("{?name,label}", "")}?name=${encodeURIComponent(assetName)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: this.token ? `Bearer ${this.token}` : "",
        "Content-Type": contentType,
      },
      body: blob,
    });
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body?.message || "Failed to upload asset.");
    }
    return response.json();
  }

  async deleteRelease(releaseId) {
    return this.request(`${API_BASE}/repos/${this.owner}/${this.repo}/releases/${releaseId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }
}

export function stripEmpty(str) {
  return (str || "").trim();
}

function cleanText(str) {
  return (str || "").trim();
}

function safeJson(response) {
  return response
    .json()
    .catch(() => ({}))
    .then((value) => ({ ...value, status: response.status }));
}

