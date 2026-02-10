export {
  // Types
  type ConfigLayer,
  type TenantConfigOptions,
  type PlatformDefaults,
  type TenantConfig,
  type AgentConfig,
  type SessionConfig,
  type ResolvedConfig,
  // Platform defaults
  getPlatformDefaults,
  // DB access
  loadTenantConfig,
  saveTenantConfig,
  loadAgentConfig,
  saveAgentConfig,
  // Config resolution
  resolveConfig,
  getResolvedConfig,
  getEffectiveTools,
  // Generic deep merge
  mergeConfigs,
  // Patch
  patchTenantConfig,
  // Compliance validation
  validateConfigChange,
  // Diff
  diffConfigs,
} from "./tenant-config.js";
