/* eslint-disable no-unused-vars */
let initialized = false;

export default function initLegacyApp() {
  if (initialized) {
    return;
  }
  initialized = true;

const baseUrlInput = document.getElementById("baseUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authServiceSelect = document.getElementById("authServiceSelect");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const loginSpinner = document.getElementById("loginSpinner");
const importBtn = document.getElementById("importBtn");
const importStatus = document.getElementById("importStatus");
const configFileInput = document.getElementById("configFile");
const resetBtn = document.getElementById("resetBtn");
const resetStatus = document.getElementById("resetStatus");
const resetSecretInput = document.getElementById("resetSecret");
const exportBtn = document.getElementById("exportBtn");
const exportStatus = document.getElementById("exportStatus");
const backupsSection = document.getElementById("backupsSection");
const backupsAccordion = document.getElementById("backupsAccordion");
const backupsList = document.getElementById("backupsList");
const backupsStatus = document.getElementById("backupsStatus");
const refreshBackupsBtn = document.getElementById("refreshBackupsBtn");
const backupsSummaryCount = document.getElementById("backupsSummaryCount");
const associationList = document.getElementById("associationList");
const importKeyList = document.getElementById("importKeyList");
const importLoading = document.getElementById("importLoading");
const importBody = document.getElementById("importBody");
const importSummary = document.getElementById("importSummary");
const importSummaryList = document.getElementById("importSummaryList");
const exportSection = document.getElementById("exportSection");
const resetSection = document.getElementById("resetSection");
const importSection = document.getElementById("importSection");

let loadedConfig = null;
let loadedFilename = "config.json";
let loadedMappingOld = null;
let loadedMappingNew = null;
let loadedPayloadByKey = {};
const associationSelections = new Map();
const selectedImportKeys = new Set();
let accessToken = "";
let lastBaseUrl = "";
let backupsAutoRefreshTimer = null;
let backupsAutoRefreshDisabled = false;
const BACKUPS_AUTO_REFRESH_MS = 60000;
const BACKUPS_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_RESET_SECRET = "HYPERNODE_RESET_6A9K3M2QX7";
const IMPORT_KEYS = [
  "CHANNELS",
  "MAPPING",
  "SERVER",
  "USERS",
  "SNAPSHOTS",
  "RECORDINGS",
  "EVENTS",
  "METADATA",
  "EXPORTED_AT",
  "GATEWAY_VERSION",
];
const BLOCKED_IMPORT_KEYS = new Set(["CORETRUST"]);

function isImportKeyAllowed(key) {
  return !BLOCKED_IMPORT_KEYS.has(String(key).toUpperCase());
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").trim();
}

function setStatus(el, message, isError = false) {
  el.innerHTML = message;
  el.style.color = isError ? "#8b2f2f" : "";
}

function setLoginLoading(isLoading) {
  if (!loginSpinner) {
    return;
  }
  loginSpinner.classList.toggle("hidden", !isLoading);
}

function updateImportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const authReady = accessToken !== "";
  const hasSelection = selectedImportKeys.size > 0;
  const channelsSelected = selectedImportKeys.has("CHANNELS");
  const mappingsReady = loadedMappingOld && loadedMappingNew;
  const channelsReady = channelsSelected ? !!loadedConfig : true;
  const associationsReady = channelsSelected ? mappingsReady && areAssociationsComplete() : true;
  importBtn.disabled = !(
    baseUrlReady &&
    authReady &&
    hasSelection &&
    channelsReady &&
    associationsReady
  );
}

function updateExportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const authReady = accessToken !== "";
  exportBtn.disabled = !(baseUrlReady && authReady);
}

function updateAuthState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const credsReady = usernameInput.value.trim() !== "" && passwordInput.value !== "";
  const tokenReady = accessToken !== "";

  authServiceSelect.disabled = authServices.length <= 1;
  loginBtn.disabled = !(baseUrlReady && credsReady);
  resetBtn.disabled = !(baseUrlReady && tokenReady);
  refreshBackupsBtn.disabled = !(baseUrlReady && tokenReady);

  exportSection.classList.toggle("hidden", !tokenReady);
  backupsSection.classList.toggle("hidden", !tokenReady);
  resetSection.classList.toggle("hidden", !tokenReady);
  importSection.classList.toggle("hidden", !tokenReady);

  updateImportState();
  updateExportState();
}

function resetAuthServices(message) {
  authServices = [];
  authServiceSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = message || "Carica gli auth service";
  authServiceSelect.appendChild(option);
  updateAuthState();
}

function resetAccessToken(message) {
  accessToken = "";
  if (message) {
    setStatus(loginStatus, message, false);
  }
  stopBackupsAutoRefresh();
  backupsAutoRefreshDisabled = false;
  clearBackupsList("Login per vedere i backup disponibili.");
  updateAuthState();
}

function normalizeAuthServices(payload) {
  const list =
    (Array.isArray(payload) && payload) ||
    payload?.authServices ||
    payload?.data ||
    payload?.root?.authServices ||
    [];

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => ({
      guid:
        item?.id ||
        item?.guid ||
        item?.authServiceGuid ||
        item?.serviceGuid ||
        "",
      name:
        item?.name ||
        item?.authServiceName ||
        item?.serviceName ||
        item?.descr ||
        "",
    }))
    .filter((item) => typeof item.guid === "string" && item.guid.trim() !== "");
}

function renderAuthServices(services) {
  authServiceSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleziona auth service";
  authServiceSelect.appendChild(placeholder);

  services.forEach((service) => {
    const option = document.createElement("option");
    option.value = service.guid;
    option.textContent = service.name ? `${service.guid} - ${service.name}` : service.guid;
    authServiceSelect.appendChild(option);
  });

  if (services.length > 0) {
    authServiceSelect.value = services[0].guid;
  }
}

async function loadAuthServices() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);

  if (!baseUrl) {
    setStatus(loginStatus, "Inserisci un base URL valido.", true);
    return [];
  }

  setStatus(loginStatus, "Caricamento auth service...", false);

  try {
    const response = await fetch(`${baseUrl}/api/v2/server/auth-services`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const services = normalizeAuthServices(payload);

    if (services.length === 0) {
      resetAuthServices("Nessun auth service trovato");
      setStatus(loginStatus, "Nessun auth service disponibile.", true);
      return [];
    }

    authServices = services;
    renderAuthServices(services);
    setStatus(loginStatus, "Auth service caricati.");
    return services;
  } catch (error) {
    resetAuthServices("Carica gli auth service");
    setStatus(loginStatus, `Errore auth service: ${error.message}`, true);
    return [];
  } finally {
    updateAuthState();
  }
}

async function performLogin(authGuid, baseUrl, username, password) {
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
    throw new Error(`Errore HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const token =
    payload?.root?.access_token ||
    payload?.access_token ||
    payload?.root?.accessToken ||
    "";

  if (!token) {
    throw new Error("Access token non trovato.");
  }

  accessToken = token;
  setStatus(loginStatus, "Login OK.");
  backupsAutoRefreshDisabled = false;
  startBackupsAutoRefresh();
  handleFetchBackups();
}

async function handleLogin() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!baseUrl) {
    setStatus(loginStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!username || !password) {
    setStatus(loginStatus, "Inserisci username e password.", true);
    return;
  }

  setLoginLoading(true);
  loginBtn.disabled = true;
  setStatus(loginStatus, "Login in corso...", false);

  try {
    let services = authServices;
    if (services.length === 0) {
      services = await loadAuthServices();
    }

    if (services.length === 0) {
      return;
    }

    if (services.length === 1) {
      authServiceSelect.value = services[0].guid;
    }

    const authGuid = authServiceSelect.value;
    if (services.length > 1 && !authGuid) {
      setStatus(loginStatus, "Seleziona un auth service.", true);
      return;
    }

    await performLogin(authGuid, baseUrl, username, password);
  } catch (error) {
    accessToken = "";
    setStatus(loginStatus, `Errore login: ${error.message}`, true);
  } finally {
    setLoginLoading(false);
    updateAuthState();
  }
}

async function handleExport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(exportStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(exportStatus, "Fai login prima di esportare.", true);
    return;
  }

  exportBtn.disabled = true;
  setStatus(exportStatus, "Download in corso...");

  try {
    const response = await fetch(`${baseUrl}/api/v2/export`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `export_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    setStatus(exportStatus, "File scaricato. Controlla la cartella Download.");
  } catch (error) {
    setStatus(exportStatus, `Errore download: ${error.message}`, true);
  } finally {
    updateExportState();
  }
}

async function handleReset() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(resetStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(resetStatus, "Fai login prima di resettare.", true);
    return;
  }

  const resetSecret = resetSecretInput?.value?.trim() || DEFAULT_RESET_SECRET;

  const confirmed = window.confirm("Sei sicuro di voler resettare il server?");
  if (!confirmed) {
    setStatus(resetStatus, "Reset annullato.");
    return;
  }

  resetBtn.disabled = true;
  setStatus(resetStatus, "Reset in corso...", false);

  try {
    const response = await fetch(`${baseUrl}/api/v2/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-reset-secret": resetSecret,
      },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      if (payload) {
        const message = formatResetResponse(payload);
        setStatus(resetStatus, message, true);
        return;
      }
      throw new Error(`Errore HTTP ${response.status}`);
    }

    if (payload) {
      const message = formatResetResponse(payload);
      setStatus(resetStatus, message, payload.success !== true);
    } else {
      setStatus(resetStatus, "Reset completato.");
    }
  } catch (error) {
    setStatus(resetStatus, `Errore reset: ${error.message}`, true);
  } finally {
    updateAuthState();
  }
}

function readConfigFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Errore di lettura"));
    reader.readAsText(file);
  });
}

function readPayloadKey(payload, key) {
  if (Object.prototype.hasOwnProperty.call(payload, key)) {
    return payload[key];
  }
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(payload, lower)) {
    return payload[lower];
  }
  const capitalized = key.charAt(0) + key.slice(1).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(payload, capitalized)) {
    return payload[capitalized];
  }
  return undefined;
}

function extractConfigPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { config: null, mapping: null, payloadByKey: {} };
  }

  const payloadByKey = {};
  IMPORT_KEYS.forEach((key) => {
    if (!isImportKeyAllowed(key)) {
      return;
    }
    const value = readPayloadKey(payload, key);
    if (value !== undefined) {
      payloadByKey[key] = value;
    }
  });
  const config = payloadByKey.CHANNELS ?? null;
  const mapping = payloadByKey.MAPPING ?? null;

  return { config, mapping, payloadByKey };
}

function renderImportKeyOptions(payloadByKey) {
  importKeyList.innerHTML = "";
  selectedImportKeys.clear();
  const checkboxByKey = new Map();
  const dependentKeys = ["SNAPSHOTS", "RECORDINGS", "EVENTS", "METADATA"];
  const dependentKeyState = new Map();
  const hiddenKeys = new Set(["MAPPING", "EXPORTED_AT", "GATEWAY_VERSION"]);

  hiddenKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payloadByKey, key)) {
      selectedImportKeys.add(key);
    }
  });

  const keysAvailable = IMPORT_KEYS.filter(
    (key) => isImportKeyAllowed(key) && Object.prototype.hasOwnProperty.call(payloadByKey, key)
  );

  if (keysAvailable.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Nessuna chiave trovata nel config.json.";
    importKeyList.appendChild(placeholder);
    return;
  }

  keysAvailable.forEach((key) => {
    if (hiddenKeys.has(key)) {
      return;
    }
    const item = document.createElement("label");
    item.className = "import-key-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = true;
    checkbox.disabled = key === "MAPPING";

    if (checkbox.checked) {
      selectedImportKeys.add(key);
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedImportKeys.add(key);
      } else {
        selectedImportKeys.delete(key);
      }

      if (key === "CHANNELS") {
        const channelsEnabled = checkbox.checked;
        dependentKeys.forEach((depKey) => {
          const depCheckbox = checkboxByKey.get(depKey);
          if (!depCheckbox) {
            return;
          }
          if (!channelsEnabled) {
            dependentKeyState.set(depKey, depCheckbox.checked);
            depCheckbox.checked = false;
            depCheckbox.disabled = true;
            selectedImportKeys.delete(depKey);
          } else {
            const shouldCheck = dependentKeyState.get(depKey);
            depCheckbox.disabled = false;
            if (shouldCheck) {
              depCheckbox.checked = true;
              selectedImportKeys.add(depKey);
            }
          }
        });
      }
      updateImportState();
    });

    const text = document.createElement("span");
    text.textContent = key;

    item.appendChild(checkbox);
    item.appendChild(text);
    importKeyList.appendChild(item);
    checkboxByKey.set(key, checkbox);
  });

  const channelsCheckbox = checkboxByKey.get("CHANNELS");
  if (channelsCheckbox && !channelsCheckbox.checked) {
    dependentKeys.forEach((depKey) => {
      const depCheckbox = checkboxByKey.get(depKey);
      if (!depCheckbox) {
        return;
      }
      depCheckbox.checked = false;
      depCheckbox.disabled = true;
      selectedImportKeys.delete(depKey);
    });
  }
  updateImportState();
}

function setImportLoading(isLoading) {
  importLoading.classList.toggle("hidden", !isLoading);
  importBody.classList.toggle("hidden", isLoading);
}

function countPayloadItems(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
}

function setBackupsSummaryCount(count) {
  if (!backupsSummaryCount) {
    return;
  }
  const value = Number.isFinite(count) ? count : 0;
  backupsSummaryCount.textContent = String(value);
}

function clearBackupsList(message) {
  if (!backupsList) {
    return;
  }
  backupsList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  backupsList.appendChild(placeholder);
  if (backupsStatus) {
    setStatus(backupsStatus, "");
  }
  setBackupsSummaryCount(0);
}

function normalizeBackups(payload) {
  if (!payload) {
    return [];
  }
  const candidates =
    (Array.isArray(payload) && payload) ||
    payload?.backups ||
    payload?.data ||
    payload?.root?.backups ||
    payload?.root?.data ||
    payload?.root ||
    [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  function deriveBackupTimestampFromName(name) {
    if (!name || typeof name !== "string") {
      return "";
    }
    const match = name.match(/^config-backup-(.+)\.json$/i);
    if (match) {
      return match[1];
    }
    if (name.toLowerCase().endsWith(".json")) {
      return name.slice(0, -5);
    }
    return name;
  }

  return candidates
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        const value = String(item);
        return { timestamp: value, label: value };
      }
      if (item && typeof item === "object") {
        const name =
          item.name ||
          item.filename ||
          item.file ||
          "";
        const createdAt =
          item.createdAt ||
          item.created_at ||
          item.created ||
          "";
        const derivedTimestamp = deriveBackupTimestampFromName(name);
        const timestamp =
          derivedTimestamp ||
          item.timestamp ||
          item.ts ||
          item.time ||
          item.id ||
          "";
        if (!timestamp && !name && !createdAt) {
          return null;
        }
        const label = String(createdAt || timestamp || name);
        return {
          timestamp: String(timestamp || createdAt || name),
          label,
          createdAt: String(createdAt || ""),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function sanitizeFilenamePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function renderBackupsList(backups) {
  if (!backupsList) {
    return;
  }
  backupsList.innerHTML = "";

  if (backups.length === 0) {
    clearBackupsList("Nessun backup disponibile.");
    return;
  }

  setBackupsSummaryCount(backups.length);
  backups.forEach((backup) => {
    const row = document.createElement("div");
    row.className = "backup-row";

    const label = document.createElement("div");
    label.className = "backup-label";
    label.textContent = formatBackupLabel(backup);

    const actions = document.createElement("div");
    actions.className = "backup-actions";

    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "Download";
    button.addEventListener("click", () => {
      handleDownloadBackup(backup.timestamp, backup.label, button);
    });

    actions.appendChild(button);
    row.appendChild(label);
    row.appendChild(actions);
    backupsList.appendChild(row);
  });
}

function formatBackupLabel(backup) {
  const createdAt = backup.createdAt || "";
  const parsed = createdAt ? new Date(createdAt) : null;
  const dateText = parsed && !Number.isNaN(parsed.getTime())
    ? formatDateTime(parsed)
    : backup.label;
  const relative = parsed && !Number.isNaN(parsed.getTime())
    ? formatRelativeTime(parsed)
    : "tempo non disponibile";
  return `${dateText} (backup di ${relative})`;
}

function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) {
    return "tempo non disponibile";
  }
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) {
    return "meno di un minuto fa";
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minut${diffMinutes === 1 ? "o" : "i"} fa`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} or${diffHours === 1 ? "a" : "e"} fa`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} giorn${diffDays === 1 ? "o" : "i"} fa`;
}


function getCameraServices(payload) {
  const channels =
    payload?.CHANNELS ||
    payload?.channels ||
    payload?.root?.CHANNELS ||
    payload?.root?.channels ||
    null;
  if (Array.isArray(channels)) {
    return channels;
  }
  if (channels && typeof channels === "object") {
    const cameraServices =
      channels.cameraServices ||
      channels.camera_services ||
      channels.services ||
      channels.items ||
      [];
    if (Array.isArray(cameraServices)) {
      return cameraServices;
    }
  }
  return [];
}

function getServiceLabel(service, fallback) {
  const name =
    service?.name ||
    service?.serviceName ||
    service?.cameraServiceName ||
    service?.label ||
    service?.title ||
    service?.descr ||
    "";
  const id =
    service?.id ||
    service?.guid ||
    service?.serviceGuid ||
    service?.serviceId ||
    "";
  if (name && id) {
    return `${name} (${id})`;
  }
  return name || id || fallback;
}

function getCameraList(service) {
  const camerasValue =
    service?.cameras ||
    service?.cameraList ||
    service?.camera ||
    service?.channels ||
    service?.devices ||
    [];
  if (Array.isArray(camerasValue)) {
    return camerasValue.map((item, index) => {
      if (typeof item === "string" || typeof item === "number") {
        return String(item);
      }
      if (item && typeof item === "object") {
        return (
          item.name ||
          item.label ||
          item.title ||
          item.descr ||
          item.id ||
          item.guid ||
          `Camera ${index + 1}`
        );
      }
      return `Camera ${index + 1}`;
    });
  }
  if (camerasValue && typeof camerasValue === "object") {
    return Object.keys(camerasValue);
  }
  return [];
}

function getMappingList(payload) {
  const mapping =
    payload?.MAPPING ||
    payload?.mapping ||
    payload?.root?.MAPPING ||
    payload?.root?.mapping ||
    null;
  const services =
    (Array.isArray(mapping) && mapping) ||
    mapping?.services ||
    mapping?.serviceList ||
    mapping?.items ||
    [];
  if (Array.isArray(services)) {
    return services.map((item, index) => {
      if (typeof item === "string" || typeof item === "number") {
        return String(item);
      }
      if (item && typeof item === "object") {
        const name = item.serviceName || item.name || item.label || "";
        const type = item.serviceType || item.type || "";
        const guid = item.serviceGuid || item.guid || item.id || "";
        if (name && type) {
          return `${name} • ${type}`;
        }
        if (name && guid) {
          return `${name} (${guid})`;
        }
        return name || type || guid || `Servizio ${index + 1}`;
      }
      return `Servizio ${index + 1}`;
    });
  }
  if (mapping && typeof mapping === "object") {
    return Object.keys(mapping);
  }
  return [];
}

function renderRecapList(container, payload) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!payload || typeof payload !== "object") {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Contenuto backup non valido.";
    container.appendChild(placeholder);
    return;
  }

  const cameraServices = getCameraServices(payload);
  const mappingList = getMappingList(payload);

  const channelsHeader = document.createElement("div");
  channelsHeader.className = "recap-section-title";
  channelsHeader.textContent = `CHANNELS • ${cameraServices.length} camera service`;
  container.appendChild(channelsHeader);

  if (cameraServices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "placeholder";
    empty.textContent = "Nessun camera service trovato.";
    container.appendChild(empty);
  } else {
    cameraServices.forEach((service, index) => {
      const row = document.createElement("div");
      row.className = "recap-item";
      const label = document.createElement("div");
      label.className = "recap-item-title";
      label.textContent = getServiceLabel(service, `Camera service ${index + 1}`);
      const cameras = getCameraList(service);
      const list = document.createElement("div");
      list.className = "recap-item-body";
      list.textContent = cameras.length > 0 ? cameras.join(", ") : "Nessuna camera";
      row.appendChild(label);
      row.appendChild(list);
      container.appendChild(row);
    });
  }

  const mappingHeader = document.createElement("div");
  mappingHeader.className = "recap-section-title";
  mappingHeader.textContent = `MAPPING • ${mappingList.length} servizi`;
  container.appendChild(mappingHeader);

  if (mappingList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "placeholder";
    empty.textContent = "Nessun mapping trovato.";
    container.appendChild(empty);
  } else {
    const mappingRow = document.createElement("div");
    mappingRow.className = "recap-item";
    const mappingBody = document.createElement("div");
    mappingBody.className = "recap-item-body";
    mappingBody.textContent = mappingList.join(", ");
    mappingRow.appendChild(mappingBody);
    container.appendChild(mappingRow);
  }
}


function startBackupsAutoRefresh() {
  stopBackupsAutoRefresh();
  if (backupsAutoRefreshDisabled) {
    return;
  }
  backupsAutoRefreshTimer = window.setInterval(() => {
    handleFetchBackups(true);
  }, BACKUPS_AUTO_REFRESH_MS);
}

function stopBackupsAutoRefresh() {
  if (backupsAutoRefreshTimer) {
    window.clearInterval(backupsAutoRefreshTimer);
    backupsAutoRefreshTimer = null;
  }
}

async function handleFetchBackups(isAutoRefresh = false) {
  if (isAutoRefresh && backupsAutoRefreshDisabled) {
    return;
  }
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(backupsStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(backupsStatus, "Fai login prima di leggere i backup.", true);
    return;
  }

  if (!isAutoRefresh) {
    refreshBackupsBtn.disabled = true;
  }
  setStatus(backupsStatus, "Caricamento backup...", false);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, BACKUPS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/v2/backups`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const backups = normalizeBackups(payload);
    renderBackupsList(backups);
    setStatus(backupsStatus, "Lista backup aggiornata.");
    backupsAutoRefreshDisabled = false;
  } catch (error) {
    clearBackupsList("Errore nel caricamento dei backup.");
    if (error.name === "AbortError") {
      setStatus(
        backupsStatus,
        "Timeout backup: aggiornamento automatico sospeso.",
        true
      );
      backupsAutoRefreshDisabled = true;
      stopBackupsAutoRefresh();
    } else {
      setStatus(backupsStatus, `Errore backup: ${error.message}`, true);
    }
  } finally {
    window.clearTimeout(timeoutId);
    updateAuthState();
  }
}

async function handleDownloadBackup(timestamp, label, button) {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(backupsStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(backupsStatus, "Fai login prima di scaricare.", true);
    return;
  }

  if (!timestamp) {
    setStatus(backupsStatus, "Timestamp backup non valido.", true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  setStatus(backupsStatus, `Download backup ${label || timestamp}...`, false);

  try {
    const response = await fetch(`${baseUrl}/api/v2/backups/${encodeURIComponent(timestamp)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safePart = sanitizeFilenamePart(label || timestamp);
    const filenameBase = safePart || "backup_download";
    const filename = filenameBase.toLowerCase().endsWith(".zip")
      ? filenameBase
      : `${filenameBase}.zip`;
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setStatus(backupsStatus, "Backup scaricato. Controlla la cartella Download.");
  } catch (error) {
    setStatus(backupsStatus, `Errore download backup: ${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
    }
    updateAuthState();
  }
}

function updateImportSummary() {
  if (!importSummary || !importSummaryList) {
    return;
  }
  if (!loadedPayloadByKey || !loadedMappingOld || !loadedMappingNew) {
    importSummary.classList.add("hidden");
    importSummaryList.innerHTML = "";
    return;
  }

  renderRecapList(importSummaryList, loadedPayloadByKey);

  importSummary.classList.remove("hidden");
}

function applyGuidToConfig(config, serviceName, guid) {
  let updated = false;

  function updateServiceObject(obj) {
    if (obj.serviceType === serviceName) {
      obj.serviceGuid = guid;
      updated = true;
    }
  }

  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    updateServiceObject(node);

    Object.keys(node).forEach((key) => {
      const value = node[key];

      if (key === serviceName) {
        if (typeof value === "string") {
          node[key] = guid;
          updated = true;
          return;
        }

        if (value && typeof value === "object") {
          if ("guid" in value) {
            value.guid = guid;
          } else if ("id" in value) {
            value.id = guid;
          } else if ("serviceGuid" in value) {
            value.serviceGuid = guid;
          } else {
            value.guid = guid;
          }
          updated = true;
          return;
        }
      }

      if (value && typeof value === "object") {
        updateServiceObject(value);
      }

      visit(value);
    });
  }

  visit(config);

  if (!updated) {
    if (!config.serviceGuids || typeof config.serviceGuids !== "object") {
      config.serviceGuids = {};
    }
    config.serviceGuids[serviceName] = guid;
  }
}

function extractServices(mapping) {
  if (!mapping || !Array.isArray(mapping.services)) {
    return [];
  }
  const ignoredTypes = new Set(["HypernodeGatewayService", "HypernodeCoreTrustService"]);
  return mapping.services
    .filter((service) => service && typeof service === "object")
    .map((service) => ({
      serviceGuid: service.serviceGuid,
      serviceType: service.serviceType,
      serviceName: service.serviceName || "",
    }))
    .filter(
      (service) =>
        typeof service.serviceGuid === "string" &&
        typeof service.serviceType === "string" &&
        !ignoredTypes.has(service.serviceType)
    );
}

function formatServiceLabel(service) {
  const name = service.serviceName ? ` - ${service.serviceName}` : "";
  return `${service.serviceGuid}${name}`;
}

function clearAssociationList(message) {
  associationList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  associationList.appendChild(placeholder);
}

function buildMappingLookup(mapping) {
  const lookup = new Map();
  if (!mapping || !Array.isArray(mapping.services)) {
    return lookup;
  }
  mapping.services.forEach((service) => {
    if (
      service &&
      typeof service === "object" &&
      typeof service.serviceGuid === "string" &&
      typeof service.serviceType === "string"
    ) {
      lookup.set(service.serviceGuid, {
        serviceType: service.serviceType,
        serviceName: service.serviceName || "",
      });
    }
  });
  return lookup;
}

function describeServiceGuid(serviceGuid, lookup, fallbackType = "") {
  if (!serviceGuid || typeof serviceGuid !== "string") {
    return "N/D";
  }
  const info = lookup.get(serviceGuid);
  if (!info) {
    return serviceGuid;
  }
  const name = info.serviceName ? ` (${info.serviceName})` : "";
  return `${serviceGuid}${name}`;
}

function buildAssociationUI(oldServices, newServices) {
  associationSelections.clear();
  associationList.innerHTML = "";

  if (oldServices.length === 0) {
    clearAssociationList("Nessun servizio trovato nel MAPPING del config.json.");
    return;
  }

  const newByType = newServices.reduce((acc, service) => {
    if (!acc[service.serviceType]) {
      acc[service.serviceType] = [];
    }
    acc[service.serviceType].push(service);
    return acc;
  }, {});

  oldServices.forEach((oldService) => {
    const row = document.createElement("div");
    row.className = "association-row";

    const typeLabel = document.createElement("div");
    typeLabel.className = "association-label";
    typeLabel.textContent = oldService.serviceType;

    const oldGuid = document.createElement("div");
    oldGuid.className = "association-guid";
    oldGuid.textContent = formatServiceLabel(oldService);

    const select = document.createElement("select");
    select.dataset.oldGuid = oldService.serviceGuid;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleziona nuovo servizio";
    select.appendChild(placeholder);

    const candidates = newByType[oldService.serviceType] || [];
    candidates.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.serviceGuid;
      option.textContent = formatServiceLabel(candidate);
      select.appendChild(option);
    });

    if (candidates.length === 1) {
      select.value = candidates[0].serviceGuid;
      associationSelections.set(oldService.serviceGuid, candidates[0].serviceGuid);
    } else if (oldService.serviceName) {
      const match = candidates.find((candidate) => candidate.serviceName === oldService.serviceName);
      if (match) {
        select.value = match.serviceGuid;
        associationSelections.set(oldService.serviceGuid, match.serviceGuid);
      }
    }

    select.addEventListener("change", () => {
      if (select.value) {
        associationSelections.set(oldService.serviceGuid, select.value);
      } else {
        associationSelections.delete(oldService.serviceGuid);
      }
      updateImportState();
    });

    row.appendChild(typeLabel);
    row.appendChild(oldGuid);
    row.appendChild(select);
    associationList.appendChild(row);
  });
}

function areAssociationsComplete() {
  if (!loadedMappingOld) {
    return false;
  }
  const oldServices = extractServices(loadedMappingOld);
  return oldServices.every((service) => associationSelections.has(service.serviceGuid));
}

function handleConfigFile(event) {
  const file = event.target.files[0];
  if (!file) {
    loadedConfig = null;
    loadedMappingOld = null;
    loadedPayloadByKey = {};
    selectedImportKeys.clear();
    importKeyList.innerHTML = '<div class="placeholder">Carica un config.json per selezionare le chiavi.</div>';
    associationSelections.clear();
    clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
    updateImportSummary();
    setImportLoading(false);
    updateImportState();
    return;
  }

  loadedFilename = file.name || "config.json";
  setStatus(importStatus, "Caricamento config...", false);

  readConfigFile(file)
    .then((payload) => {
      const extracted = extractConfigPayload(payload);
      loadedConfig = extracted.config;
      loadedMappingOld = extracted.mapping;
      loadedPayloadByKey = extracted.payloadByKey;
      renderImportKeyOptions(loadedPayloadByKey);
      updateImportSummary();

      if (!loadedConfig) {
        setStatus(importStatus, "CHANNELS non trovato nel config.json.", true);
        updateImportState();
        return;
      }

      if (!loadedMappingOld) {
        setStatus(importStatus, "MAPPING non trovato nel config.json.", true);
        clearAssociationList("Serve un MAPPING valido nel config.json.");
        updateImportSummary();
        updateImportState();
        return;
      }

      const oldServices = extractServices(loadedMappingOld);
      const newServices = extractServices(loadedMappingNew);
      if (loadedMappingNew) {
        buildAssociationUI(oldServices, newServices);
      } else {
        clearAssociationList("Ottieni il mapping nuovo dal server.");
      }
      setStatus(importStatus, "config.json caricato. Ottieni il mapping nuovo.");
      updateImportState();
      updateImportSummary();

      const baseUrl = normalizeBaseUrl(baseUrlInput.value);
      if (baseUrl && accessToken) {
        handleFetchMapping();
      }
    })
    .catch((error) => {
      loadedConfig = null;
      loadedMappingOld = null;
      loadedPayloadByKey = {};
      selectedImportKeys.clear();
      importKeyList.innerHTML = '<div class="placeholder">Carica un config.json per selezionare le chiavi.</div>';
      updateImportSummary();
      setImportLoading(false);
      setStatus(importStatus, `Errore JSON: ${error.message}`, true);
      updateImportState();
    });
}

async function handleFetchMapping() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(importStatus, "Fai login prima di ottenere il mapping.", true);
    return;
  }

  setImportLoading(true);
  updateImportSummary();
  setStatus(importStatus, "Richiesta mapping attuale...", false);

  try {
    const response = await fetch(`${baseUrl}/api/v2/mapping`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const mappingNew = await response.json();
    loadedMappingNew = mappingNew;
    const oldServices = extractServices(loadedMappingOld);
    const newServices = extractServices(mappingNew);
    if (loadedMappingOld) {
      buildAssociationUI(oldServices, newServices);
    } else {
      clearAssociationList("Carica anche il config.json con MAPPING.");
    }
    setStatus(importStatus, "Mapping nuovo ottenuto.");
    updateImportState();
    updateImportSummary();
  } catch (error) {
    loadedMappingNew = null;
    clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
    setStatus(importStatus, `Errore mapping nuovo: ${error.message}`, true);
    updateImportState();
    updateImportSummary();
  } finally {
    setImportLoading(false);
    updateAuthState();
  }
}

function applyGuidMapToConfig(config, guidMap) {
  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (typeof node.serviceGuid === "string" && guidMap.has(node.serviceGuid)) {
      node.serviceGuid = guidMap.get(node.serviceGuid);
    }

    Object.values(node).forEach(visit);
  }

  visit(config);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatImportResponse(payload) {
  const parts = [];
  const message = payload.message || (payload.success === true ? "OK" : "Import fallito.");
  parts.push(`<div>${escapeHtml(message)}</div>`);

  const data = payload.data || {};

  if (Array.isArray(data.associationResults) && data.associationResults.length > 0) {
    const rows = data.associationResults
      .map(
        (item) =>
          `<li>${escapeHtml(item.type || "associazione")}: ${escapeHtml(
            item.message || "errore"
          )}</li>`
      )
      .join("");
    parts.push(`<div>Associazioni:</div><ul>${rows}</ul>`);
  }

  if (Array.isArray(data.userResults) && data.userResults.length > 0) {
    const rows = data.userResults
      .map(
        (item) =>
          `<li>Utente: ${escapeHtml(item.message || "errore")} (${escapeHtml(
            item.serviceGuid || "N/D"
          )})</li>`
      )
      .join("");
    parts.push(`<div>Utenti:</div><ul>${rows}</ul>`);
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const rows = data.errors.map((err) => `<li>${escapeHtml(err)}</li>`).join("");
    parts.push(`<div>Errori:</div><ul>${rows}</ul>`);
  }

  return parts.join("");
}

function formatResetResponse(payload) {
  const parts = [];
  if (payload.message) {
    parts.push(`<div>${escapeHtml(payload.message)}</div>`);
  }

  const data = payload.data || {};
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const rows = data.errors.map((err) => `<li>${escapeHtml(err)}</li>`).join("");
    parts.push(`<div>Errori:</div><ul>${rows}</ul>`);
  }

  if (parts.length === 0) {
    return payload.success === true ? "OK" : "Reset fallito.";
  }

  return parts.join("");
}

async function handleImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!accessToken) {
    setStatus(importStatus, "Fai login prima di importare.", true);
    return;
  }

  if (!loadedConfig) {
    setStatus(importStatus, "Carica prima un config.json.", true);
    return;
  }

  if (!loadedMappingOld || !loadedMappingNew) {
    setStatus(importStatus, "Carica il config.json con MAPPING e ottieni quello nuovo.", true);
    return;
  }

  if (!areAssociationsComplete()) {
    setStatus(importStatus, "Completa tutte le associazioni.", true);
    return;
  }

  importBtn.disabled = true;
  setStatus(importStatus, "Invio import in corso...");

  try {
    const payloadCopy = JSON.parse(JSON.stringify(loadedPayloadByKey));
    const guidMap = new Map(associationSelections);
    selectedImportKeys.forEach((key) => {
      if (!isImportKeyAllowed(key)) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(payloadCopy, key)) {
        applyGuidMapToConfig(payloadCopy[key], guidMap);
      }
    });

    const importPayload = {};
    selectedImportKeys.forEach((key) => {
      if (!isImportKeyAllowed(key)) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(payloadCopy, key)) {
        importPayload[key] = payloadCopy[key];
      }
    });

    const response = await fetch(`${baseUrl}/api/v2/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(importPayload),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      if (payload) {
        const message = formatImportResponse(payload);
        setStatus(importStatus, message, true);
        return;
      }
      throw new Error(`Errore HTTP ${response.status}`);
    }

    if (payload) {
      const message = formatImportResponse(payload);
      setStatus(importStatus, message, payload.success !== true);
    } else {
      setStatus(importStatus, "Import fallito.", true);
    }
  } catch (error) {
    setStatus(importStatus, `Errore import: ${error.message}`, true);
  } finally {
    updateImportState();
  }
}

let authServices = [];

function handleBaseUrlChange() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (baseUrl !== lastBaseUrl) {
    lastBaseUrl = baseUrl;
    resetAccessToken("Login da rifare: base URL cambiato.");
    resetAuthServices("Carica gli auth service");
  }
  updateAuthState();
}

function handleCredentialChange() {
  resetAccessToken("Login da rifare: credenziali cambiate.");
  updateAuthState();
}

baseUrlInput.addEventListener("input", handleBaseUrlChange);
usernameInput.addEventListener("input", handleCredentialChange);
passwordInput.addEventListener("input", handleCredentialChange);
authServiceSelect.addEventListener("change", updateAuthState);
loginBtn.addEventListener("click", handleLogin);
exportBtn.addEventListener("click", handleExport);
resetBtn.addEventListener("click", handleReset);
refreshBackupsBtn.addEventListener("click", handleFetchBackups);
configFileInput.addEventListener("change", handleConfigFile);
importBtn.addEventListener("click", handleImport);

resetAuthServices("Carica gli auth service");
resetAccessToken();
updateAuthState();
clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
setImportLoading(false);
}
