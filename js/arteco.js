import {
  artecoApplyLicenseMissingBtn,
  artecoApplyLicenseSelectedBtn,
  artecoBulkLicenseSelect,
  artecoCameraList,
  artecoImportBtn,
  artecoImportStatus,
  artecoLicenseSummary,
  artecoSelectedCount,
  artecoTargetServiceSelect,
  baseUrlInput,
} from "./dom.js";
import { fetchMappingRequest, importRequest } from "./api.js";
import { extractServices, formatImportResponse } from "./import-helpers.js";
import { state } from "./state.js";
import { normalizeBaseUrl, setStatus } from "./utils.js";

const SOURCE_TYPE_LABELS = {
  4: "Axis",
  10: "Bosch",
  15: "Samsung",
  25: "ONVIF",
  33: "Hanwha / Wisenet",
  36: "NVR bridge",
};

function textOrEmpty(element) {
  return element ? element.textContent.trim() : "";
}

function attrOrEmpty(element, name) {
  return element ? element.getAttribute(name) || "" : "";
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseUrlSafely(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function derivePorts(url, host) {
  const parsedUrl = parseUrlSafely(url);

  let onvifPort = 80;
  let onvifRtspPort = 554;

  if (parsedUrl) {
    if (parsedUrl.protocol === "rtsp:") {
      onvifRtspPort = parsedUrl.port ? parseNumber(parsedUrl.port, 554) : 554;
    } else if (parsedUrl.port) {
      onvifPort = parseNumber(parsedUrl.port, 80);
    } else if (parsedUrl.protocol === "https:") {
      onvifPort = 443;
    }
  }

  if (!host && parsedUrl?.hostname) {
    return {
      ipAddress: parsedUrl.hostname,
      onvifPort,
      onvifRtspPort,
    };
  }

  return {
    ipAddress: host,
    onvifPort,
    onvifRtspPort,
  };
}

function getSourceTypeLabel(type) {
  return SOURCE_TYPE_LABELS[type] || `Tipo ${type}`;
}

function parseArtecoVideoSource(node, index) {
  const sourceCfg = node.querySelector("sourcecfg");
  const sourceParams = sourceCfg?.querySelector("s-params");
  const mainStream = sourceParams?.querySelector("main-stream");
  const subStream = sourceParams?.querySelector("sub-stream");

  const sourceType = parseNumber(attrOrEmpty(sourceCfg, "type"), -1);
  const name = attrOrEmpty(node, "descr") || `Camera ${index + 1}`;
  const url = attrOrEmpty(sourceParams, "urladdr");
  const host = attrOrEmpty(sourceParams, "addr");
  const username = attrOrEmpty(sourceParams, "user");
  const password = attrOrEmpty(sourceParams, "pass");
  const enabled = attrOrEmpty(node, "ena") !== "0";
  const rtspViaTcp = attrOrEmpty(sourceParams, "RTSP-via-TCP") === "1";
  const channelId = attrOrEmpty(node, "id");
  const channelIndex = attrOrEmpty(node, "idx");
  const sourceProfile = attrOrEmpty(sourceParams, "src-tk") || attrOrEmpty(sourceParams, "idx");
  const vendor = getSourceTypeLabel(sourceType);
  const geoReferences = node.querySelector("GeoReferences");
  const connectionInfo = derivePorts(url, host);
  const groupName = attrOrEmpty(sourceParams, "groupName");

  return {
    artecoId: channelId || `arteco-${index + 1}`,
    channelIndex,
    name,
    enabled,
    host: connectionInfo.ipAddress || host,
    url,
    username,
    password,
    rtspViaTcp,
    sourceType,
    vendor,
    category: attrOrEmpty(node, "cat"),
    description: name,
    groupName,
    mainStreamFps: attrOrEmpty(mainStream, "fps") || attrOrEmpty(sourceParams, "fps"),
    subStreamFps: attrOrEmpty(subStream, "fps"),
    rawProfile: sourceProfile,
    latitude: parseNumber(attrOrEmpty(geoReferences, "latitude"), 0),
    longitude: parseNumber(attrOrEmpty(geoReferences, "longitude"), 0),
    onvifPort: connectionInfo.onvifPort,
    onvifRtspPort: connectionInfo.onvifRtspPort,
  };
}

export function parseArtecoXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(textOrEmpty(parseError) || "XML non valido.");
  }

  const sources = Array.from(doc.querySelectorAll("video-source"));
  const cameras = sources.map(parseArtecoVideoSource);

  const groupFallbacks = new Map();
  cameras.forEach((camera) => {
    if (!camera.groupName) {
      return;
    }

    const existing = groupFallbacks.get(camera.groupName) || {};
    groupFallbacks.set(camera.groupName, {
      host: existing.host || camera.host || "",
      username: existing.username || camera.username || "",
      password: existing.password || camera.password || "",
      onvifPort: existing.onvifPort || camera.onvifPort || 80,
      onvifRtspPort: existing.onvifRtspPort || camera.onvifRtspPort || 554,
    });
  });

  cameras.forEach((camera) => {
    if (!camera.groupName) {
      return;
    }

    const fallback = groupFallbacks.get(camera.groupName);
    if (!fallback) {
      return;
    }

    if (!camera.host) {
      camera.host = fallback.host;
    }
    if (!camera.username) {
      camera.username = fallback.username;
    }
    if (!camera.password) {
      camera.password = fallback.password;
    }
    if (!camera.onvifPort) {
      camera.onvifPort = fallback.onvifPort;
    }
    if (!camera.onvifRtspPort) {
      camera.onvifRtspPort = fallback.onvifRtspPort;
    }
  });

  return cameras.filter((camera) => String(camera.host || "").trim() !== "");
}

function buildArtecoCameraDetails(camera) {
  const parts = [
    camera.vendor,
    camera.host || camera.url || "endpoint non disponibile",
  ];
  if (camera.username) {
    parts.push(`user ${camera.username}`);
  }
  if (camera.mainStreamFps) {
    parts.push(`main ${camera.mainStreamFps} fps`);
  }
  if (camera.subStreamFps) {
    parts.push(`sub ${camera.subStreamFps} fps`);
  }
  return parts.join(" • ");
}

function normalizeLicensePayload(payload) {
  const licenseRoot =
    payload?.license ||
    payload?.root?.license ||
    payload?.data?.license ||
    payload?.root?.data?.license ||
    payload?.root?.root?.license ||
    payload?.payload?.license ||
    null;
  const licenses = Array.isArray(licenseRoot?.licenses) ? licenseRoot.licenses : [];

  return licenses
    .map((license) => ({
      type: String(license?.type || "").trim(),
      channels: Number(license?.channels || 0),
    }))
    .filter((license) => license.type !== "" && license.channels > 0);
}

export function storeAvailableLicenses(payload) {
  state.availableLicenses = normalizeLicensePayload(payload);
  if (state.availableLicenses.length === 0) {
    const nestedLicense = findNestedLicenseObject(payload);
    if (nestedLicense) {
      state.availableLicenses = normalizeLicensePayload({ license: nestedLicense });
    }
  }
}

function findNestedLicenseObject(value, visited = new Set()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (
    value.license &&
    typeof value.license === "object" &&
    Array.isArray(value.license.licenses)
  ) {
    return value.license;
  }

  if (Array.isArray(value.licenses)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const result = findNestedLicenseObject(child, visited);
    if (result) {
      return result;
    }
  }

  return null;
}

function getSelectedCameraLicense(cameraId) {
  return state.artecoLicenseAssignments.get(cameraId) || "";
}

function getAssignedLicenseUsage() {
  const usage = new Map();

  state.artecoSelectedCameraIds.forEach((cameraId) => {
    const licenseType = state.artecoLicenseAssignments.get(cameraId);
    if (!licenseType) {
      return;
    }
    usage.set(licenseType, (usage.get(licenseType) || 0) + 1);
  });

  return usage;
}

function getLicenseAvailabilityMap() {
  const usage = getAssignedLicenseUsage();
  const availability = new Map();

  state.availableLicenses.forEach((license) => {
    availability.set(license.type, {
      total: license.channels,
      used: usage.get(license.type) || 0,
    });
  });

  return availability;
}

function hasLicenseCapacityForCamera(licenseType, cameraId) {
  if (!licenseType) {
    return true;
  }

  const license = state.availableLicenses.find((item) => item.type === licenseType);
  if (!license) {
    return false;
  }

  const usage = getAssignedLicenseUsage();
  const currentAssignment = state.artecoLicenseAssignments.get(cameraId);
  const used = usage.get(licenseType) || 0;
  const effectiveUsed = currentAssignment === licenseType ? used - 1 : used;

  return effectiveUsed < license.channels;
}

function validateSelectedCameraLicenses() {
  const selectedCameras = getSelectedArtecoCameras();
  if (selectedCameras.length === 0) {
    return { ok: false, message: "Seleziona almeno una camera da inviare." };
  }

  for (const camera of selectedCameras) {
    const licenseType = state.artecoLicenseAssignments.get(camera.artecoId);
    if (!licenseType) {
      return { ok: false, message: `Seleziona una licenza per la camera "${camera.name}".` };
    }
  }

  const usage = getAssignedLicenseUsage();
  for (const license of state.availableLicenses) {
    const used = usage.get(license.type) || 0;
    if (used > license.channels) {
      return {
        ok: false,
        message: `Licenze insufficienti per ${license.type}: assegnate ${used}, disponibili ${license.channels}.`,
      };
    }
  }

  return { ok: true, message: "" };
}

function renderArtecoLicenseSummary() {
  artecoLicenseSummary.innerHTML = "";

  if (state.availableLicenses.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Fai login per caricare le licenze disponibili.";
    artecoLicenseSummary.appendChild(placeholder);
    return;
  }

  const availability = getLicenseAvailabilityMap();
  state.availableLicenses.forEach((license) => {
    const item = document.createElement("div");
    item.className = "arteco-license-item";

    const type = document.createElement("div");
    type.className = "arteco-license-type";
    type.textContent = license.type;

    const counters = availability.get(license.type) || { total: license.channels, used: 0 };
    const count = document.createElement("div");
    count.className = "arteco-license-count";
    count.textContent = `${Math.max(counters.total - counters.used, 0)} libere / ${counters.total}`;

    item.appendChild(type);
    item.appendChild(count);
    artecoLicenseSummary.appendChild(item);
  });
}

function renderArtecoBulkLicenseOptions() {
  artecoBulkLicenseSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleziona licenza";
  artecoBulkLicenseSelect.appendChild(placeholder);

  const availability = getLicenseAvailabilityMap();
  state.availableLicenses.forEach((license) => {
    const counters = availability.get(license.type) || { total: license.channels, used: 0 };
    const remaining = counters.total - counters.used;
    if (remaining <= 0) {
      return;
    }

    const option = document.createElement("option");
    option.value = license.type;
    option.textContent = `${license.type} (${remaining} libere / ${license.channels})`;
    artecoBulkLicenseSelect.appendChild(option);
  });

  artecoBulkLicenseSelect.value = state.artecoBulkLicenseType;
  if (artecoBulkLicenseSelect.value !== state.artecoBulkLicenseType) {
    state.artecoBulkLicenseType = artecoBulkLicenseSelect.value;
  }
}

function renderArtecoTargetServices() {
  artecoTargetServiceSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent =
    state.artecoTargetServices.length === 0
      ? "Nessun servizio target disponibile"
      : "Seleziona servizio target";
  artecoTargetServiceSelect.appendChild(placeholder);

  state.artecoTargetServices.forEach((service) => {
    const option = document.createElement("option");
    option.value = service.serviceGuid;
    option.textContent = service.serviceName
      ? `${service.serviceGuid} - ${service.serviceName} (${service.serviceType})`
      : `${service.serviceGuid} (${service.serviceType})`;
    artecoTargetServiceSelect.appendChild(option);
  });

  if (
    state.artecoTargetServiceGuid &&
    state.artecoTargetServices.some((service) => service.serviceGuid === state.artecoTargetServiceGuid)
  ) {
    artecoTargetServiceSelect.value = state.artecoTargetServiceGuid;
  } else if (state.artecoTargetServices.length === 1) {
    state.artecoTargetServiceGuid = state.artecoTargetServices[0].serviceGuid;
    artecoTargetServiceSelect.value = state.artecoTargetServiceGuid;
  }
}

function renderArtecoCameraList() {
  artecoCameraList.innerHTML = "";

  if (state.artecoCameras.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "Carica un file XML per analizzare le camere.";
    artecoCameraList.appendChild(placeholder);
    return;
  }

  state.artecoCameras.forEach((camera) => {
    const row = document.createElement("label");
    row.className = "arteco-camera-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.artecoSelectedCameraIds.has(camera.artecoId);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.artecoSelectedCameraIds.add(camera.artecoId);
      } else {
        state.artecoSelectedCameraIds.delete(camera.artecoId);
      }
      refreshArtecoUiState();
    });

    const body = document.createElement("div");
    body.className = "arteco-camera-body";

    const titleRow = document.createElement("div");
    titleRow.className = "arteco-camera-title";

    const title = document.createElement("div");
    title.textContent = camera.name;

    const badge = document.createElement("span");
    badge.className = `arteco-camera-badge ${camera.enabled ? "is-enabled" : "is-disabled"}`;
    badge.textContent = camera.enabled ? "attiva" : "disattiva";

    titleRow.appendChild(title);
    titleRow.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "arteco-camera-meta";
    meta.textContent = buildArtecoCameraDetails(camera);

    const subMeta = document.createElement("div");
    subMeta.className = "arteco-camera-submeta";
    subMeta.textContent = `ID ${camera.artecoId} • idx ${camera.channelIndex || "n/d"} • ${camera.rtspViaTcp ? "RTSP/TCP" : "RTSP/UDP-auto"}`;

    const licenseField = document.createElement("div");
    licenseField.className = "arteco-camera-license";

    const licenseLabel = document.createElement("span");
    licenseLabel.textContent = "Licenza";

    const licenseSelect = document.createElement("select");
    licenseSelect.disabled =
      !state.artecoSelectedCameraIds.has(camera.artecoId) || state.availableLicenses.length === 0;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleziona licenza";
    licenseSelect.appendChild(placeholder);

    const availability = getLicenseAvailabilityMap();
    const currentLicense = getSelectedCameraLicense(camera.artecoId);

    state.availableLicenses.forEach((license) => {
      const counters = availability.get(license.type) || { total: license.channels, used: 0 };
      const remaining = counters.total - counters.used;
      if (remaining <= 0 && license.type !== currentLicense) {
        return;
      }

      const option = document.createElement("option");
      option.value = license.type;
      option.textContent = `${license.type} (${Math.max(remaining, 0)} libere / ${license.channels})`;
      licenseSelect.appendChild(option);
    });

    licenseSelect.value = currentLicense;
    licenseSelect.addEventListener("change", () => {
      const nextValue = licenseSelect.value;

      if (nextValue && !hasLicenseCapacityForCamera(nextValue, camera.artecoId)) {
        setStatus(
          artecoImportStatus,
          `Licenze insufficienti per ${nextValue}. Riduci le assegnazioni o scegli un'altra licenza.`,
          true
        );
        licenseSelect.value = getSelectedCameraLicense(camera.artecoId);
        return;
      }

      if (nextValue) {
        state.artecoLicenseAssignments.set(camera.artecoId, nextValue);
      } else {
        state.artecoLicenseAssignments.delete(camera.artecoId);
      }

      refreshArtecoUiState();
    });

    licenseField.appendChild(licenseLabel);
    licenseField.appendChild(licenseSelect);

    body.appendChild(titleRow);
    body.appendChild(meta);
    body.appendChild(subMeta);
    body.appendChild(licenseField);
    row.appendChild(checkbox);
    row.appendChild(body);
    artecoCameraList.appendChild(row);
  });
}

function getArtecoTargetServicesFromMapping(mapping) {
  const services = extractServices(mapping);
  const cameraServices = services.filter((service) => {
    const haystack = `${service.serviceType} ${service.serviceName}`.toLowerCase();
    return haystack.includes("camera") || haystack.includes("video");
  });
  return cameraServices.length > 0 ? cameraServices : services;
}

function getSelectedArtecoCameras() {
  return state.artecoCameras.filter((camera) => state.artecoSelectedCameraIds.has(camera.artecoId));
}

function getSelectedTargetService() {
  return state.artecoTargetServices.find(
    (service) => service.serviceGuid === state.artecoTargetServiceGuid
  );
}

function buildArtecoImportCamera(camera, position, serviceGuid) {
  const assignedLicense = state.artecoLicenseAssignments.get(camera.artecoId) || "";
  return {
    camera: {
      descr: camera.name,
      channelType: "OnvifChannel",
      enabled: camera.enabled,
      lat: camera.latitude,
      long: camera.longitude,
      ipAddress: camera.host,
      username: camera.username,
      password: camera.password,
      guid_ref: serviceGuid || "",
      ignorePing: false,
      protocol: camera.rtspViaTcp ? "TCP" : "UDP",
      license: assignedLicense,
      onvifRtspPort: camera.onvifRtspPort,
      onvifPort: camera.onvifPort,
      "is-fisheye": false,
      fisheyeMountType: "ceiling",
      privacyPlgEnabled: false,
      notes: "",
      tags: [],
      profiles: [],
      running: false,
    },
  };
}

function buildArtecoImportPayload() {
  const selectedService = getSelectedTargetService();
  const selectedCameras = getSelectedArtecoCameras();

  return {
    MAPPING: state.artecoServerMapping || {},
    CHANNELS: {
      cameraServices: [
        {
          serviceGuid: selectedService?.serviceGuid || "",
          serviceName: selectedService?.serviceName || "Arteco Import",
          serviceType: selectedService?.serviceType || "CameraService",
          cameras: selectedCameras.map((camera, index) =>
            buildArtecoImportCamera(camera, index, selectedService?.serviceGuid || "")
          ),
        },
      ],
    },
  };
}

export function refreshArtecoUiState() {
  const selectedCount = state.artecoSelectedCameraIds.size;
  artecoSelectedCount.textContent = `${selectedCount} / ${state.artecoCameras.length}`;

  renderArtecoLicenseSummary();
  renderArtecoBulkLicenseOptions();
  renderArtecoTargetServices();
  renderArtecoCameraList();

  const licenseValidation = validateSelectedCameraLicenses();

  const canImport =
    normalizeBaseUrl(baseUrlInput.value) !== "" &&
    state.accessToken !== "" &&
    state.artecoCameras.length > 0 &&
    selectedCount > 0 &&
    state.artecoTargetServiceGuid !== "" &&
    licenseValidation.ok;

  artecoTargetServiceSelect.disabled = state.accessToken === "" || state.artecoTargetServices.length === 0;
  artecoBulkLicenseSelect.disabled = state.availableLicenses.length === 0 || selectedCount === 0;
  artecoApplyLicenseSelectedBtn.disabled = artecoBulkLicenseSelect.disabled || state.artecoBulkLicenseType === "";
  artecoApplyLicenseMissingBtn.disabled = artecoBulkLicenseSelect.disabled || state.artecoBulkLicenseType === "";
  artecoImportBtn.disabled = !canImport;
}

export function clearArtecoState() {
  state.artecoFilename = "";
  state.artecoCameras = [];
  state.artecoSelectedCameraIds.clear();
  state.artecoLicenseAssignments.clear();
  state.artecoBulkLicenseType = "";
  resetArtecoTargetServices();
  artecoCameraList.innerHTML = '<div class="placeholder">Carica un file XML per analizzare le camere.</div>';
  artecoSelectedCount.textContent = "0 / 0";
  setStatus(artecoImportStatus, "");
  refreshArtecoUiState();
}

export function resetArtecoTargetServices() {
  state.artecoTargetServices = [];
  state.artecoTargetServiceGuid = "";
  state.artecoServerMapping = null;
  artecoTargetServiceSelect.innerHTML = '<option value="">Fai login e carica un XML per vedere i servizi</option>';
  refreshArtecoUiState();
}

export function resetAvailableLicenses() {
  state.availableLicenses = [];
  state.artecoLicenseAssignments.clear();
  state.artecoBulkLicenseType = "";
  refreshArtecoUiState();
}

export async function ensureArtecoTargetServices() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl || !state.accessToken) {
    return [];
  }

  const mapping = await fetchMappingRequest(baseUrl, state.accessToken);
  state.artecoServerMapping = mapping;
  state.artecoTargetServices = getArtecoTargetServicesFromMapping(mapping);

  if (
    state.artecoTargetServiceGuid &&
    !state.artecoTargetServices.some((service) => service.serviceGuid === state.artecoTargetServiceGuid)
  ) {
    state.artecoTargetServiceGuid = "";
  }

  if (!state.artecoTargetServiceGuid && state.artecoTargetServices.length === 1) {
    state.artecoTargetServiceGuid = state.artecoTargetServices[0].serviceGuid;
  }

  refreshArtecoUiState();
  return state.artecoTargetServices;
}

export async function syncArtecoTargetServices() {
  if (state.accessToken === "") {
    state.artecoTargetServices = [];
    state.artecoTargetServiceGuid = "";
    refreshArtecoUiState();
    return;
  }

  try {
    await ensureArtecoTargetServices();
  } catch (error) {
    setStatus(artecoImportStatus, `Errore servizi target: ${error.message}`, true);
  }
}

export function handleArtecoTargetServiceChange(event) {
  state.artecoTargetServiceGuid = event.target.value;
  refreshArtecoUiState();
}

export function handleArtecoSelection(action) {
  if (action === "all") {
    state.artecoCameras.forEach((camera) => state.artecoSelectedCameraIds.add(camera.artecoId));
  } else if (action === "enabled") {
    state.artecoSelectedCameraIds.clear();
    state.artecoCameras
      .filter((camera) => camera.enabled)
      .forEach((camera) => state.artecoSelectedCameraIds.add(camera.artecoId));
  } else {
    state.artecoSelectedCameraIds.clear();
  }
  refreshArtecoUiState();
}

export function handleArtecoFile(event) {
  const file = event.target.files[0];
  if (!file) {
    clearArtecoState();
    return;
  }

  state.artecoFilename = file.name;
  setStatus(artecoImportStatus, "Analisi XML Arteco in corso...", false);

  file
    .text()
    .then((xmlText) => {
      const cameras = parseArtecoXml(xmlText);
      state.artecoCameras = cameras;
      state.artecoSelectedCameraIds = new Set(
        cameras.filter((camera) => camera.enabled).map((camera) => camera.artecoId)
      );
      state.artecoLicenseAssignments = new Map();
      state.artecoBulkLicenseType = "";

      if (cameras.length === 0) {
        setStatus(artecoImportStatus, "Nessuna camera trovata nel file XML.", true);
      } else {
        setStatus(artecoImportStatus, `Analisi completata: trovate ${cameras.length} camere.`);
      }

      refreshArtecoUiState();

      if (state.accessToken !== "") {
        syncArtecoTargetServices();
      }
    })
    .catch((error) => {
      clearArtecoState();
      setStatus(artecoImportStatus, `Errore XML Arteco: ${error.message}`, true);
    });
}

export async function handleArtecoImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(artecoImportStatus, "Inserisci un base URL valido nella sezione USS.", true);
    return;
  }
  if (!state.accessToken) {
    setStatus(artecoImportStatus, "Fai login prima di inviare le camere.", true);
    return;
  }
  if (state.artecoCameras.length === 0) {
    setStatus(artecoImportStatus, "Carica prima un file XML Arteco.", true);
    return;
  }
  if (state.artecoSelectedCameraIds.size === 0) {
    setStatus(artecoImportStatus, "Seleziona almeno una camera da inviare.", true);
    return;
  }
  if (state.availableLicenses.length === 0) {
    setStatus(artecoImportStatus, "Nessuna licenza disponibile dal server.", true);
    return;
  }

  if (state.artecoTargetServices.length === 0) {
    try {
      await ensureArtecoTargetServices();
    } catch (error) {
      setStatus(artecoImportStatus, `Errore servizi target: ${error.message}`, true);
      return;
    }
  }

  if (!state.artecoTargetServiceGuid) {
    setStatus(artecoImportStatus, "Seleziona un servizio target USS.", true);
    return;
  }

  const licenseValidation = validateSelectedCameraLicenses();
  if (!licenseValidation.ok) {
    setStatus(artecoImportStatus, licenseValidation.message, true);
    return;
  }

  artecoImportBtn.disabled = true;
  setStatus(artecoImportStatus, "Invio camere Arteco in corso...", false);

  try {
    const payload = buildArtecoImportPayload();
    const { response, data } = await importRequest(baseUrl, state.accessToken, payload);

    if (!response.ok) {
      if (data) {
        setStatus(artecoImportStatus, formatImportResponse(data), true);
        return;
      }
      throw new Error(`Errore HTTP ${response.status}`);
    }

    if (data) {
      setStatus(artecoImportStatus, formatImportResponse(data), data.success !== true);
    } else {
      setStatus(artecoImportStatus, "Camere inviate.");
    }
  } catch (error) {
    setStatus(artecoImportStatus, `Errore import Arteco: ${error.message}`, true);
  } finally {
    refreshArtecoUiState();
  }
}

export function handleArtecoBulkLicenseChange(event) {
  state.artecoBulkLicenseType = event.target.value;
  refreshArtecoUiState();
}

function applyLicenseToCameraSet(cameraIds, licenseType, skipAssigned) {
  if (!licenseType) {
    setStatus(artecoImportStatus, "Seleziona prima una licenza da applicare.", true);
    return;
  }

  let appliedCount = 0;
  let skippedCount = 0;

  cameraIds.forEach((cameraId) => {
    if (skipAssigned && state.artecoLicenseAssignments.get(cameraId)) {
      skippedCount += 1;
      return;
    }

    if (!hasLicenseCapacityForCamera(licenseType, cameraId)) {
      skippedCount += 1;
      return;
    }

    state.artecoLicenseAssignments.set(cameraId, licenseType);
    appliedCount += 1;
  });

  if (appliedCount === 0) {
    setStatus(
      artecoImportStatus,
      `Nessuna camera aggiornata: licenze ${licenseType} insufficienti o gia' assegnate.`,
      true
    );
  } else {
    const suffix = skippedCount > 0 ? `, ${skippedCount} saltate` : "";
    setStatus(
      artecoImportStatus,
      `Licenza ${licenseType} applicata a ${appliedCount} camere${suffix}.`,
      false
    );
  }

  refreshArtecoUiState();
}

export function handleArtecoApplyLicenseSelected() {
  const selectedIds = Array.from(state.artecoSelectedCameraIds);
  if (selectedIds.length === 0) {
    setStatus(artecoImportStatus, "Seleziona almeno una camera.", true);
    return;
  }
  applyLicenseToCameraSet(selectedIds, state.artecoBulkLicenseType, false);
}

export function handleArtecoApplyLicenseMissing() {
  const selectedIds = Array.from(state.artecoSelectedCameraIds);
  if (selectedIds.length === 0) {
    setStatus(artecoImportStatus, "Seleziona almeno una camera.", true);
    return;
  }
  applyLicenseToCameraSet(selectedIds, state.artecoBulkLicenseType, true);
}
