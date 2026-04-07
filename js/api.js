import { t } from "./i18n.js";

export async function fetchAuthServices(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v2/server/auth-services`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.json().catch(() => ({}));
}

export async function loginRequest(baseUrl, authGuid, username, password) {
  const response = await fetch(`${baseUrl}/api/v2/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
      authServiceGuid: authGuid,
    }),
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.json().catch(() => null);
}

export async function exportRequest(baseUrl, accessToken) {
  const response = await fetch(`${baseUrl}/api/v2/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.blob();
}

export async function fetchBackupsRequest(baseUrl, accessToken, signal) {
  const response = await fetch(`${baseUrl}/api/v2/backups`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.json().catch(() => ({}));
}

export async function resetRequest(baseUrl, accessToken, resetSecret) {
  const response = await fetch(`${baseUrl}/api/v2/reset`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-reset-secret": resetSecret,
    },
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function downloadBackupRequest(baseUrl, accessToken, timestamp) {
  const response = await fetch(`${baseUrl}/api/v2/backups/${encodeURIComponent(timestamp)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.blob();
}

export async function fetchMappingRequest(baseUrl, accessToken) {
  const response = await fetch(`${baseUrl}/api/v2/mapping`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(t("httpError", { status: response.status }));
  }
  return response.json();
}

export async function importRequest(baseUrl, accessToken, payload) {
  const response = await fetch(`${baseUrl}/api/v2/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
