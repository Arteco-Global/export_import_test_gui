import { BLOCKED_IMPORT_KEYS } from "./constants.js";
import { getLanguage, t } from "./i18n.js";

export function isImportKeyAllowed(key) {
  return !BLOCKED_IMPORT_KEYS.has(String(key).toUpperCase());
}

export function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").trim();
}

export function setStatus(element, message, isError = false) {
  element.innerHTML = message;
  element.style.color = isError ? "#8b2f2f" : "";
}

export function sanitizeFilenamePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) {
    return t("backupTimeUnavailable");
  }
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) {
    return t("lessThanMinuteAgo");
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    const suffix = getLanguage() === "en" ? (diffMinutes === 1 ? "" : "s") : (diffMinutes === 1 ? "o" : "i");
    return t("minutesAgo", { count: diffMinutes, suffix });
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    const suffix = getLanguage() === "en" ? (diffHours === 1 ? "" : "s") : (diffHours === 1 ? "a" : "e");
    return t("hoursAgo", { count: diffHours, suffix });
  }
  const diffDays = Math.floor(diffHours / 24);
  const suffix = getLanguage() === "en" ? (diffDays === 1 ? "" : "s") : (diffDays === 1 ? "o" : "i");
  return t("daysAgo", { count: diffDays, suffix });
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
