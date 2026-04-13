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
import { t } from "./i18n.js";
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
const ARTECO_SOURCE_TYPE_RTSP = 31;
const RTSP_MAIN_DEFAULT_PORT = 554;
const RTSP_SECONDARY_DEFAULT_PORT = 556;

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

function extractPortFromUrl(value, fallback) {
  const parsedUrl = parseUrlSafely(value);
  if (!parsedUrl || !parsedUrl.port) {
    return fallback;
  }
  return parseNumber(parsedUrl.port, fallback);
}

function parseRtspStreamInfo(value) {
  if (!value) {
    return null;
  }

  const parsedUrl = parseUrlSafely(value);
  if (!parsedUrl) {
    return null;
  }

  const streamRef = `${parsedUrl.pathname || ""}${parsedUrl.search || ""}${parsedUrl.hash || ""}`.replace(
    /^\/+/,
    ""
  );
  const hasAuth = /^[a-z]+:\/\/[^/]*@/i.test(value);
  const port = parsedUrl.port ? parseNumber(parsedUrl.port, 0) : 0;

  return {
    streamRef,
    port,
    hostname: parsedUrl.hostname || "",
    hasAuth,
    username: decodeURIComponent(parsedUrl.username || ""),
    password: decodeURIComponent(parsedUrl.password || ""),
  };
}

function extractHostFromRtspUrls(mainRtspUrl, secondaryRtspUrl) {
  const mainInfo = parseRtspStreamInfo(mainRtspUrl);
  if (mainInfo?.hostname) {
    return mainInfo.hostname;
  }
  const secondaryInfo = parseRtspStreamInfo(secondaryRtspUrl);
  return secondaryInfo?.hostname || "";
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

function resolveConfiguredPort(value, minusOneFallback, fallbackPort) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return fallbackPort;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallbackPort;
  }

  return parsed === -1 ? minusOneFallback : parsed;
}

function getSourceTypeLabel(type) {
  return SOURCE_TYPE_LABELS[type] || t("typeWithNumber", { type });
}

function getChannelTypeForSourceType(sourceType) {
  return sourceType === ARTECO_SOURCE_TYPE_RTSP ? "RtspChannel" : "OnvifChannel";
}

function isRtspSourceType(sourceType) {
  return getChannelTypeForSourceType(sourceType) === "RtspChannel";
}

function parseArtecoVideoSource(node, index) {
  const sourceCfg = node.querySelector("sourcecfg");
  const sourceParams = sourceCfg?.querySelector("s-params");
  const mainStream = sourceParams?.querySelector("main-stream");
  const subStream = sourceParams?.querySelector("sub-stream");

  const sourceType = parseNumber(attrOrEmpty(sourceCfg, "type"), -1);
  const name = attrOrEmpty(node, "descr") || t("cameraFallback", { index: index + 1 });
  const mainRtspUrl = attrOrEmpty(mainStream, "RTSP-url");
  const secondaryRtspUrl = attrOrEmpty(subStream, "RTSP-url");
  const url = attrOrEmpty(sourceParams, "urladdr");
  const host = attrOrEmpty(sourceParams, "addr");
  const htmlPort = attrOrEmpty(sourceParams, "html-port");
  const rtspPort = attrOrEmpty(sourceParams, "rtsp-port");
  const username = attrOrEmpty(sourceParams, "user");
  const password = attrOrEmpty(sourceParams, "pass");
  const enabled = attrOrEmpty(node, "ena") !== "0";
  const rtspViaTcp =
    attrOrEmpty(mainStream, "RTSP-via-TCP") === "1" ||
    attrOrEmpty(subStream, "RTSP-via-TCP") === "1" ||
    attrOrEmpty(sourceParams, "RTSP-via-TCP") === "1";
  const channelId = attrOrEmpty(node, "id");
  const channelIndex = attrOrEmpty(node, "idx");
  const sourceProfile = attrOrEmpty(sourceParams, "src-tk") || attrOrEmpty(sourceParams, "idx");
  const vendor = getSourceTypeLabel(sourceType);
  const geoReferences = node.querySelector("GeoReferences");
  const rtspHost = extractHostFromRtspUrls(mainRtspUrl, secondaryRtspUrl);
  const connectionInfo = derivePorts(url || mainRtspUrl || secondaryRtspUrl, rtspHost || host);
  const resolvedOnvifPort = resolveConfiguredPort(htmlPort, 80, connectionInfo.onvifPort);
  const resolvedOnvifRtspPort = resolveConfiguredPort(rtspPort, 554, connectionInfo.onvifRtspPort);
  const groupId = attrOrEmpty(sourceParams, "groupId");
  const groupName = attrOrEmpty(sourceParams, "groupName");
  const excludedByGroup = groupId !== "" || groupName !== "";

  return {
    artecoId: channelId || `arteco-${index + 1}`,
    channelIndex,
    name,
    enabled,
    host: rtspHost || connectionInfo.ipAddress || host,
    url,
    mainRtspUrl,
    secondaryRtspUrl,
    username,
    password,
    rtspViaTcp,
    sourceType,
    vendor,
    category: attrOrEmpty(node, "cat"),
    description: name,
    groupId,
    groupName,
    excludedByGroup,
    mainStreamFps: attrOrEmpty(mainStream, "fps") || attrOrEmpty(sourceParams, "fps"),
    subStreamFps: attrOrEmpty(subStream, "fps"),
    rawProfile: sourceProfile,
    latitude: parseNumber(attrOrEmpty(geoReferences, "latitude"), 0),
    longitude: parseNumber(attrOrEmpty(geoReferences, "longitude"), 0),
    onvifPort: resolvedOnvifPort,
    onvifRtspPort: resolvedOnvifRtspPort,
  };
}

export function parseArtecoXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(textOrEmpty(parseError) || t("artecoXmlInvalid"));
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

  return cameras.filter((camera) => camera.excludedByGroup || String(camera.host || "").trim() !== "");
}

function buildArtecoCameraDetails(camera) {
  if (camera.excludedByGroup) {
    const groupLabel = camera.groupName || camera.groupId || "NVR";
    return t("artecoExcludedByGroup", { group: groupLabel });
  }

  const parts = [
    camera.vendor,
    camera.host || camera.url || t("artecoEndpointUnavailable"),
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
    payload?.root?.server?.license ||
    payload?.root?.license ||
    payload?.data?.license ||
    payload?.root?.data?.license ||
    payload?.root?.root?.license ||
    payload?.payload?.license ||
    null;
  const licenseContainer =
    (Array.isArray(licenseRoot?.licenses) && licenseRoot) ||
    (Array.isArray(licenseRoot?.license?.licenses) && licenseRoot.license) ||
    (Array.isArray(payload?.license?.licenses) && payload.license) ||
    (Array.isArray(payload?.root?.server?.license?.license?.licenses) &&
      payload.root.server.license.license) ||
    (Array.isArray(payload?.root?.license?.license?.licenses) && payload.root.license.license) ||
    null;
  const licenses = Array.isArray(licenseContainer?.licenses) ? licenseContainer.licenses : [];
  const allocationsRoot =
    payload?.licenseAllocations ||
    payload?.root?.server?.licenseAllocations ||
    licenseRoot?.licenseAllocations ||
    payload?.root?.licenseAllocations ||
    payload?.data?.licenseAllocations ||
    payload?.root?.data?.licenseAllocations ||
    payload?.root?.root?.licenseAllocations ||
    payload?.payload?.licenseAllocations ||
    [];

  const allocatedByType = new Map();
  const allocationList = Array.isArray(allocationsRoot)
    ? allocationsRoot
    : Array.isArray(allocationsRoot?.allocations)
      ? allocationsRoot.allocations
      : [];

  const registerAllocation = (allocation) => {
    if (!allocation || typeof allocation !== "object") {
      return;
    }
    const type = String(
      allocation.type ||
      allocation.licenseType ||
      allocation.license ||
      ""
    ).trim();
    const channels = Number(
      allocation.channels ||
      allocation.allocatedChannels ||
      allocation.count ||
      0
    );
    if (!type || !Number.isFinite(channels) || channels <= 0) {
      return;
    }
    allocatedByType.set(type, (allocatedByType.get(type) || 0) + channels);
  };

  const collectAllocations = (entries) => {
    if (!Array.isArray(entries)) {
      return;
    }

    entries.forEach((allocation) => {
      if (!allocation || typeof allocation !== "object") {
        return;
      }

      registerAllocation(allocation);
      collectAllocations(allocation.allocated);
      collectAllocations(allocation.allocations);
      collectAllocations(allocation.items);
    });
  };

  collectAllocations(allocationList);

  return licenses
    .map((license) => ({
      type: String(license?.type || "").trim(),
      channels: Number(license?.channels || 0),
      allocatedChannels: allocatedByType.get(String(license?.type || "").trim()) || 0,
    }))
    .map((license) => ({
      ...license,
      availableChannels: Math.max(license.channels - license.allocatedChannels, 0),
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
      total: license.availableChannels,
      used: usage.get(license.type) || 0,
      providerTotal: license.channels,
      allocated: license.allocatedChannels || 0,
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

  return effectiveUsed < license.availableChannels;
}

function validateSelectedCameraLicenses() {
  const selectedCameras = getSelectedArtecoCameras();
  if (selectedCameras.length === 0) {
    return { ok: false, message: t("artecoSelectAtLeastOneToSend") };
  }

  for (const camera of selectedCameras) {
    const licenseType = state.artecoLicenseAssignments.get(camera.artecoId);
    if (!licenseType) {
      return { ok: false, message: t("artecoSelectLicenseForCamera", { camera: camera.name }) };
    }
  }

  const usage = getAssignedLicenseUsage();
  for (const license of state.availableLicenses) {
    const used = usage.get(license.type) || 0;
    if (used > license.availableChannels) {
      return {
        ok: false,
        message: t("licenseInsufficient", {
          license: license.type,
          used,
          capacity: license.availableChannels,
        }),
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
    placeholder.textContent = t("loginToLoadAvailableLicenses");
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

    const counters = availability.get(license.type) || {
      total: license.availableChannels,
      used: 0,
      providerTotal: license.channels,
      allocated: license.allocatedChannels || 0,
    };
    const count = document.createElement("div");
    count.className = "arteco-license-count";
    count.textContent = t("providerAllocatedText", {
      free: Math.max(counters.total - counters.used, 0),
      total: counters.total,
      provider: counters.providerTotal,
      allocated: counters.allocated,
    });

    item.appendChild(type);
    item.appendChild(count);
    artecoLicenseSummary.appendChild(item);
  });
}

function renderArtecoBulkLicenseOptions() {
  artecoBulkLicenseSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("selectLicense");
  artecoBulkLicenseSelect.appendChild(placeholder);

  const availability = getLicenseAvailabilityMap();
  state.availableLicenses.forEach((license) => {
    const counters = availability.get(license.type) || {
      total: license.availableChannels,
      used: 0,
    };
    const remaining = counters.total - counters.used;
    if (remaining <= 0) {
      return;
    }

    const option = document.createElement("option");
    option.value = license.type;
    option.textContent = t("licenseOption", {
      license: license.type,
      remaining,
      total: license.availableChannels,
    });
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
      ? t("targetServiceNone")
      : t("targetServiceSelect");
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

function createArtecoCameraRow(camera) {
  const isRtspCamera = isRtspSourceType(camera.sourceType);
  const row = document.createElement("label");
  row.className = `arteco-camera-row ${isRtspCamera ? "is-rtsp" : "is-onvif"}${
    camera.excludedByGroup ? " is-excluded" : ""
  }`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.artecoSelectedCameraIds.has(camera.artecoId);
  checkbox.disabled = camera.excludedByGroup;
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
  badge.className = `arteco-camera-badge ${
    camera.excludedByGroup ? "is-excluded" : camera.enabled ? "is-enabled" : "is-disabled"
  }`;
  badge.textContent = camera.excludedByGroup
    ? t("excluded")
    : camera.enabled
      ? t("enabled")
      : t("disabled");

  const channelTypeBadge = document.createElement("span");
  channelTypeBadge.className = `arteco-camera-badge ${isRtspCamera ? "is-type-rtsp" : "is-type-onvif"}`;
  channelTypeBadge.textContent = isRtspCamera ? t("rtspChannelType") : t("onvifChannelType");

  const badgeGroup = document.createElement("div");
  badgeGroup.className = "arteco-camera-badges";
  badgeGroup.appendChild(channelTypeBadge);
  badgeGroup.appendChild(badge);

  titleRow.appendChild(title);
  titleRow.appendChild(badgeGroup);

  const meta = document.createElement("div");
  meta.className = "arteco-camera-meta";
  meta.textContent = buildArtecoCameraDetails(camera);

  const subMeta = document.createElement("div");
  subMeta.className = "arteco-camera-submeta";
  subMeta.textContent = camera.excludedByGroup
    ? `ID ${camera.artecoId} • ${t("group")} ${camera.groupName || camera.groupId || t("notAvailableShort")}`
    : `ID ${camera.artecoId} • idx ${camera.channelIndex || t("notAvailableShort")} • ${camera.rtspViaTcp ? "RTSP/TCP" : t("rtspUdpAuto")}`;

  const licenseField = document.createElement("div");
  licenseField.className = "arteco-camera-license";

  const licenseLabel = document.createElement("span");
  licenseLabel.textContent = t("license");

  const licenseSelect = document.createElement("select");
  licenseSelect.disabled =
    camera.excludedByGroup ||
    !state.artecoSelectedCameraIds.has(camera.artecoId) ||
    state.availableLicenses.length === 0;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("selectLicense");
  licenseSelect.appendChild(placeholder);

  const availability = getLicenseAvailabilityMap();
  const currentLicense = getSelectedCameraLicense(camera.artecoId);

  state.availableLicenses.forEach((license) => {
    const counters = availability.get(license.type) || {
      total: license.availableChannels,
      used: 0,
    };
    const remaining = counters.total - counters.used;
    if (remaining <= 0 && license.type !== currentLicense) {
      return;
    }

    const option = document.createElement("option");
    option.value = license.type;
    option.textContent = t("licenseOption", {
      license: license.type,
      remaining: Math.max(remaining, 0),
      total: license.availableChannels,
    });
    licenseSelect.appendChild(option);
  });

  licenseSelect.value = currentLicense;
  licenseSelect.addEventListener("change", () => {
    const nextValue = licenseSelect.value;

    if (nextValue && !hasLicenseCapacityForCamera(nextValue, camera.artecoId)) {
      setStatus(
        artecoImportStatus,
        t("artecoInsufficientLicenseReduce", { license: nextValue }),
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

  return row;
}

function renderArtecoCameraList() {
  artecoCameraList.innerHTML = "";

  if (state.artecoCameras.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = t("artecoLoadXmlToAnalyze");
    artecoCameraList.appendChild(placeholder);
    return;
  }

  const importableCameras = state.artecoCameras.filter((camera) => !camera.excludedByGroup);
  const excludedCameras = state.artecoCameras.filter((camera) => camera.excludedByGroup);

  importableCameras.forEach((camera) => {
    artecoCameraList.appendChild(createArtecoCameraRow(camera));
  });

  if (excludedCameras.length === 0) {
    return;
  }

  const groups = new Map();
  excludedCameras.forEach((camera) => {
    const key = camera.groupName || camera.groupId || t("artecoExcludedGroupFallback");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(camera);
  });

  groups.forEach((cameras, groupLabel) => {
    const groupSection = document.createElement("details");
    groupSection.className = "arteco-group-block";

    const header = document.createElement("summary");
    header.className = "arteco-group-header";
    header.textContent = t("artecoNvrUnsupported", { group: groupLabel });

    const body = document.createElement("div");
    body.className = "arteco-group-body";
    cameras.forEach((camera) => {
      body.appendChild(createArtecoCameraRow(camera));
    });

    groupSection.appendChild(header);
    groupSection.appendChild(body);
    artecoCameraList.appendChild(groupSection);
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
  return state.artecoCameras.filter(
    (camera) => !camera.excludedByGroup && state.artecoSelectedCameraIds.has(camera.artecoId)
  );
}

function getSelectedTargetService() {
  return state.artecoTargetServices.find(
    (service) => service.serviceGuid === state.artecoTargetServiceGuid
  );
}

function buildRtspArtecoImportCamera(camera, serviceGuid, assignedLicense) {
  const rtspMain = camera.mainRtspUrl || camera.url || "";
  const rtspSecondary = camera.secondaryRtspUrl || camera.mainRtspUrl || camera.url || "";
  const mainInfo = parseRtspStreamInfo(rtspMain);
  const secondaryInfo = parseRtspStreamInfo(rtspSecondary);
  const credentialsSource = mainInfo?.hasAuth ? mainInfo : secondaryInfo?.hasAuth ? secondaryInfo : null;
  const rtspPortMain = mainInfo?.port || extractPortFromUrl(rtspMain, RTSP_MAIN_DEFAULT_PORT);
  const rtspPortSecondary =
    secondaryInfo?.port || extractPortFromUrl(rtspSecondary, RTSP_SECONDARY_DEFAULT_PORT);
  const rtspMainRef = mainInfo?.streamRef || rtspMain;
  const rtspSecondaryRef = secondaryInfo?.streamRef || mainInfo?.streamRef || rtspSecondary;
  return {
    camera: {
      descr: camera.name,
      enabled: camera.enabled,
      lat: camera.latitude,
      long: camera.longitude,
      ipAddress: camera.host,
      username: credentialsSource ? credentialsSource.username : camera.username,
      password: credentialsSource ? credentialsSource.password : camera.password,
      channelType: "RtspChannel",
      guid_ref: serviceGuid || "",
      ignorePing: false,
      protocol: camera.rtspViaTcp ? "TCP" : "UDP",
      license: assignedLicense,
      rtspPortMain,
      rtspPortSecondary,
      enableMain: true,
      rtspMain: rtspMainRef,
      enableSecondary: true,
      rtspSecondary: rtspSecondaryRef,
      profiles: [],
      running: false,
    },
  };
}

function buildOnvifArtecoImportCamera(camera, serviceGuid, assignedLicense) {
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

function buildArtecoImportCamera(camera, position, serviceGuid) {
  const assignedLicense = state.artecoLicenseAssignments.get(camera.artecoId) || "";
  return isRtspSourceType(camera.sourceType)
    ? buildRtspArtecoImportCamera(camera, serviceGuid, assignedLicense)
    : buildOnvifArtecoImportCamera(camera, serviceGuid, assignedLicense);
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
          serviceName: selectedService?.serviceName || t("artecoImportLabel"),
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
  const importableCount = state.artecoCameras.filter((camera) => !camera.excludedByGroup).length;
  const selectedCount = getSelectedArtecoCameras().length;
  artecoSelectedCount.textContent = `${selectedCount} / ${importableCount}`;

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
  artecoCameraList.innerHTML = `<div class="placeholder">${t("artecoLoadXmlToAnalyze")}</div>`;
  artecoSelectedCount.textContent = "0 / 0";
  setStatus(artecoImportStatus, "");
  refreshArtecoUiState();
}

export function resetArtecoTargetServices() {
  state.artecoTargetServices = [];
  state.artecoTargetServiceGuid = "";
  state.artecoServerMapping = null;
  artecoTargetServiceSelect.innerHTML = `<option value="">${t("artecoTargetServiceSelectPrompt")}</option>`;
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
    setStatus(artecoImportStatus, t("artecoTargetServiceError", { message: error.message }), true);
  }
}

export function handleArtecoTargetServiceChange(event) {
  state.artecoTargetServiceGuid = event.target.value;
  refreshArtecoUiState();
}

export function handleArtecoSelection(action) {
  const importableCameras = state.artecoCameras.filter((camera) => !camera.excludedByGroup);
  if (action === "all") {
    importableCameras.forEach((camera) => state.artecoSelectedCameraIds.add(camera.artecoId));
  } else if (action === "enabled") {
    state.artecoSelectedCameraIds.clear();
    importableCameras
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
  setStatus(artecoImportStatus, t("artecoXmlAnalyzing"), false);

  file
    .text()
    .then((xmlText) => {
      const cameras = parseArtecoXml(xmlText);
      state.artecoCameras = cameras;
      state.artecoSelectedCameraIds = new Set(
        cameras
          .filter((camera) => camera.enabled && !camera.excludedByGroup)
          .map((camera) => camera.artecoId)
      );
      state.artecoLicenseAssignments = new Map();
      state.artecoBulkLicenseType = "";

      const excludedCount = cameras.filter((camera) => camera.excludedByGroup).length;
      const importableCount = cameras.filter((camera) => !camera.excludedByGroup).length;

      if (cameras.length === 0) {
        setStatus(artecoImportStatus, t("artecoNoCameraInXml"), true);
      } else {
        const excludedText = excludedCount > 0 ? t("artecoExcludedNvrSuffix", { count: excludedCount }) : "";
        setStatus(
          artecoImportStatus,
          t("artecoAnalysisCompleted", { importable: importableCount, excluded: excludedText })
        );
      }

      refreshArtecoUiState();

      if (state.accessToken !== "") {
        syncArtecoTargetServices();
      }
    })
    .catch((error) => {
      clearArtecoState();
      setStatus(artecoImportStatus, t("artecoXmlError", { message: error.message }), true);
    });
}

export async function handleArtecoImport() {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  if (!baseUrl) {
    setStatus(artecoImportStatus, t("baseUrlInvalidUss"), true);
    return;
  }
  if (!state.accessToken) {
    setStatus(artecoImportStatus, t("loginNeedBeforeSendCameras"), true);
    return;
  }
  if (state.artecoCameras.length === 0) {
    setStatus(artecoImportStatus, t("artecoLoadXmlFirst"), true);
    return;
  }
  if (state.artecoSelectedCameraIds.size === 0) {
    setStatus(artecoImportStatus, t("artecoSelectAtLeastOneToSend"), true);
    return;
  }
  if (state.availableLicenses.length === 0) {
    setStatus(artecoImportStatus, t("noLicenseAvailableFromServer"), true);
    return;
  }

  if (state.artecoTargetServices.length === 0) {
    try {
      await ensureArtecoTargetServices();
    } catch (error) {
      setStatus(artecoImportStatus, t("artecoTargetServiceError", { message: error.message }), true);
      return;
    }
  }

  if (!state.artecoTargetServiceGuid) {
    setStatus(artecoImportStatus, t("artecoSelectTargetService"), true);
    return;
  }

  const licenseValidation = validateSelectedCameraLicenses();
  if (!licenseValidation.ok) {
    setStatus(artecoImportStatus, licenseValidation.message, true);
    return;
  }

  artecoImportBtn.disabled = true;
  setStatus(artecoImportStatus, t("artecoSendingInProgress"), false);

  try {
    const payload = buildArtecoImportPayload();
    const { response, data } = await importRequest(baseUrl, state.accessToken, payload);

    if (!response.ok) {
      if (data) {
        setStatus(artecoImportStatus, formatImportResponse(data), true);
        return;
      }
      throw new Error(t("httpError", { status: response.status }));
    }

    if (data) {
      setStatus(artecoImportStatus, formatImportResponse(data), data.success !== true);
    } else {
      setStatus(artecoImportStatus, t("artecoSent"));
    }
  } catch (error) {
    setStatus(artecoImportStatus, t("artecoImportError", { message: error.message }), true);
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
    setStatus(artecoImportStatus, t("artecoSelectLicenseBeforeApply"), true);
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
      t("artecoNoCameraUpdated", { license: licenseType }),
      true
    );
  } else {
    const suffix = skippedCount > 0 ? t("artecoSkippedSuffix", { count: skippedCount }) : "";
    setStatus(
      artecoImportStatus,
      t("artecoLicenseApplied", { license: licenseType, count: appliedCount, suffix }),
      false
    );
  }

  refreshArtecoUiState();
}

export function handleArtecoApplyLicenseSelected() {
  const selectedIds = Array.from(state.artecoSelectedCameraIds);
  if (selectedIds.length === 0) {
    setStatus(artecoImportStatus, t("artecoSelectAtLeastOneCamera"), true);
    return;
  }
  applyLicenseToCameraSet(selectedIds, state.artecoBulkLicenseType, false);
}

export function handleArtecoApplyLicenseMissing() {
  const selectedIds = Array.from(state.artecoSelectedCameraIds);
  if (selectedIds.length === 0) {
    setStatus(artecoImportStatus, t("artecoSelectAtLeastOneCamera"), true);
    return;
  }
  applyLicenseToCameraSet(selectedIds, state.artecoBulkLicenseType, true);
}
