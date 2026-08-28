const API_BASE = "https://api.github.com";

function safeJson(response) {
  return response
    .json()
    .catch(() => ({}))
    .then((value) => ({ ...value, status: response.status }));
}

function requestPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search ? parsed.search : ""}`;
  } catch {
    return url;
  }
}

function permissionHeaders(response) {
  const accepted = response.headers.get("x-accepted-oauth-scopes");
  const scopes = response.headers.get("x-oauth-scopes");
  return {
    acceptedOauthScopes: accepted || "not provided",
    oauthScopes: scopes || "not provided",
  };
}

export class GitHubApiError extends Error {
  constructor({
    operation,
    status,
    endpoint,
    message,
    documentationUrl,
    headers,
    method,
    body,
  }) {
    super(message || "GitHub request failed.");
    this.name = "GitHubApiError";
    this.operation = operation || "GitHub request";
    this.status = status;
    this.endpoint = endpoint;
    this.documentationUrl = documentationUrl || "";
    this.method = method || "GET";
    this.headers = headers || {};
    this.body = body || {};
  }
}

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

  async request(url, init = {}, operation = "GitHub request", expectJson = true) {
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await safeJson(response);
      throw new GitHubApiError({
        operation,
        status: response.status,
        endpoint: requestPath(url),
        message: body?.message || `Request failed with status ${response.status}`,
        documentationUrl: body?.documentation_url || "",
        headers: permissionHeaders(response),
        method: init?.method || "GET",
        body,
      });
    }
    if (response.status === 204) {
      return null;
    }
    if (!expectJson) {
      return response;
    }
    return response.json();
  }

  async getRepo(owner = this.owner, repo = this.repo) {
    return this.request(
      `${API_BASE}/repos/${owner}/${repo}`,
      { method: "GET", headers: this.headers(true) },
      `Get repository ${owner}/${repo}`,
    );
  }

  async createRelease(tagName, name, description) {
    return this.request(
      `${API_BASE}/repos/${this.owner}/${this.repo}/releases`,
      {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({
          tag_name: tagName,
          name,
          body: description,
          draft: false,
          prerelease: false,
        }),
      },
      `Create Release for ${this.owner}/${this.repo}`
    );
  }

  async getReleaseByTag(tagName) {
    return this.request(
      `${API_BASE}/repos/${this.owner}/${this.repo}/releases/tags/${encodeURIComponent(tagName)}`,
      { method: "GET", headers: this.headers(true) },
      `Get release by tag for ${this.owner}/${this.repo}`
    );
  }

  async listReleases(perPage = 20) {
    return this.request(
      `${API_BASE}/repos/${this.owner}/${this.repo}/releases?per_page=${perPage}`,
      { method: "GET", headers: this.headers(true) },
      `List releases for ${this.owner}/${this.repo}`
    );
  }

  async uploadAsset(uploadUrl, assetName, blob, contentType) {
    const url = `${uploadUrl.replace("{?name,label}", "")}?name=${encodeURIComponent(assetName)}`;
    return this.request(
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: this.token ? `Bearer ${this.token}` : "",
          "Content-Type": contentType,
        },
        body: blob,
      },
      `Upload asset for ${this.owner}/${this.repo}`
    );
  }

  async deleteRelease(releaseId) {
    return this.request(
      `${API_BASE}/repos/${this.owner}/${this.repo}/releases/${releaseId}`,
      {
        method: "DELETE",
        headers: this.headers(),
      },
      `Delete release ${releaseId} for ${this.owner}/${this.repo}`
    );
  }
}

export function stripEmpty(str) {
  return (str || "").trim();
}

export function cleanText(str) {
  return (str || "").trim();
}
