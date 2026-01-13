const baseUrlInput = document.getElementById("baseUrl");
const importBtn = document.getElementById("importBtn");
const importStatus = document.getElementById("importStatus");
const configFileInput = document.getElementById("configFile");
const mappingFileInput = document.getElementById("mappingFile");
const exportBtn = document.getElementById("exportBtn");
const exportStatus = document.getElementById("exportStatus");

const guidFields = {
  HypernodeCameraService: document.getElementById("guidCamera"),
  HypernodeAuthService: document.getElementById("guidAuth"),
  HypernodeEventService: document.getElementById("guidEvent"),
  HypernodeRecordingService: document.getElementById("guidRecording"),
  HypernodeSnapshotService: document.getElementById("guidSnapshot"),
};

let loadedConfig = null;
let loadedFilename = "config.json";
let loadedMapping = null;

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").trim();
}

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#8b2f2f" : "";
}

function updateImportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  importBtn.disabled = !(baseUrlReady && loadedConfig && loadedMapping);
}

function updateExportState() {
  exportBtn.disabled = false;
}

async function handleExport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(exportStatus, "Inserisci un base URL valido.", true);
    return;
  }

  exportBtn.disabled = true;
  setStatus(exportStatus, "Download in corso...");

  try {
    const response = await fetch(`${baseUrl}/api/v2/export`, {
      method: "GET",
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

function handleConfigFile(event) {
  const file = event.target.files[0];
  if (!file) {
    loadedConfig = null;
    updateImportState();
    return;
  }

  loadedFilename = file.name || "config.json";
  setStatus(exportStatus, "Caricamento file...", false);

  readConfigFile(file)
    .then((config) => {
      loadedConfig = config;
      setStatus(importStatus, "config.json caricato. Carica il mapping.");
      updateImportState();
    })
    .catch((error) => {
      loadedConfig = null;
      setStatus(importStatus, `Errore JSON: ${error.message}`, true);
      updateImportState();
    });
}

function applyMappingToFields(mapping) {
  if (!mapping || !Array.isArray(mapping.services)) {
    return false;
  }

  let updated = false;
  mapping.services.forEach((service) => {
    if (!service || typeof service !== "object") {
      return;
    }
    const field = guidFields[service.serviceType];
    if (field && typeof service.serviceGuid === "string") {
      field.value = service.serviceGuid;
      updated = true;
    }
  });

  return updated;
}

function handleMappingFile(event) {
  const file = event.target.files[0];
  if (!file) {
    loadedMapping = null;
    updateImportState();
    return;
  }

  setStatus(importStatus, "Caricamento mapping...", false);

  readConfigFile(file)
    .then((mapping) => {
      loadedMapping = mapping;
      const didUpdate = applyMappingToFields(mapping);
      if (didUpdate) {
        setStatus(importStatus, "Mapping caricato. Campi precompilati.");
      } else {
        setStatus(importStatus, "Mapping caricato ma nessun GUID trovato.", true);
      }
      updateImportState();
    })
    .catch((error) => {
      loadedMapping = null;
      setStatus(importStatus, `Errore mapping: ${error.message}`, true);
      updateImportState();
    });
}

function applyMappingToConfig(config, mapping) {
  if (!mapping || !Array.isArray(mapping.services)) {
    return;
  }
  mapping.services.forEach((service) => {
    if (!service || typeof service !== "object") {
      return;
    }
    if (typeof service.serviceType === "string" && typeof service.serviceGuid === "string") {
      applyGuidToConfig(config, service.serviceType, service.serviceGuid);
    }
  });
}

async function handleImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }

  if (!loadedConfig) {
    setStatus(importStatus, "Carica prima un config.json.", true);
    return;
  }

  if (!loadedMapping) {
    setStatus(importStatus, "Carica prima un mapping.json.", true);
    return;
  }

  importBtn.disabled = true;
  setStatus(importStatus, "Invio import in corso...");

  try {
    const configCopy = JSON.parse(JSON.stringify(loadedConfig));
    applyMappingToConfig(configCopy, loadedMapping);

    const response = await fetch(`${baseUrl}/api/v2/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(configCopy),
    });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (payload && payload.success === true) {
      setStatus(importStatus, "OK");
    } else if (payload && typeof payload.message === "string") {
      setStatus(importStatus, payload.message, true);
    } else {
      setStatus(importStatus, "Import fallito.", true);
    }
  } catch (error) {
    setStatus(importStatus, `Errore import: ${error.message}`, true);
  } finally {
    updateImportState();
  }
}

baseUrlInput.addEventListener("input", updateImportState);
baseUrlInput.addEventListener("input", updateExportState);
exportBtn.addEventListener("click", handleExport);
configFileInput.addEventListener("change", handleConfigFile);
mappingFileInput.addEventListener("change", handleMappingFile);
importBtn.addEventListener("click", handleImport);

updateImportState();
updateExportState();
