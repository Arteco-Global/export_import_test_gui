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
  importBtn.disabled = normalizeBaseUrl(baseUrlInput.value) === "";
}

function updateExportState() {
  exportBtn.disabled = !loadedConfig;
}

async function handleImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(importStatus, "Inserisci un base URL valido.", true);
    return;
  }

  importBtn.disabled = true;
  setStatus(importStatus, "Download in corso...");

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

    setStatus(importStatus, "File scaricato. Controlla la cartella Download.");
  } catch (error) {
    setStatus(importStatus, `Errore download: ${error.message}`, true);
  } finally {
    updateImportState();
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
    updateExportState();
    return;
  }

  loadedFilename = file.name || "config.json";
  setStatus(exportStatus, "Caricamento file...", false);

  readConfigFile(file)
    .then((config) => {
      loadedConfig = config;
      setStatus(exportStatus, "File caricato. Inserisci i GUID e scarica.");
      updateExportState();
    })
    .catch((error) => {
      loadedConfig = null;
      setStatus(exportStatus, `Errore JSON: ${error.message}`, true);
      updateExportState();
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
    return;
  }

  setStatus(exportStatus, "Caricamento mapping...", false);

  readConfigFile(file)
    .then((mapping) => {
      loadedMapping = mapping;
      const didUpdate = applyMappingToFields(mapping);
      if (didUpdate) {
        setStatus(exportStatus, "Mapping caricato. Campi precompilati.");
      } else {
        setStatus(exportStatus, "Mapping caricato ma nessun GUID trovato.", true);
      }
    })
    .catch((error) => {
      loadedMapping = null;
      setStatus(exportStatus, `Errore mapping: ${error.message}`, true);
    });
}

function handleExport() {
  if (!loadedConfig) {
    setStatus(exportStatus, "Carica prima un config.json.", true);
    return;
  }

  const configCopy = JSON.parse(JSON.stringify(loadedConfig));
  Object.entries(guidFields).forEach(([serviceName, input]) => {
    const guid = input.value.trim();
    if (guid) {
      applyGuidToConfig(configCopy, serviceName, guid);
    }
  });

  const pretty = JSON.stringify(configCopy, null, 2);
  const blob = new Blob([pretty], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = loadedFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);

  setStatus(exportStatus, "Config aggiornato scaricato.");
}

baseUrlInput.addEventListener("input", updateImportState);
importBtn.addEventListener("click", handleImport);
configFileInput.addEventListener("change", handleConfigFile);
mappingFileInput.addEventListener("change", handleMappingFile);
exportBtn.addEventListener("click", handleExport);

updateImportState();
updateExportState();
