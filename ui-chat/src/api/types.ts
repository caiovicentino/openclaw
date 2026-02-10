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

// ── Chat ────────────────────────────────────────────────────

export interface ChatAgent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  isDefault: boolean;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  thinkingBlocks?: string[];
  artifacts?: { id: string; type: string; title: string }[];
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
