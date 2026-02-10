// SSO module barrel exports

export {
  type SamlConfig,
  type SamlProfile,
  generateSamlMetadata,
  buildSamlLoginUrl,
  validateSamlResponse,
} from "./saml";

export {
  type OidcConfig,
  type OidcProfile,
  type OidcDiscovery,
  discoverOidcEndpoints,
  buildOidcLoginUrl,
  exchangeOidcCode,
  verifyOidcIdToken,
} from "./oidc";
