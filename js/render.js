import {
  associationList,
  authServiceSelect,
  backupsList,
  backupsSection,
  backupsStatus,
  backupsSummaryCount,
  exportBtn,
  exportSection,
  importBody,
  importBtn,
  importKeyList,
  importLoading,
  importSection,
  importSummary,
  importSummaryList,
  launcherSection,
  loginSection,
  loginBtn,
  loginSpinner,
  refreshBackupsBtn,
  resetBtn,
  resetSection,
  ussSection,
  artecoSection,
} from "./dom.js";
import { IMPORT_KEYS } from "./constants.js";
import { state } from "./state.js";
import {
  formatDateTime,
  formatRelativeTime,
  setStatus,
} from "./utils.js";
import {
  extractServices,
  formatServiceLabel,
  getCameraList,
  getCameraServices,
  getMappingList,
  getServiceLabel,
} from "./import-helpers.js";

export function showHome() {
  loginSection.classList.toggle("hidden", state.accessToken !== "");
  launcherSection.classList.toggle("hidden", state.accessToken === "");
  ussSection.classList.add("hidden");
  artecoSection.classList.add("hidden");
}

export function showUssTool() {
  loginSection.classList.add("hidden");
  launcherSection.classList.add("hidden");
  ussSection.classList.remove("hidden");
  artecoSection.classList.add("hidden");
}

export function showArtecoPage() {
  loginSection.classList.add("hidden");
  launcherSection.classList.add("hidden");
  ussSection.classList.add("hidden");
  artecoSection.classList.remove("hidden");
}

export function setLoginLoading(isLoading) {
  if (loginSpinner) {
    loginSpinner.classList.toggle("hidden", !isLoading);
  }
}

export function updateImportState(baseUrlReady) {
  const authReady = state.accessToken !== "";
  const hasSelection = state.selectedImportKeys.size > 0;
  const channelsSelected = state.selectedImportKeys.has("CHANNELS");
  const mappingsReady = state.loadedMappingOld && state.loadedMappingNew;
  const channelsReady = channelsSelected ? !!state.loadedConfig : true;
  const associationsReady = channelsSelected ? areAssociationsComplete() && mappingsReady : true;
  importBtn.disabled = !(baseUrlReady && authReady && hasSelection && channelsReady && associationsReady);
}

export function updateExportState(baseUrlReady) {
  const authReady = state.accessToken !== "";
  exportBtn.disabled = !(baseUrlReady && authReady);
}

export function updateAuthState(baseUrlReady, credsReady) {
  const tokenReady = state.accessToken !== "";
  authServiceSelect.disabled = state.authServices.length <= 1;
  loginBtn.disabled = !(baseUrlReady && credsReady);
  resetBtn.disabled = !(baseUrlReady && tokenReady);
  refreshBackupsBtn.disabled = !(baseUrlReady && tokenReady);
  exportSection.classList.toggle("hidden", !tokenReady);
  backupsSection.classList.toggle("hidden", !tokenReady);
  resetSection.classList.toggle("hidden", !tokenReady);
  importSection.classList.toggle("hidden", !tokenReady);
  if (refreshBackupsBtn) {
    refreshBackupsBtn.disabled = !(baseUrlReady && tokenReady);
  }
}

export function resetAuthServices(message) {
  state.authServices = [];
  authServiceSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = message || "Carica gli auth service";
  authServiceSelect.appendChild(option);
}

export function renderAuthServices(services) {
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

export function setImportLoading(isLoading) {
  importLoading.classList.toggle("hidden", !isLoading);
  importBody.classList.toggle("hidden", isLoading);
}

export function setBackupsSummaryCount(count) {
  const value = Number.isFinite(count) ? count : 0;
  backupsSummaryCount.textContent = String(value);
}

export function clearBackupsList(message) {
  backupsList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  backupsList.appendChild(placeholder);
  setStatus(backupsStatus, "");
  setBackupsSummaryCount(0);
}

export function normalizeAuthServices(payload) {
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

export function normalizeBackups(payload) {
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
        const name = item.name || item.filename || item.file || "";
        const createdAt = item.createdAt || item.created_at || item.created || "";
        const derivedTimestamp = deriveBackupTimestampFromName(name);
        const timestamp = derivedTimestamp || item.timestamp || item.ts || item.time || item.id || "";
        if (!timestamp && !name && !createdAt) {
          return null;
        }
        return {
          timestamp: String(timestamp || createdAt || name),
          label: String(createdAt || timestamp || name),
          createdAt: String(createdAt || ""),
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function formatBackupLabel(backup) {
  const parsed = backup.createdAt ? new Date(backup.createdAt) : null;
  const dateText =
    parsed && !Number.isNaN(parsed.getTime()) ? formatDateTime(parsed) : backup.label;
  const relative =
    parsed && !Number.isNaN(parsed.getTime()) ? formatRelativeTime(parsed) : "tempo non disponibile";
  return `${dateText} (backup di ${relative})`;
}

export function renderBackupsList(backups, onDownload) {
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
    button.addEventListener("click", () => onDownload(backup, button));

    actions.appendChild(button);
    row.appendChild(label);
    row.appendChild(actions);
    backupsList.appendChild(row);
  });
}

export function renderImportKeyOptions(payloadByKey, onChange) {
  importKeyList.innerHTML = "";
  state.selectedImportKeys.clear();
  const checkboxByKey = new Map();
  const dependentKeys = ["SNAPSHOTS", "RECORDINGS", "EVENTS", "METADATA"];
  const dependentKeyState = new Map();
  const hiddenKeys = new Set(["MAPPING", "EXPORTED_AT", "GATEWAY_VERSION"]);

  hiddenKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payloadByKey, key)) {
      state.selectedImportKeys.add(key);
    }
  });

  const keysAvailable = IMPORT_KEYS.filter(
    (key) => Object.prototype.hasOwnProperty.call(payloadByKey, key)
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
      state.selectedImportKeys.add(key);
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedImportKeys.add(key);
      } else {
        state.selectedImportKeys.delete(key);
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
            state.selectedImportKeys.delete(depKey);
          } else {
            const shouldCheck = dependentKeyState.get(depKey);
            depCheckbox.disabled = false;
            if (shouldCheck) {
              depCheckbox.checked = true;
              state.selectedImportKeys.add(depKey);
            }
          }
        });
      }

      onChange();
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
      state.selectedImportKeys.delete(depKey);
    });
  }
}

export function clearImportKeyList() {
  state.selectedImportKeys.clear();
  importKeyList.innerHTML = '<div class="placeholder">Carica un config.json per selezionare le chiavi.</div>';
}

export function clearAssociationList(message) {
  associationList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  associationList.appendChild(placeholder);
}

export function buildAssociationUI(onChange) {
  state.associationSelections.clear();
  associationList.innerHTML = "";

  const oldServices = extractServices(state.loadedMappingOld);
  const newServices = extractServices(state.loadedMappingNew);

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
      state.associationSelections.set(oldService.serviceGuid, candidates[0].serviceGuid);
    } else if (oldService.serviceName) {
      const match = candidates.find((candidate) => candidate.serviceName === oldService.serviceName);
      if (match) {
        select.value = match.serviceGuid;
        state.associationSelections.set(oldService.serviceGuid, match.serviceGuid);
      }
    }

    select.addEventListener("change", () => {
      if (select.value) {
        state.associationSelections.set(oldService.serviceGuid, select.value);
      } else {
        state.associationSelections.delete(oldService.serviceGuid);
      }
      onChange();
    });

    row.appendChild(typeLabel);
    row.appendChild(oldGuid);
    row.appendChild(select);
    associationList.appendChild(row);
  });
}

export function areAssociationsComplete() {
  if (!state.loadedMappingOld) {
    return false;
  }
  return extractServices(state.loadedMappingOld).every((service) =>
    state.associationSelections.has(service.serviceGuid)
  );
}

export function renderRecapList(container, payload) {
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
      const list = document.createElement("div");
      list.className = "recap-item-body";
      const cameras = getCameraList(service);
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

export function updateImportSummary() {
  if (!importSummary || !importSummaryList) {
    return;
  }
  if (!state.loadedPayloadByKey || !state.loadedMappingOld || !state.loadedMappingNew) {
    importSummary.classList.add("hidden");
    importSummaryList.innerHTML = "";
    return;
  }
  renderRecapList(importSummaryList, state.loadedPayloadByKey);
  importSummary.classList.remove("hidden");
}
