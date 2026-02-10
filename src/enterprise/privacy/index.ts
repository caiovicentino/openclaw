export {
  type ConsentPurpose,
  type ConsentRecord,
  type GrantConsentInput,
  ensureConsentTable,
  grantConsent,
  revokeConsent,
  revokeAllConsents,
  hasConsent,
  listUserConsents,
  listTenantConsents,
  grantBulkConsents,
} from "./consent-manager.js";

export {
  type DsarRequestType,
  type DsarStatus,
  type DsarRequest,
  type CreateDsarInput,
  ensureDsarTable,
  createDsarRequest,
  getDsarRequest,
  listDsarRequests,
  updateDsarStatus,
  getDsarDeadlineDays,
  listOverdueDsarRequests,
} from "./dsar-handler.js";

export { type ErasureResult, eraseUserData, eraseTenantData } from "./erasure-handler.js";

export { type PortableUserData, exportUserData } from "./portability-handler.js";

export {
  type BreachSeverity,
  type BreachStatus,
  type BreachRecord,
  type CreateBreachInput,
  ensureBreachTable,
  createBreach,
  getBreach,
  listBreaches,
  markBreachContained,
  markBreachNotified,
  markBreachResolved,
  listOverdueBreachNotifications,
} from "./breach-notifier.js";
