export {
  type Tenant,
  createTenant,
  getTenantById,
  getTenantBySlug,
  listTenants,
  updateTenant,
  suspendTenant,
  activateTenant,
  deleteTenant,
} from "./tenant-repo.js";

export {
  type User,
  type Role as UserRole,
  createUser,
  getUserById,
  getUserByEmail,
  listUsers,
  updateUser,
  deactivateUser,
  getUserRoles,
  assignRole,
  removeRole,
  getUserPermissions,
  updateLastLogin,
  setMfaSecret,
  enableMfa,
  disableMfa,
  bulkCreateUsers,
} from "./user-repo.js";

export {
  type Role,
  type UserRoleAssignment,
  createRole,
  getRoleById,
  getRoleByName,
  listRoles,
  updateRole,
  deleteRole,
  seedDefaultRoles,
  getUsersWithRole,
  assignRoleToUser,
  revokeRoleFromUser,
  listUserRoles,
  listRoleMembers,
  setUserRoles,
  getUserPermissions as getRoleUserPermissions,
} from "./role-repo.js";

export {
  type AuditEntry,
  type AuditStats,
  logAuditEvent,
  queryAuditLog,
  getAuditStats,
  deleteOldAuditEntries,
} from "./audit-repo.js";

export {
  type UsageSummary,
  type DailyUsage,
  type UserUsage,
  recordUsage,
  getUsageByUser,
  getUsageByTenant,
  getUsageByDepartment,
  getDailyUsage,
  getTopUsers,
} from "./usage-repo.js";

export {
  type Session,
  type TranscriptEntry,
  createSession,
  getSessionById,
  getSessionByKey,
  listSessions,
  listUserSessions,
  updateSession,
  deleteSession,
  appendTranscriptEntry,
  getTranscript,
  deleteExpiredSessions,
} from "./session-repo.js";
