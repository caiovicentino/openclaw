// Base client & error
export { client, ApiError } from "./client";

// All shared types
export type * from "./types";

// Auth
export { getMe } from "./auth";

// Users
export {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  inviteUser,
  bulkImportUsers,
  assignRole,
  removeRole,
} from "./users";

// Roles
export { getRoles, getRole, createRole, updateRole, deleteRole } from "./roles";

// Tenants
export { getTenants, getTenant, createTenant, updateTenant, deleteTenant } from "./tenants";

// Agents
export {
  getAgents,
  getAgent,
  createAgent,
  updateAgentConfig,
  deleteAgent,
  getAgentSkills,
  updateAgentSkills,
} from "./agents";

// Sessions
export { getSessions, getSession, getTranscript, exportSession, deleteSession } from "./sessions";

// Channels
export {
  getChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  connectChannel,
  disconnectChannel,
  testChannel,
} from "./channels";

// Compliance
export {
  getPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getViolations,
} from "./compliance";

// Audit
export { getAuditLogs, getAuditEvent, exportAuditLogs, getAuditStats } from "./audit";

// Dashboard
export { getOverview, getUsage, getActiveUsers, getTopAgents } from "./dashboard";

// Reports
export { getUsageReport, getComplianceReport, getCostReport } from "./reports";

// Privacy / LGPD
export {
  createDsar,
  getDsar,
  requestErasure,
  exportUserData,
  getConsent,
  updateConsent,
} from "./privacy";
