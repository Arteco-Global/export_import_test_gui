const baseUrlInput = document.getElementById("baseUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authServiceSelect = document.getElementById("authServiceSelect");
const fetchAuthServicesBtn = document.getElementById("fetchAuthServicesBtn");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const importBtn = document.getElementById("importBtn");
const importStatus = document.getElementById("importStatus");
const configFileInput = document.getElementById("configFile");
const resetBtn = document.getElementById("resetBtn");
const resetStatus = document.getElementById("resetStatus");
const resetSecretInput = document.getElementById("resetSecret");
const exportBtn = document.getElementById("exportBtn");
const exportStatus = document.getElementById("exportStatus");
const associationList = document.getElementById("associationList");
const importKeyList = document.getElementById("importKeyList");
const importLoading = document.getElementById("importLoading");
const importBody = document.getElementById("importBody");
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
const IMPORT_KEYS = ["CHANNELS", "MAPPING", "SERVER", "CORETRUST", "USERS"];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").trim();
}

function setStatus(el, message, isError = false) {
  el.innerHTML = message;
  el.style.color = isError ? "#8b2f2f" : "";
}

function updateImportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const authReady = accessToken !== "";
  const mappingsReady = loadedMappingOld && loadedMappingNew;
  const associationsReady = mappingsReady && areAssociationsComplete();
  importBtn.disabled = !(baseUrlReady && authReady && loadedConfig && mappingsReady && associationsReady);
}

function updateExportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const authReady = accessToken !== "";
  exportBtn.disabled = !(baseUrlReady && authReady);
}

function updateAuthState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const credsReady = usernameInput.value.trim() !== "" && passwordInput.value !== "";
  const authServiceReady = authServiceSelect.value !== "";
  const tokenReady = accessToken !== "";

  fetchAuthServicesBtn.disabled = !baseUrlReady;
  authServiceSelect.disabled = authServices.length === 0;
  loginBtn.disabled = !(baseUrlReady && credsReady && authServiceReady);
  resetBtn.disabled = !(baseUrlReady && tokenReady);

  exportSection.classList.toggle("hidden", !tokenReady);
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

async function handleFetchAuthServices() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);

  if (!baseUrl) {
    setStatus(loginStatus, "Inserisci un base URL valido.", true);
    return;
  }

  fetchAuthServicesBtn.disabled = true;
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
      return;
    }

    authServices = services;
    renderAuthServices(services);
    setStatus(loginStatus, "Auth service caricati. Seleziona e fai login.");
  } catch (error) {
    resetAuthServices("Carica gli auth service");
    setStatus(loginStatus, `Errore auth service: ${error.message}`, true);
  } finally {
    updateAuthState();
  }
}

async function handleLogin() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const authGuid = authServiceSelect.value;

  if (!baseUrl) {
    setStatus(loginStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!username || !password) {
    setStatus(loginStatus, "Inserisci username e password.", true);
    return;
  }

  if (!authGuid) {
    setStatus(loginStatus, "Seleziona un auth service.", true);
    return;
  }

  loginBtn.disabled = true;
  setStatus(loginStatus, "Login in corso...", false);

  try {
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
  } catch (error) {
    accessToken = "";
    setStatus(loginStatus, `Errore login: ${error.message}`, true);
  } finally {
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

  const resetSecret = resetSecretInput.value.trim();
  if (!resetSecret) {
    setStatus(resetStatus, "Inserisci il reset secret.", true);
    return;
  }

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

  const keysAvailable = IMPORT_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(payloadByKey, key)
  );

  if (keysAvailable.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Nessuna chiave trovata nel config.json.";
    importKeyList.appendChild(placeholder);
    return;
  }

  keysAvailable.forEach((key) => {
    const item = document.createElement("label");
    item.className = "import-key-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = true;
    checkbox.disabled = key === "CHANNELS" || key === "MAPPING";

    if (checkbox.checked) {
      selectedImportKeys.add(key);
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedImportKeys.add(key);
      } else {
        selectedImportKeys.delete(key);
      }
    });

    const text = document.createElement("span");
    text.textContent = key;

    item.appendChild(checkbox);
    item.appendChild(text);
    importKeyList.appendChild(item);
  });
}

function setImportLoading(isLoading) {
  importLoading.classList.toggle("hidden", !isLoading);
  importBody.classList.toggle("hidden", isLoading);
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

      if (!loadedConfig) {
        setStatus(importStatus, "CHANNELS non trovato nel config.json.", true);
        updateImportState();
        return;
      }

      if (!loadedMappingOld) {
        setStatus(importStatus, "MAPPING non trovato nel config.json.", true);
        clearAssociationList("Serve un MAPPING valido nel config.json.");
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
  } catch (error) {
    loadedMappingNew = null;
    clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
    setStatus(importStatus, `Errore mapping nuovo: ${error.message}`, true);
    updateImportState();
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
    if (payloadCopy.CHANNELS) {
      applyGuidMapToConfig(payloadCopy.CHANNELS, guidMap);
    }

    const importPayload = {};
    selectedImportKeys.forEach((key) => {
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
fetchAuthServicesBtn.addEventListener("click", handleFetchAuthServices);
loginBtn.addEventListener("click", handleLogin);
exportBtn.addEventListener("click", handleExport);
resetBtn.addEventListener("click", handleReset);
configFileInput.addEventListener("change", handleConfigFile);
importBtn.addEventListener("click", handleImport);

resetAuthServices("Carica gli auth service");
resetAccessToken();
updateAuthState();
clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
setImportLoading(false);
