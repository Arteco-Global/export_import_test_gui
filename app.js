const baseUrlInput = document.getElementById("baseUrl");
const importBtn = document.getElementById("importBtn");
const importStatus = document.getElementById("importStatus");
const configFileInput = document.getElementById("configFile");
const mappingOldFileInput = document.getElementById("mappingOldFile");
const mappingNewFileInput = document.getElementById("mappingNewFile");
const previewConfigFileInput = document.getElementById("previewConfigFile");
const previewMappingFileInput = document.getElementById("previewMappingFile");
const previewList = document.getElementById("previewList");
const previewStatus = document.getElementById("previewStatus");
const exportBtn = document.getElementById("exportBtn");
const exportStatus = document.getElementById("exportStatus");
const associationList = document.getElementById("associationList");

let loadedConfig = null;
let loadedFilename = "config.json";
let loadedMappingOld = null;
let loadedMappingNew = null;
let previewConfig = null;
let previewMapping = null;
const associationSelections = new Map();

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").trim();
}

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#8b2f2f" : "";
}

function updateImportState() {
  const baseUrlReady = normalizeBaseUrl(baseUrlInput.value) !== "";
  const mappingsReady = loadedMappingOld && loadedMappingNew;
  const associationsReady = mappingsReady && areAssociationsComplete();
  importBtn.disabled = !(baseUrlReady && loadedConfig && mappingsReady && associationsReady);
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

function clearPreviewList(message) {
  previewList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.textContent = message;
  previewList.appendChild(placeholder);
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
    return fallbackType ? `${fallbackType} - ${serviceGuid}` : serviceGuid;
  }
  const name = info.serviceName ? ` (${info.serviceName})` : "";
  return `${info.serviceType}${name} - ${serviceGuid}`;
}

function renderPreview() {
  if (!previewConfig || !previewMapping) {
    clearPreviewList("Carica entrambi i file per vedere l'anteprima.");
    return;
  }

  const cameraServices = Array.isArray(previewConfig.cameraServices)
    ? previewConfig.cameraServices
    : [];
  const lookup = buildMappingLookup(previewMapping);

  previewList.innerHTML = "";

  if (cameraServices.length === 0) {
    clearPreviewList("Nessuna telecamera trovata nel config.");
    return;
  }

  cameraServices.forEach((serviceBlock) => {
    const cameras = Array.isArray(serviceBlock.cameras) ? serviceBlock.cameras : [];
    cameras.forEach((cameraEntry) => {
      const camera = cameraEntry.camera || {};
      const card = document.createElement("div");
      card.className = "preview-card";

      const title = document.createElement("h4");
      title.textContent = camera.descr || camera.hostname || camera._id || "Camera";
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "preview-meta";
      meta.textContent = camera._id ? `ID: ${camera._id}` : "ID: N/D";
      card.appendChild(meta);

      const services = document.createElement("div");
      services.className = "preview-services";

      const cameraService = document.createElement("div");
      cameraService.textContent = `Camera service: ${describeServiceGuid(
        serviceBlock.serviceGuid,
        lookup,
        serviceBlock.serviceType
      )}`;
      services.appendChild(cameraService);

      const associations = cameraEntry.associations || {};
      const associationTypes = [
        { key: "snapshot", label: "Snapshot" },
        { key: "recording", label: "Recording" },
        { key: "events", label: "Eventi" },
      ];

      associationTypes.forEach(({ key, label }) => {
        const items = Array.isArray(associations[key]) ? associations[key] : [];
        if (items.length === 0) {
          const row = document.createElement("div");
          row.textContent = `${label}: nessuna`;
          services.appendChild(row);
          return;
        }

        items.forEach((item) => {
          const row = document.createElement("div");
          row.textContent = `${label}: ${describeServiceGuid(
            item.serviceGuid,
            lookup,
            item.serviceType
          )}`;
          services.appendChild(row);
        });
      });

      card.appendChild(services);
      previewList.appendChild(card);
    });
  });
}

function buildAssociationUI(oldServices, newServices) {
  associationSelections.clear();
  associationList.innerHTML = "";

  if (oldServices.length === 0) {
    clearAssociationList("Nessun servizio trovato nel mapping vecchio.");
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
    updateImportState();
    return;
  }

  loadedFilename = file.name || "config.json";
  setStatus(importStatus, "Caricamento config...", false);

  readConfigFile(file)
    .then((config) => {
      loadedConfig = config;
      setStatus(importStatus, "config.json caricato. Carica i mapping.");
      updateImportState();
    })
    .catch((error) => {
      loadedConfig = null;
      setStatus(importStatus, `Errore JSON: ${error.message}`, true);
      updateImportState();
    });
}

function handleMappingOldFile(event) {
  const file = event.target.files[0];
  if (!file) {
    loadedMappingOld = null;
    associationSelections.clear();
    clearAssociationList("Carica entrambi i mapping per vedere le associazioni.");
    updateImportState();
    return;
  }

  setStatus(importStatus, "Caricamento mapping vecchio...", false);

  readConfigFile(file)
    .then((mappingOld) => {
      loadedMappingOld = mappingOld;
      const oldServices = extractServices(mappingOld);
      const newServices = extractServices(loadedMappingNew);
      if (loadedMappingNew) {
        buildAssociationUI(oldServices, newServices);
      } else {
        clearAssociationList("Carica anche il mapping nuovo.");
      }
      setStatus(importStatus, "Mapping vecchio caricato.");
      updateImportState();
    })
    .catch((error) => {
      loadedMappingOld = null;
      clearAssociationList("Carica entrambi i mapping per vedere le associazioni.");
      setStatus(importStatus, `Errore mapping vecchio: ${error.message}`, true);
      updateImportState();
    });
}

function handleMappingNewFile(event) {
  const file = event.target.files[0];
  if (!file) {
    loadedMappingNew = null;
    associationSelections.clear();
    clearAssociationList("Carica entrambi i mapping per vedere le associazioni.");
    updateImportState();
    return;
  }

  setStatus(importStatus, "Caricamento mapping nuovo...", false);

  readConfigFile(file)
    .then((mappingNew) => {
      loadedMappingNew = mappingNew;
      const oldServices = extractServices(loadedMappingOld);
      const newServices = extractServices(mappingNew);
      if (loadedMappingOld) {
        buildAssociationUI(oldServices, newServices);
      } else {
        clearAssociationList("Carica anche il mapping vecchio.");
      }
      setStatus(importStatus, "Mapping nuovo caricato.");
      updateImportState();
    })
    .catch((error) => {
      loadedMappingNew = null;
      clearAssociationList("Carica entrambi i mapping per vedere le associazioni.");
      setStatus(importStatus, `Errore mapping nuovo: ${error.message}`, true);
      updateImportState();
    });
}

function handlePreviewConfigFile(event) {
  const file = event.target.files[0];
  if (!file) {
    previewConfig = null;
    renderPreview();
    return;
  }

  setStatus(previewStatus, "Caricamento config...", false);
  readConfigFile(file)
    .then((config) => {
      previewConfig = config;
      setStatus(previewStatus, "config.json caricato.");
      renderPreview();
    })
    .catch((error) => {
      previewConfig = null;
      setStatus(previewStatus, `Errore config: ${error.message}`, true);
      renderPreview();
    });
}

function handlePreviewMappingFile(event) {
  const file = event.target.files[0];
  if (!file) {
    previewMapping = null;
    renderPreview();
    return;
  }

  setStatus(previewStatus, "Caricamento mapping...", false);
  readConfigFile(file)
    .then((mapping) => {
      previewMapping = mapping;
      setStatus(previewStatus, "mapping.json caricato.");
      renderPreview();
    })
    .catch((error) => {
      previewMapping = null;
      setStatus(previewStatus, `Errore mapping: ${error.message}`, true);
      renderPreview();
    });
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

  if (!loadedMappingOld || !loadedMappingNew) {
    setStatus(importStatus, "Carica i mapping del vecchio e nuovo server.", true);
    return;
  }

  if (!areAssociationsComplete()) {
    setStatus(importStatus, "Completa tutte le associazioni.", true);
    return;
  }

  importBtn.disabled = true;
  setStatus(importStatus, "Invio import in corso...");

  try {
    const configCopy = JSON.parse(JSON.stringify(loadedConfig));
    const guidMap = new Map(associationSelections);
    applyGuidMapToConfig(configCopy, guidMap);

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
mappingOldFileInput.addEventListener("change", handleMappingOldFile);
mappingNewFileInput.addEventListener("change", handleMappingNewFile);
previewConfigFileInput.addEventListener("change", handlePreviewConfigFile);
previewMappingFileInput.addEventListener("change", handlePreviewMappingFile);
importBtn.addEventListener("click", handleImport);

updateImportState();
updateExportState();
clearAssociationList("Carica entrambi i mapping per vedere le associazioni.");
clearPreviewList("Carica entrambi i file per vedere l'anteprima.");
