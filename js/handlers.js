import {
  authServiceSelect,
  baseUrlInput,
  backupsStatus,
  exportStatus,
  importStatus,
  loginBtn,
  loginStatus,
  passwordInput,
  refreshBackupsBtn,
  resetBtn,
  resetStatus,
  usernameInput,
} from "./dom.js";
import {
  fetchAuthServices,
  fetchBackupsRequest,
  fetchMappingRequest,
  importRequest,
  loginRequest,
  resetRequest,
  downloadBackupRequest,
  exportRequest,
} from "./api.js";
import {
  BACKUPS_AUTO_REFRESH_MS,
  BACKUPS_REQUEST_TIMEOUT_MS,
  DEFAULT_RESET_SECRET,
} from "./constants.js";
import {
  areAssociationsComplete,
  buildAssociationUI,
  clearAssociationList,
  clearBackupsList,
  clearImportKeyList,
  normalizeAuthServices,
  normalizeBackups,
  renderAuthServices,
  renderBackupsList,
  renderImportKeyOptions,
  resetAuthServices,
  setImportLoading,
  setLoginLoading,
  showArtecoPage,
  showHome,
  showUssTool,
  updateAuthState,
  updateExportState,
  updateImportState,
  updateImportSummary,
} from "./render.js";
import { state } from "./state.js";
import {
  applyGuidMapToConfig,
  extractConfigPayload,
  formatImportResponse,
  getCameraLicense,
  getCameraServiceGuid,
  getRawCameraEntries,
  setCameraLicense,
  readConfigFile,
} from "./import-helpers.js";
import {
  isImportKeyAllowed,
  normalizeBaseUrl,
  sanitizeFilenamePart,
  escapeHtml,
  setStatus,
} from "./utils.js";
import {
  refreshArtecoUiState,
  resetAvailableLicenses,
  storeAvailableLicenses,
  resetArtecoTargetServices,
  syncArtecoTargetServices,
} from "./arteco.js";

function getBaseUrlReady() {
  return normalizeBaseUrl(baseUrlInput.value) !== "";
}

function getCredsReady() {
  return baseUrlInput.value.trim() !== "" &&
    usernameInput.value.trim() !== "" &&
    passwordInput.value !== "";
}

export function refreshUiState() {
  const baseUrlReady = getBaseUrlReady();
  const credsReady = getCredsReady();
  updateImportState(baseUrlReady);
  updateExportState(baseUrlReady);
  updateAuthState(baseUrlReady, credsReady);
  refreshArtecoUiState();
}

export function resetAccessToken(message) {
  state.accessToken = "";
  if (message) {
    setStatus(loginStatus, message, false);
  }
  stopBackupsAutoRefresh();
  state.backupsAutoRefreshDisabled = false;
  clearBackupsList("Login per vedere i backup disponibili.");
  resetAvailableLicenses();
  resetArtecoTargetServices();
  refreshUiState();
  showHome();
}

export function startBackupsAutoRefresh() {
  stopBackupsAutoRefresh();
  if (state.backupsAutoRefreshDisabled) {
    return;
  }
  state.backupsAutoRefreshTimer = window.setInterval(() => {
    handleFetchBackups(true);
  }, BACKUPS_AUTO_REFRESH_MS);
}

export function stopBackupsAutoRefresh() {
  if (state.backupsAutoRefreshTimer) {
    window.clearInterval(state.backupsAutoRefreshTimer);
    state.backupsAutoRefreshTimer = null;
  }
}

function triggerBlobDownload(blob, filename) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

function formatResetResponse(payload) {
  const parts = [];
  if (payload?.message) {
    parts.push(`<div>${escapeHtml(payload.message)}</div>`);
  }

  const data = payload?.data || {};
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const rows = data.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
    parts.push(`<div>Errori:</div><ul>${rows}</ul>`);
  }

  if (parts.length === 0) {
    return payload?.success === true ? "OK" : "Reset fallito.";
  }

  return parts.join("");
}

function buildCameraLicenseKey(serviceGuid, cameraIndex) {
  return `${serviceGuid}::${cameraIndex}`;
}

function resetCameraLicenseAssignments() {
  state.cameraLicenseAssignments.clear();
}

function initializeCameraLicenseAssignments(config) {
  resetCameraLicenseAssignments();
  const cameraServices =
    config?.cameraServices ||
    config?.camera_services ||
    config?.services ||
    config?.items ||
    [];

  if (!Array.isArray(cameraServices)) {
    return;
  }

  cameraServices.forEach((service, serviceIndex) => {
    const serviceGuid = getCameraServiceGuid(service, serviceIndex);
    const cameraEntries = getRawCameraEntries(service);
    cameraEntries.forEach((cameraEntry, cameraIndex) => {
      state.cameraLicenseAssignments.set(
        buildCameraLicenseKey(serviceGuid, cameraIndex),
        getCameraLicense(cameraEntry)
      );
    });
  });
}

function validateCameraLicenses(channelsPayload) {
  const cameraServices =
    channelsPayload?.cameraServices ||
    channelsPayload?.camera_services ||
    channelsPayload?.services ||
    channelsPayload?.items ||
    [];

  if (!Array.isArray(cameraServices)) {
    return { ok: true };
  }

  if (state.availableLicenses.length === 0) {
    const totalCameras = cameraServices.reduce(
      (count, service) => count + getRawCameraEntries(service).length,
      0
    );
    if (totalCameras > 0) {
      return {
        ok: false,
        message: "Nessuna licenza disponibile sul nuovo server. Impossibile completare l'import delle telecamere.",
      };
    }
    return { ok: true };
  }

  const capacityByType = new Map(
    state.availableLicenses.map((license) => [license.type, license.availableChannels])
  );
  const usage = new Map();

  for (const service of cameraServices) {
    const cameraEntries = getRawCameraEntries(service);
    for (let cameraIndex = 0; cameraIndex < cameraEntries.length; cameraIndex += 1) {
      const cameraEntry = cameraEntries[cameraIndex];
      const licenseType = getCameraLicense(cameraEntry);
      if (!licenseType) {
        const cameraName =
          cameraEntry?.camera?.descr ||
          cameraEntry?.descr ||
          cameraEntry?.camera?.name ||
          cameraEntry?.name ||
          `Camera ${cameraIndex + 1}`;
        return {
          ok: false,
          message: `Licenza mancante per ${cameraName}. Assegna una licenza a tutte le telecamere prima dell'import.`,
        };
      }
      if (!capacityByType.has(licenseType)) {
        return {
          ok: false,
          message: `Licenza ${licenseType} non presente sul nuovo server.`,
        };
      }
      usage.set(licenseType, (usage.get(licenseType) || 0) + 1);
    }
  }

  for (const [licenseType, used] of usage.entries()) {
    const capacity = capacityByType.get(licenseType) || 0;
    if (used > capacity) {
      return {
        ok: false,
        message: `Licenze insufficienti per ${licenseType}: assegnate ${used}, disponibili ${capacity}.`,
      };
    }
  }

  return { ok: true };
}

function applyCameraLicenseAssignments(channelsPayload) {
  const cameraServices =
    channelsPayload?.cameraServices ||
    channelsPayload?.camera_services ||
    channelsPayload?.services ||
    channelsPayload?.items ||
    [];

  if (!Array.isArray(cameraServices)) {
    return;
  }

  cameraServices.forEach((service, serviceIndex) => {
    const serviceGuid = getCameraServiceGuid(service, serviceIndex);
    const cameraEntries = getRawCameraEntries(service);
    cameraEntries.forEach((cameraEntry, cameraIndex) => {
      const key = buildCameraLicenseKey(serviceGuid, cameraIndex);
      if (!state.cameraLicenseAssignments.has(key)) {
        return;
      }
      setCameraLicense(cameraEntry, state.cameraLicenseAssignments.get(key));
    });
  });
}

export async function loadAuthServices() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(loginStatus, "Inserisci un base URL valido.", true);
    return [];
  }

  setStatus(loginStatus, "Caricamento auth service...", false);

  try {
    const payload = await fetchAuthServices(baseUrl);
    const services = normalizeAuthServices(payload);

    if (services.length === 0) {
      resetAuthServices("Nessun auth service trovato");
      setStatus(loginStatus, "Nessun auth service disponibile.", true);
      return [];
    }

    state.authServices = services;
    renderAuthServices(services);
    setStatus(loginStatus, "Auth service caricati.");
    return services;
  } catch (error) {
    resetAuthServices("Carica gli auth service");
    setStatus(loginStatus, `Errore auth service: ${error.message}`, true);
    return [];
  } finally {
    refreshUiState();
  }
}

export async function handleLogin() {
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
    let services = state.authServices;
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

    const payload = await loginRequest(baseUrl, authGuid, username, password);
    const token =
      payload?.root?.access_token ||
      payload?.access_token ||
      payload?.root?.accessToken ||
      "";
    if (!token) {
      throw new Error("Access token non trovato.");
    }

    state.accessToken = token;
    storeAvailableLicenses(payload);
    setStatus(loginStatus, "Login OK.");
    state.backupsAutoRefreshDisabled = false;
    startBackupsAutoRefresh();
    handleFetchBackups();
    syncArtecoTargetServices();
    showHome();
  } catch (error) {
    state.accessToken = "";
    setStatus(loginStatus, `Errore login: ${error.message}`, true);
  } finally {
    setLoginLoading(false);
    refreshUiState();
  }
}

export async function handleExport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(exportStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(exportStatus, "Fai login prima di esportare.", true);
    return;
  }

  updateExportState(false);
  setStatus(exportStatus, "Download in corso...");

  try {
    const blob = await exportRequest(baseUrl, state.accessToken);
    const filename = `export_${new Date().toISOString().slice(0, 10)}.zip`;
    triggerBlobDownload(blob, filename);
    setStatus(exportStatus, "File scaricato. Controlla la cartella Download.");
  } catch (error) {
    setStatus(exportStatus, `Errore download: ${error.message}`, true);
  } finally {
    refreshUiState();
  }
}

export async function handleReset() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(resetStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(resetStatus, "Fai login prima di resettare.", true);
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
    const { response, data } = await resetRequest(
      baseUrl,
      state.accessToken,
      DEFAULT_RESET_SECRET
    );

    if (!response.ok) {
      if (data) {
        setStatus(resetStatus, formatResetResponse(data), true);
        return;
      }
      throw new Error(`Errore HTTP ${response.status}`);
    }

    if (data) {
      setStatus(resetStatus, formatResetResponse(data), data.success !== true);
    } else {
      setStatus(resetStatus, "Reset completato.");
    }
  } catch (error) {
    setStatus(resetStatus, `Errore reset: ${error.message}`, true);
  } finally {
    refreshUiState();
  }
}

export async function handleFetchBackups(isAutoRefresh = false) {
  if (isAutoRefresh && state.backupsAutoRefreshDisabled) {
    return;
  }

  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(backupsStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(backupsStatus, "Fai login prima di leggere i backup.", true);
    return;
  }

  if (!isAutoRefresh) {
    refreshBackupsBtn.disabled = true;
  }
  setStatus(backupsStatus, "Caricamento backup...", false);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BACKUPS_REQUEST_TIMEOUT_MS);

  try {
    const payload = await fetchBackupsRequest(baseUrl, state.accessToken, controller.signal);
    const backups = normalizeBackups(payload);
    renderBackupsList(backups, (backup, button) =>
      handleDownloadBackup(backup.timestamp, backup.label, button)
    );
    setStatus(backupsStatus, "Lista backup aggiornata.");
    state.backupsAutoRefreshDisabled = false;
  } catch (error) {
    clearBackupsList("Errore nel caricamento dei backup.");
    if (error.name === "AbortError") {
      setStatus(backupsStatus, "Timeout backup: aggiornamento automatico sospeso.", true);
      state.backupsAutoRefreshDisabled = true;
      stopBackupsAutoRefresh();
    } else {
      setStatus(backupsStatus, `Errore backup: ${error.message}`, true);
    }
  } finally {
    window.clearTimeout(timeoutId);
    refreshUiState();
  }
}

export async function handleDownloadBackup(timestamp, label, button) {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(backupsStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
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
    const blob = await downloadBackupRequest(baseUrl, state.accessToken, timestamp);
    const safePart = sanitizeFilenamePart(label || timestamp) || "backup_download";
    const filename = safePart.toLowerCase().endsWith(".zip") ? safePart : `${safePart}.zip`;
    triggerBlobDownload(blob, filename);
    setStatus(backupsStatus, "Backup scaricato. Controlla la cartella Download.");
  } catch (error) {
    setStatus(backupsStatus, `Errore download backup: ${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
    }
    refreshUiState();
  }
}

export async function handleFetchMapping() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(importStatus, "Fai login prima di ottenere il mapping.", true);
    return;
  }

  setImportLoading(true);
  updateImportSummary();
  setStatus(importStatus, "Richiesta mapping attuale...", false);

  try {
    state.loadedMappingNew = await fetchMappingRequest(baseUrl, state.accessToken);
    if (state.loadedMappingOld) {
      buildAssociationUI(refreshUiState);
    } else {
      clearAssociationList("Carica anche il config.json con MAPPING.");
    }
    setStatus(importStatus, "Mapping nuovo ottenuto.");
  } catch (error) {
    state.loadedMappingNew = null;
    clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
    setStatus(importStatus, `Errore mapping nuovo: ${error.message}`, true);
  } finally {
    setImportLoading(false);
    updateImportSummary();
    refreshUiState();
  }
}

export function handleConfigFile(event) {
  const file = event.target.files[0];
  if (!file) {
    state.loadedConfig = null;
    state.loadedMappingOld = null;
    state.loadedPayloadByKey = {};
    resetCameraLicenseAssignments();
    clearImportKeyList();
    state.associationSelections.clear();
    clearAssociationList("Carica il config.json con MAPPING e ottieni quello nuovo.");
    updateImportSummary();
    setImportLoading(false);
    refreshUiState();
    return;
  }

  state.loadedFilename = file.name || "config.json";
  setStatus(importStatus, "Caricamento config...", false);

  readConfigFile(file)
    .then((payload) => {
      const extracted = extractConfigPayload(payload);
      state.loadedConfig = extracted.config;
      state.loadedMappingOld = extracted.mapping;
      state.loadedPayloadByKey = extracted.payloadByKey;
      initializeCameraLicenseAssignments(extracted.config);
      renderImportKeyOptions(state.loadedPayloadByKey, refreshUiState);
      updateImportSummary();

      if (!state.loadedConfig) {
        setStatus(importStatus, "CHANNELS non trovato nel config.json.", true);
        refreshUiState();
        return;
      }

      if (!state.loadedMappingOld) {
        setStatus(importStatus, "MAPPING non trovato nel config.json.", true);
        clearAssociationList("Serve un MAPPING valido nel config.json.");
        updateImportSummary();
        refreshUiState();
        return;
      }

      if (state.loadedMappingNew) {
        buildAssociationUI(refreshUiState);
      } else {
        clearAssociationList("Ottieni il mapping nuovo dal server.");
      }

      setStatus(importStatus, "config.json caricato. Ottieni il mapping nuovo.");
      updateImportSummary();
      refreshUiState();

      const baseUrl = normalizeBaseUrl(baseUrlInput.value);
      if (baseUrl && state.accessToken) {
        handleFetchMapping();
      }
    })
    .catch((error) => {
      state.loadedConfig = null;
      state.loadedMappingOld = null;
      state.loadedPayloadByKey = {};
      resetCameraLicenseAssignments();
      clearImportKeyList();
      updateImportSummary();
      setImportLoading(false);
      setStatus(importStatus, `Errore JSON: ${error.message}`, true);
      refreshUiState();
    });
}

export async function handleImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(importStatus, "Fai login prima di importare.", true);
    return;
  }
  if (!state.loadedConfig) {
    setStatus(importStatus, "Carica prima un config.json.", true);
    return;
  }
  if (!state.loadedMappingOld || !state.loadedMappingNew) {
    setStatus(importStatus, "Carica il config.json con MAPPING e ottieni quello nuovo.", true);
    return;
  }
  if (!areAssociationsComplete()) {
    setStatus(importStatus, "Completa tutte le associazioni.", true);
    return;
  }

  updateImportState(false);
  setStatus(importStatus, "Invio import in corso...");

  try {
    const payloadCopy = JSON.parse(JSON.stringify(state.loadedPayloadByKey));
    const guidMap = new Map(state.associationSelections);

    state.selectedImportKeys.forEach((key) => {
      if (isImportKeyAllowed(key) && Object.prototype.hasOwnProperty.call(payloadCopy, key)) {
        if (key === "CHANNELS") {
          applyCameraLicenseAssignments(payloadCopy[key]);
        }
        applyGuidMapToConfig(payloadCopy[key], guidMap);
      }
    });

    const importPayload = {};
    state.selectedImportKeys.forEach((key) => {
      if (isImportKeyAllowed(key) && Object.prototype.hasOwnProperty.call(payloadCopy, key)) {
        importPayload[key] = payloadCopy[key];
      }
    });

    if (Object.prototype.hasOwnProperty.call(importPayload, "CHANNELS")) {
      const licenseValidation = validateCameraLicenses(importPayload.CHANNELS);
      if (!licenseValidation.ok) {
        setStatus(importStatus, licenseValidation.message, true);
        return;
      }
    }

    const { response, data } = await importRequest(baseUrl, state.accessToken, importPayload);
    if (!response.ok) {
      if (data) {
        setStatus(importStatus, formatImportResponse(data), true);
        return;
      }
      throw new Error(`Errore HTTP ${response.status}`);
    }

    if (data) {
      setStatus(importStatus, formatImportResponse(data), data.success !== true);
    } else {
      setStatus(importStatus, "Import fallito.", true);
    }
  } catch (error) {
    setStatus(importStatus, `Errore import: ${error.message}`, true);
  } finally {
    refreshUiState();
  }
}

export function handleBaseUrlChange() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (baseUrl !== state.lastBaseUrl) {
    state.lastBaseUrl = baseUrl;
    resetAccessToken("Login da rifare: base URL cambiato.");
    resetAuthServices("Carica gli auth service");
    resetArtecoTargetServices();
  }
  refreshUiState();
}

export function handleCredentialChange() {
  resetAccessToken("Login da rifare: credenziali cambiate.");
  refreshUiState();
}

export const navigationHandlers = {
  showArtecoPage,
  showHome,
  showUssTool,
};
