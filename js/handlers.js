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
import { t } from "./i18n.js";
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
  clearBackupsList(t("loginToViewBackups"));
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
    parts.push(`<div>${t("resetErrors")}</div><ul>${rows}</ul>`);
  }

  if (parts.length === 0) {
    return payload?.success === true ? "OK" : t("resetFailed");
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
        message: t("noLicenseNewServer"),
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
          t("cameraFallback", { index: cameraIndex + 1 });
        return {
          ok: false,
          message: t("licenseMissingCamera", { camera: cameraName }),
        };
      }
      if (!capacityByType.has(licenseType)) {
        return {
          ok: false,
          message: t("licenseNotPresentNewServer", { license: licenseType }),
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
        message: t("licenseInsufficient", { license: licenseType, used, capacity }),
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
    setStatus(loginStatus, t("baseUrlInvalid"), true);
    return [];
  }

  setStatus(loginStatus, t("authLoading"), false);

  try {
    const payload = await fetchAuthServices(baseUrl);
    const services = normalizeAuthServices(payload);

    if (services.length === 0) {
      resetAuthServices(t("authNoServiceFound"));
      setStatus(loginStatus, t("authNoServiceAvailable"), true);
      return [];
    }

    state.authServices = services;
    renderAuthServices(services);
    setStatus(loginStatus, t("authLoaded"));
    return services;
  } catch (error) {
    resetAuthServices(t("authLoadServices"));
    setStatus(loginStatus, t("authServiceError", { message: error.message }), true);
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
    setStatus(loginStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!username || !password) {
    setStatus(loginStatus, t("credentialsRequired"), true);
    return;
  }

  setLoginLoading(true);
  loginBtn.disabled = true;
  setStatus(loginStatus, t("loginInProgress"), false);

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
      setStatus(loginStatus, t("loginSelectService"), true);
      return;
    }

    const payload = await loginRequest(baseUrl, authGuid, username, password);
    const token =
      payload?.root?.access_token ||
      payload?.access_token ||
      payload?.root?.accessToken ||
      "";
    if (!token) {
      throw new Error(t("accessTokenMissing"));
    }

    state.accessToken = token;
    storeAvailableLicenses(payload);
    setStatus(loginStatus, t("loginOk"));
    state.backupsAutoRefreshDisabled = false;
    startBackupsAutoRefresh();
    handleFetchBackups();
    syncArtecoTargetServices();
    showHome();
  } catch (error) {
    state.accessToken = "";
    setStatus(loginStatus, t("loginError", { message: error.message }), true);
  } finally {
    setLoginLoading(false);
    refreshUiState();
  }
}

export async function handleExport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(exportStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(exportStatus, t("loginNeedBeforeExport"), true);
    return;
  }

  updateExportState(false);
  setStatus(exportStatus, t("exportDownloadInProgress"));

  try {
    const blob = await exportRequest(baseUrl, state.accessToken);
    const filename = `export_${new Date().toISOString().slice(0, 10)}.zip`;
    triggerBlobDownload(blob, filename);
    setStatus(exportStatus, t("exportDownloaded"));
  } catch (error) {
    setStatus(exportStatus, t("exportDownloadError", { message: error.message }), true);
  } finally {
    refreshUiState();
  }
}

export async function handleReset() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(resetStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(resetStatus, t("loginNeedBeforeReset"), true);
    return;
  }

  const confirmed = window.confirm(t("resetConfirm"));
  if (!confirmed) {
    setStatus(resetStatus, t("resetCanceled"));
    return;
  }

  resetBtn.disabled = true;
  setStatus(resetStatus, t("resetInProgress"), false);

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
      throw new Error(t("httpError", { status: response.status }));
    }

    if (data) {
      setStatus(resetStatus, formatResetResponse(data), data.success !== true);
    } else {
      setStatus(resetStatus, t("resetCompleted"));
    }
  } catch (error) {
    setStatus(resetStatus, t("resetError", { message: error.message }), true);
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
    setStatus(backupsStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(backupsStatus, t("loginNeedBeforeBackups"), true);
    return;
  }

  if (!isAutoRefresh) {
    refreshBackupsBtn.disabled = true;
  }
  setStatus(backupsStatus, t("backupsLoading"), false);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BACKUPS_REQUEST_TIMEOUT_MS);

  try {
    const payload = await fetchBackupsRequest(baseUrl, state.accessToken, controller.signal);
    const backups = normalizeBackups(payload);
    renderBackupsList(backups, (backup, button) =>
      handleDownloadBackup(backup.timestamp, backup.label, button)
    );
    setStatus(backupsStatus, t("backupsUpdated"));
    state.backupsAutoRefreshDisabled = false;
  } catch (error) {
    clearBackupsList(t("backupsLoadError"));
    if (error.name === "AbortError") {
      setStatus(backupsStatus, t("backupsTimeout"), true);
      state.backupsAutoRefreshDisabled = true;
      stopBackupsAutoRefresh();
    } else {
      setStatus(backupsStatus, t("backupsError", { message: error.message }), true);
    }
  } finally {
    window.clearTimeout(timeoutId);
    refreshUiState();
  }
}

export async function handleDownloadBackup(timestamp, label, button) {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(backupsStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(backupsStatus, t("loginNeedBeforeDownload"), true);
    return;
  }
  if (!timestamp) {
    setStatus(backupsStatus, t("backupTimestampInvalid"), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  setStatus(backupsStatus, t("backupDownloadInProgress", { label: label || timestamp }), false);

  try {
    const blob = await downloadBackupRequest(baseUrl, state.accessToken, timestamp);
    const safePart = sanitizeFilenamePart(label || timestamp) || "backup_download";
    const filename = safePart.toLowerCase().endsWith(".zip") ? safePart : `${safePart}.zip`;
    triggerBlobDownload(blob, filename);
    setStatus(backupsStatus, t("backupDownloaded"));
  } catch (error) {
    setStatus(backupsStatus, t("backupDownloadError", { message: error.message }), true);
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
    setStatus(importStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(importStatus, t("loginNeedBeforeMapping"), true);
    return;
  }

  setImportLoading(true);
  updateImportSummary();
  setStatus(importStatus, t("mappingRequestCurrent"), false);

  try {
    state.loadedMappingNew = await fetchMappingRequest(baseUrl, state.accessToken);
    if (state.loadedMappingOld) {
      buildAssociationUI(refreshUiState);
    } else {
      clearAssociationList(t("configNeedMappingToo"));
    }
    setStatus(importStatus, t("mappingNewLoaded"));
  } catch (error) {
    state.loadedMappingNew = null;
    clearAssociationList(t("configNeedMappingAndNew"));
    setStatus(importStatus, t("mappingNewError", { message: error.message }), true);
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
    clearAssociationList(t("configNeedMappingAndNew"));
    updateImportSummary();
    setImportLoading(false);
    refreshUiState();
    return;
  }

  state.loadedFilename = file.name || "config.json";
  setStatus(importStatus, t("configLoading"), false);

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
        setStatus(importStatus, t("channelsNotFound"), true);
        refreshUiState();
        return;
      }

      if (!state.loadedMappingOld) {
        setStatus(importStatus, t("mappingNotFound"), true);
        clearAssociationList(t("configNeedValidMapping"));
        updateImportSummary();
        refreshUiState();
        return;
      }

      if (state.loadedMappingNew) {
        buildAssociationUI(refreshUiState);
      } else {
        clearAssociationList(t("mappingFetchFromServer"));
      }

      setStatus(importStatus, t("configLoadedNeedMapping"));
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
      setStatus(importStatus, t("configJsonError", { message: error.message }), true);
      refreshUiState();
    });
}

export async function handleImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, t("baseUrlInvalid"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(importStatus, t("loginNeedBeforeImport"), true);
    return;
  }
  if (!state.loadedConfig) {
    setStatus(importStatus, t("configLoadFirst"), true);
    return;
  }
  if (!state.loadedMappingOld || !state.loadedMappingNew) {
    setStatus(importStatus, t("configNeedMappingAndNew"), true);
    return;
  }
  if (!areAssociationsComplete()) {
    setStatus(importStatus, t("associationsIncomplete"), true);
    return;
  }

  updateImportState(false);
  setStatus(importStatus, t("importInProgress"));

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
      throw new Error(t("httpError", { status: response.status }));
    }

    if (data) {
      setStatus(importStatus, formatImportResponse(data), data.success !== true);
    } else {
      setStatus(importStatus, t("importFailed"), true);
    }
  } catch (error) {
    setStatus(importStatus, t("importError", { message: error.message }), true);
  } finally {
    refreshUiState();
  }
}

export function handleBaseUrlChange() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (baseUrl !== state.lastBaseUrl) {
    state.lastBaseUrl = baseUrl;
    resetAccessToken(t("loginNeedRedoBaseUrl"));
    resetAuthServices(t("authLoadServices"));
    resetArtecoTargetServices();
  }
  refreshUiState();
}

export function handleCredentialChange() {
  resetAccessToken(t("loginNeedRedoCreds"));
  refreshUiState();
}

export const navigationHandlers = {
  showArtecoPage,
  showHome,
  showUssTool,
};
