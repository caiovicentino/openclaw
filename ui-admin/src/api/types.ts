// ── Shared ──────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Auth ────────────────────────────────────────────────────

export interface LoginRequest {
  tenantSlug?: string;
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  otpauthUrl: string;
}

export interface MfaVerifyResponse {
  backupCodes: string[];
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ── Users ───────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  mfaEnabled: boolean;
  status: "active" | "inactive" | "invited" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password?: string;
  role?: string;
  tenantId?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
  status?: User["status"];
  tenantId?: string;
}

export interface UserFilters extends PaginationParams {
  role?: string;
  status?: User["status"];
  tenantId?: string;
}

export interface BulkImportUser {
  name: string;
  email: string;
  role?: string;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

// ── Roles ───────────────────────────────────────────────────

export interface Permission {
  resource: string;
  actions: string[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystemRole: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithMembers extends Role {
  members: User[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface RoleFilters extends PaginationParams {}

// ── Tenants ─────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: "active" | "inactive" | "suspended";
  settings: Record<string, unknown>;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantRequest {
  name: string;
  slug?: string;
  plan?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateTenantRequest {
  name?: string;
  plan?: string;
  status?: Tenant["status"];
  settings?: Record<string, unknown>;
}

export interface TenantFilters extends PaginationParams {
  status?: Tenant["status"];
  plan?: string;
}

// ── Agents ──────────────────────────────────────────────────

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  model: string;
  systemPrompt: string | null;
  memory: string | null;
  projectInstructions: string | null;
  tools: unknown[];
  parameters: Record<string, unknown>;
  isDefault: boolean;
  status: string;
  skipToolApproval?: boolean;
  hooks?: unknown[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model: string;
  systemPrompt?: string;
  tools?: unknown[];
  parameters?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
  memory?: string | null;
  projectInstructions?: string | null;
  tools?: unknown[];
  parameters?: Record<string, unknown>;
  isDefault?: boolean;
  status?: string;
  skipToolApproval?: boolean;
  hooks?: unknown[];
}

// ── Sessions ────────────────────────────────────────────────

export interface SessionMessage {
  id: number;
  sessionId: string;
  seqNum: number;
  entryType: string;
  role: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  agentId: string;
  sessionKey: string;
  sessionData: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface SessionFilters extends PaginationParams {
  userId?: string;
  agentId?: string;
  status?: string;
}

export type ExportFormat = "json" | "csv" | "ndjson";

// ── Channels ────────────────────────────────────────────────

export interface ChannelConfig {
  [key: string]: unknown;
}

export interface Channel {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  config: ChannelConfig;
  status: "active" | "inactive";
  capabilities: unknown[];
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

// ── Compliance ──────────────────────────────────────────────

export interface CompliancePolicy {
  id: string;
  name: string;
  description: string;
  type: string;
  rules: Record<string, unknown>[];
  enabled: boolean;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
}

export interface CompliancePolicyView {
  id: string;
  name: string;
  type: string;
  active: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
  type: string;
  rules: Record<string, unknown>[];
  enabled?: boolean;
  severity?: CompliancePolicy["severity"];
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  rules?: Record<string, unknown>[];
  enabled?: boolean;
  severity?: CompliancePolicy["severity"];
}

export interface Violation {
  id: string;
  policyId: string;
  policyName: string;
  sessionId: string;
  userId: string;
  severity: CompliancePolicy["severity"];
  description: string;
  content: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface PolicyFilters extends PaginationParams {
  type?: string;
  enabled?: boolean;
  severity?: CompliancePolicy["severity"];
}

export interface ViolationFilters extends PaginationParams {
  policyId?: string;
  severity?: CompliancePolicy["severity"];
  resolved?: boolean;
  startDate?: string;
  endDate?: string;
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  actorId?: string;
  userId: string;
  userName: string;
  ipAddress: string;
  userAgent: string;
  severity: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters extends PaginationParams {
  action?: string;
  resource?: string;
  severity?: string | string[];
  userId?: string;
  startDate?: string;
  endDate?: string;
  offset?: number;
}

export interface AuditStats {
  totalEvents: number;
  eventsByAction: Record<string, number>;
  eventsByResource: Record<string, number>;
  topUsers: Array<{ userId: string; userName: string; count: number }>;
}

export interface AuditAlertRule {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  conditions: Record<string, unknown>;
  notificationChannels: Array<{ type: string; target: string }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditAlert {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName?: string;
  eventId: string | null;
  triggeredAt: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

// ── Dashboard ───────────────────────────────────────────────

export interface DashboardOverview {
  totalUsers: number;
  activeUsers24h: number;
  totalSessions: number;
  tokensUsedToday: number;
  costToday: number;
  complianceViolations: number;
  generatedAt: string;
}

export interface DailyUsageData {
  date: string;
  sessions: number;
  tokens: number;
  cost: number;
  activeUsers: number;
}

export interface ActiveUser {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  sessionCount: number;
  lastActive: string;
}

export interface TopAgent {
  agentId: string;
  agentName: string;
  model: string;
  sessionCount: number;
  uniqueUsers: number;
}

export type DashboardPeriod = "24h" | "7d" | "30d" | "90d";

export interface CostByModel {
  model_id: string;
  total_input: number;
  total_output: number;
  total_cost: number;
  request_count: number;
}

export interface CostByAgent {
  agent_id: string;
  agent_name: string | null;
  total_input: number;
  total_output: number;
  total_cost: number;
  request_count: number;
}

export interface CostBreakdownResponse {
  byModel: CostByModel[];
  byAgent: CostByAgent[];
}

export interface SessionAnalyticsPoint {
  date: string;
  session_count: number;
  avg_tokens_per_request: number;
  total_requests: number;
}

export interface ForecastPoint {
  date: string;
  daily_cost: number;
}

export interface AgentPerformanceRow {
  agent_id: string;
  agent_name: string | null;
  total_input: number;
  total_output: number;
  total_cost: number;
  request_count: number;
}

// ── Reports ─────────────────────────────────────────────────

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export type ReportGroupBy = "user" | "department";

export interface UsageReportSummary {
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  totalSessions?: number;
}

export interface UsageReportUser {
  userId: string;
  name: string;
  email: string;
  department?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  sessionCount: number;
}

export interface UsageReportDepartment {
  department: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  uniqueUsers: number;
}

export interface DailyUsageRecord {
  date: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  sessions: number;
}

export interface UsageReport {
  report: string;
  period: { start: string; end: string };
  summary: UsageReportSummary;
  topUsers?: UsageReportUser[];
  byDepartment?: UsageReportDepartment[];
  dailyUsage: DailyUsageRecord[];
  generatedAt: string;
}

export interface ComplianceReport {
  report: string;
  policies: {
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<string, number>;
  };
  violations: {
    last30Days: Record<string, number>;
    total: number;
  };
  dsar: Record<string, number>;
  generatedAt: string;
}

export interface CostReportModel {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  requestCount: number;
}

export interface CostReport {
  report: string;
  period: { start: string; end: string };
  totalCostUsd: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  byModel: CostReportModel[];
  topUsersByCost: UsageReportUser[];
  dailyCost: Array<{ date: string; costUsd: number; tokensInput: number; tokensOutput: number }>;
  generatedAt: string;
}

// ── Privacy / LGPD ──────────────────────────────────────────

export interface Dsar {
  id: string;
  userId: string;
  type: "access" | "rectification" | "erasure" | "portability";
  status: "pending" | "processing" | "completed" | "rejected";
  details: string;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateDsarRequest {
  userId: string;
  type: Dsar["type"];
  details?: string;
}

export interface ErasureResult {
  success: boolean;
  recordsDeleted: number;
  details: string;
}

export interface UserDataExport {
  user: User;
  sessions: Session[];
  auditEvents: AuditEvent[];
  exportedAt: string;
}

export interface Consent {
  id: string;
  userId: string;
  purpose: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
}

export interface UpdateConsentRequest {
  purpose: string;
  granted: boolean;
}
