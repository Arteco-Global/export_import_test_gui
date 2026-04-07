import {
  artecoApplyLicenseMissingBtn,
  artecoApplyLicenseSelectedBtn,
  artecoBulkLicenseSelect,
  authServiceSelect,
  artecoFileInput,
  artecoImportBtn,
  artecoSelectAllBtn,
  artecoSelectEnabledBtn,
  artecoSelectNoneBtn,
  artecoTargetServiceSelect,
  backToHomeFromArtecoBtn,
  backToHomeFromUssBtn,
  baseUrlInput,
  configFileInput,
  exportBtn,
  importBtn,
  openArtecoBtn,
  openUssBtn,
  passwordInput,
  refreshBackupsBtn,
  resetBtn,
  usernameInput,
  loginBtn,
} from "./dom.js";
import {
  handleBaseUrlChange,
  handleConfigFile,
  handleCredentialChange,
  handleExport,
  handleFetchBackups,
  handleImport,
  handleLogin,
  handleReset,
  navigationHandlers,
  refreshUiState,
  resetAccessToken,
} from "./handlers.js";
import {
  clearAssociationList,
  clearBackupsList,
  renderAuthServices,
  renderLicenseOverviews,
  resetAuthServices,
  setImportLoading,
  showHome,
} from "./render.js";
import {
  clearArtecoState,
  handleArtecoApplyLicenseMissing,
  handleArtecoApplyLicenseSelected,
  handleArtecoBulkLicenseChange,
  handleArtecoFile,
  handleArtecoImport,
  handleArtecoSelection,
  handleArtecoTargetServiceChange,
  refreshArtecoUiState,
} from "./arteco.js";
import { initI18n, onLanguageChange, t } from "./i18n.js";
import { state } from "./state.js";

baseUrlInput.addEventListener("input", handleBaseUrlChange);
usernameInput.addEventListener("input", handleCredentialChange);
passwordInput.addEventListener("input", handleCredentialChange);
authServiceSelect.addEventListener("change", refreshUiState);
loginBtn.addEventListener("click", handleLogin);
exportBtn.addEventListener("click", handleExport);
resetBtn.addEventListener("click", handleReset);
refreshBackupsBtn.addEventListener("click", handleFetchBackups);
configFileInput.addEventListener("change", handleConfigFile);
importBtn.addEventListener("click", handleImport);
artecoFileInput.addEventListener("change", handleArtecoFile);
artecoTargetServiceSelect.addEventListener("change", handleArtecoTargetServiceChange);
artecoBulkLicenseSelect.addEventListener("change", handleArtecoBulkLicenseChange);
artecoApplyLicenseSelectedBtn.addEventListener("click", handleArtecoApplyLicenseSelected);
artecoApplyLicenseMissingBtn.addEventListener("click", handleArtecoApplyLicenseMissing);
artecoSelectEnabledBtn.addEventListener("click", () => handleArtecoSelection("enabled"));
artecoSelectAllBtn.addEventListener("click", () => handleArtecoSelection("all"));
artecoSelectNoneBtn.addEventListener("click", () => handleArtecoSelection("none"));
artecoImportBtn.addEventListener("click", handleArtecoImport);
openUssBtn.addEventListener("click", navigationHandlers.showUssTool);
openArtecoBtn.addEventListener("click", navigationHandlers.showArtecoPage);
backToHomeFromUssBtn.addEventListener("click", navigationHandlers.showHome);
backToHomeFromArtecoBtn.addEventListener("click", navigationHandlers.showHome);

initI18n();

onLanguageChange(() => {
  if (state.authServices.length > 0) {
    renderAuthServices(state.authServices);
  } else {
    resetAuthServices(t("authLoadServices"));
  }
  if (!state.accessToken) {
    clearBackupsList(t("loginToViewBackups"));
  }
  renderLicenseOverviews();
  refreshArtecoUiState();
  refreshUiState();
});

resetAuthServices(t("authLoadServices"));
resetAccessToken();
refreshUiState();
clearBackupsList(t("loginToViewBackups"));
clearAssociationList(t("configNeedMappingAndNew"));
clearArtecoState();
setImportLoading(false);
showHome();
