import { IMPORT_KEYS } from "./constants.js";
import { isImportKeyAllowed, escapeHtml } from "./utils.js";

export function readConfigFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Errore di lettura"));
    reader.readAsText(file);
  });
}

export function readPayloadKey(payload, key) {
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

export function extractConfigPayload(payload) {
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

  return {
    config: payloadByKey.CHANNELS ?? null,
    mapping: payloadByKey.MAPPING ?? null,
    payloadByKey,
  };
}

export function getCameraServices(payload) {
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

export function getCameraServiceGuid(service, index = 0) {
  return (
    service?.serviceGuid ||
    service?.guid ||
    service?.serviceId ||
    service?.id ||
    `camera-service-${index + 1}`
  );
}

export function getRawCameraEntries(service) {
  const camerasValue =
    service?.cameras ||
    service?.cameraList ||
    service?.camera ||
    service?.channels ||
    service?.devices ||
    [];

  if (Array.isArray(camerasValue)) {
    return camerasValue;
  }

  if (camerasValue && typeof camerasValue === "object") {
    return Object.values(camerasValue);
  }

  return [];
}

export function getCameraDisplayName(cameraEntry, index = 0) {
  const camera =
    cameraEntry?.camera && typeof cameraEntry.camera === "object"
      ? cameraEntry.camera
      : cameraEntry;

  return (
    camera?.descr ||
    camera?.name ||
    camera?.label ||
    camera?.title ||
    camera?.id ||
    camera?.guid ||
    `Camera ${index + 1}`
  );
}

export function getCameraLicense(cameraEntry) {
  if (cameraEntry?.camera && typeof cameraEntry.camera === "object") {
    return String(cameraEntry.camera.license || "").trim();
  }
  if (cameraEntry && typeof cameraEntry === "object") {
    return String(cameraEntry.license || "").trim();
  }
  return "";
}

export function setCameraLicense(cameraEntry, license) {
  if (!cameraEntry || typeof cameraEntry !== "object") {
    return;
  }
  if (cameraEntry.camera && typeof cameraEntry.camera === "object") {
    cameraEntry.camera.license = license;
    return;
  }
  cameraEntry.license = license;
}

export function getServiceLabel(service, fallback) {
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

export function getCameraList(service) {
  const camerasValue = getRawCameraEntries(service);

  if (Array.isArray(camerasValue)) {
    return camerasValue.map((item, index) => {
      if (typeof item === "string" || typeof item === "number") {
        return String(item);
      }
      if (item && typeof item === "object") {
        return getCameraDisplayName(item, index);
      }
      return `Camera ${index + 1}`;
    });
  }

  return [];
}

export function getMappingList(payload) {
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

export function extractServices(mapping) {
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

export function formatServiceLabel(service) {
  const name = service.serviceName ? ` - ${service.serviceName}` : "";
  return `${service.serviceGuid}${name}`;
}

export function applyGuidMapToConfig(config, guidMap) {
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

export function formatImportResponse(payload) {
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
    const rows = data.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
    parts.push(`<div>Errori:</div><ul>${rows}</ul>`);
  }

  return parts.join("");
}
