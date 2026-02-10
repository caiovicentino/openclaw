// SAML 2.0 SSO Integration for Enterprise Identity Providers

import * as crypto from "crypto";
import * as zlib from "zlib";

export type SamlConfig = {
  tenantId: string;
  entryPoint: string;
  issuer: string;
  cert: string;
  callbackUrl: string;
  signatureAlgorithm?: string;
  wantAssertionsSigned?: boolean;
};

export type SamlProfile = {
  nameId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  attributes: Record<string, string>;
};

/**
 * Generate SP metadata XML for configuring the Identity Provider.
 */
export function generateSamlMetadata(config: SamlConfig): string {
  const sigAlg = config.signatureAlgorithm ?? "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"',
    `  entityID="${escapeXml(config.issuer)}">`,
    "  <md:SPSSODescriptor",
    '    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"',
    `    WantAssertionsSigned="${config.wantAssertionsSigned !== false}">`,
    "    <md:AssertionConsumerService",
    '      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"',
    `      Location="${escapeXml(config.callbackUrl)}"`,
    '      index="0"',
    '      isDefault="true" />',
    "    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>",
    "  </md:SPSSODescriptor>",
    "</md:EntityDescriptor>",
  ].join("\n");
}

/**
 * Build redirect URL to IdP with a SAML AuthnRequest.
 */
export function buildSamlLoginUrl(config: SamlConfig, relayState?: string): string {
  const id = `_${generateRequestId()}`;
  const issueInstant = new Date().toISOString();
  const sigAlg = config.signatureAlgorithm ?? "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

  const authnRequest = [
    '<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"',
    `  ID="${id}"`,
    '  Version="2.0"',
    `  IssueInstant="${issueInstant}"`,
    `  AssertionConsumerServiceURL="${escapeXml(config.callbackUrl)}"`,
    '  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"',
    `  Destination="${escapeXml(config.entryPoint)}">`,
    `  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${escapeXml(config.issuer)}</saml:Issuer>`,
    "</samlp:AuthnRequest>",
  ].join("\n");

  const encoded = deflateAndEncode(authnRequest);

  const params = new URLSearchParams();
  params.set("SAMLRequest", encoded);
  if (relayState) {
    params.set("RelayState", relayState);
  }

  const separator = config.entryPoint.includes("?") ? "&" : "?";
  return `${config.entryPoint}${separator}${params.toString()}`;
}

// Replay protection: track recently seen assertion IDs with expiration
const SEEN_ASSERTION_IDS = new Map<string, number>();
const ASSERTION_ID_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanExpiredAssertionIds(): void {
  const now = Date.now();
  SEEN_ASSERTION_IDS.forEach((expiry, id) => {
    if (now > expiry) {
      SEEN_ASSERTION_IDS.delete(id);
    }
  });
}

function checkReplayProtection(xml: string): void {
  cleanExpiredAssertionIds();

  // Extract assertion ID (handle both saml: prefixed and unprefixed)
  const assertionIdMatch = xml.match(/<(?:saml:)?Assertion\b[^>]+\bID="([^"]+)"/);
  if (!assertionIdMatch) {
    throw new Error("SAML: Assertion ID not found in response");
  }
  const assertionId = assertionIdMatch[1];

  if (SEEN_ASSERTION_IDS.has(assertionId)) {
    throw new Error("SAML: Replay detected - this assertion has already been processed");
  }

  // Determine TTL from NotOnOrAfter if available, otherwise use default
  const notAfterMatch = xml.match(/NotOnOrAfter="([^"]+)"/);
  let expiryMs: number;
  if (notAfterMatch) {
    expiryMs = new Date(notAfterMatch[1]).getTime();
  } else {
    expiryMs = Date.now() + ASSERTION_ID_TTL_MS;
  }
  SEEN_ASSERTION_IDS.set(assertionId, expiryMs);
}

function validateDestination(xml: string, expectedDestination: string): void {
  const destMatch = xml.match(/<(?:samlp:)?Response\b[^>]+\bDestination="([^"]+)"/);
  if (destMatch) {
    const destination = destMatch[1];
    if (destination !== expectedDestination) {
      throw new Error(
        `SAML: Destination mismatch - expected "${expectedDestination}", got "${destination}"`,
      );
    }
  }
}

/**
 * Validate and parse a SAML Response.
 * Verifies the signature, checks conditions, and extracts the user profile.
 */
export async function validateSamlResponse(
  config: SamlConfig,
  samlResponse: string,
): Promise<SamlProfile> {
  const xml = Buffer.from(samlResponse, "base64").toString("utf-8");

  // Validate Destination attribute on the Response
  validateDestination(xml, config.callbackUrl);

  // Verify XML digital signature
  verifySignature(xml, config.cert);

  // Replay protection
  checkReplayProtection(xml);

  const assertion = extractAssertion(xml);

  // Validate time conditions and Audience restriction
  validateConditions(assertion, config.issuer);

  return extractProfile(assertion);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deflateAndEncode(xml: string): string {
  const deflated = zlib.deflateRawSync(Buffer.from(xml, "utf-8"));
  return deflated.toString("base64");
}

function verifySignature(xml: string, cert: string): void {
  if (!cert || cert.trim().length === 0) {
    throw new Error("SAML: IdP certificate is required for signature verification");
  }

  // Find Signature element (handle both ds: prefixed and unprefixed)
  const sigBlockMatch = xml.match(
    /<(?:ds:)?Signature\b[^>]*xmlns(?::ds)?="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"[^>]*>([\s\S]*?)<\/(?:ds:)?Signature>/,
  );
  if (!sigBlockMatch) {
    throw new Error("SAML: No XML Signature found in response");
  }
  const signatureBlock = sigBlockMatch[0];

  // Extract SignatureMethod algorithm
  const sigMethodMatch = signatureBlock.match(/<(?:ds:)?SignatureMethod\s+Algorithm="([^"]+)"/);
  const sigAlgorithm = sigMethodMatch?.[1] ?? "";

  let nodeAlgorithm: string;
  if (sigAlgorithm.includes("rsa-sha256") || sigAlgorithm.includes("rsa-sha256")) {
    nodeAlgorithm = "RSA-SHA256";
  } else if (sigAlgorithm.includes("rsa-sha1") || sigAlgorithm.includes("#rsa-sha1")) {
    nodeAlgorithm = "RSA-SHA1";
  } else if (sigAlgorithm.includes("rsa-sha512")) {
    nodeAlgorithm = "RSA-SHA512";
  } else {
    // Default to RSA-SHA256 if algorithm not recognized
    nodeAlgorithm = "RSA-SHA256";
  }

  // Extract SignatureValue
  const sigValueMatch = signatureBlock.match(
    /<(?:ds:)?SignatureValue[^>]*>([\s\S]*?)<\/(?:ds:)?SignatureValue>/,
  );
  if (!sigValueMatch) {
    throw new Error("SAML: SignatureValue not found in Signature element");
  }
  const signatureValue = sigValueMatch[1].replace(/\s+/g, "");

  // Extract SignedInfo block (canonical form for verification)
  const signedInfoMatch = signatureBlock.match(
    /<(?:ds:)?SignedInfo\b[^>]*>([\s\S]*?)<\/(?:ds:)?SignedInfo>/,
  );
  if (!signedInfoMatch) {
    throw new Error("SAML: SignedInfo not found in Signature element");
  }
  // Reconstruct the full SignedInfo element for verification
  const signedInfoFull = signatureBlock.match(
    /<(?:ds:)?SignedInfo\b[^>]*>[\s\S]*?<\/(?:ds:)?SignedInfo>/,
  )![0];

  // Ensure SignedInfo has the dsig namespace for canonical verification
  let canonicalSignedInfo = signedInfoFull;
  if (!canonicalSignedInfo.includes("http://www.w3.org/2000/09/xmldsig#")) {
    canonicalSignedInfo = canonicalSignedInfo.replace(
      /(<(?:ds:)?SignedInfo\b)/,
      '$1 xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
    );
  }

  // Build PEM certificate
  const pemCert = buildPemCert(cert);

  // Verify the signature over SignedInfo
  const verifier = crypto.createVerify(nodeAlgorithm);
  verifier.update(canonicalSignedInfo, "utf-8");
  const isValid = verifier.verify(pemCert, signatureValue, "base64");
  if (!isValid) {
    throw new Error("SAML: XML signature verification failed - signature is invalid");
  }

  // Verify digest of the referenced element
  verifyDigest(signatureBlock, xml);
}

function buildPemCert(cert: string): string {
  // If already in PEM format, return as-is
  if (cert.includes("-----BEGIN CERTIFICATE-----")) {
    return cert;
  }
  // Strip any whitespace and wrap in PEM headers
  const cleanCert = cert.replace(/\s+/g, "");
  const lines: string[] = [];
  lines.push("-----BEGIN CERTIFICATE-----");
  for (let i = 0; i < cleanCert.length; i += 64) {
    lines.push(cleanCert.slice(i, i + 64));
  }
  lines.push("-----END CERTIFICATE-----");
  return lines.join("\n");
}

function verifyDigest(signatureBlock: string, xml: string): void {
  // Extract Reference URI
  const refMatch = signatureBlock.match(/<(?:ds:)?Reference\s+URI="([^"]*)"/);
  if (!refMatch) {
    throw new Error("SAML: Reference URI not found in SignedInfo");
  }

  // Extract DigestMethod
  const digestMethodMatch = signatureBlock.match(/<(?:ds:)?DigestMethod\s+Algorithm="([^"]+)"/);
  const digestAlg = digestMethodMatch?.[1] ?? "";

  let hashAlgorithm: string;
  if (digestAlg.includes("sha256")) {
    hashAlgorithm = "sha256";
  } else if (digestAlg.includes("sha1")) {
    hashAlgorithm = "sha1";
  } else if (digestAlg.includes("sha512")) {
    hashAlgorithm = "sha512";
  } else {
    hashAlgorithm = "sha256";
  }

  // Extract DigestValue
  const digestValueMatch = signatureBlock.match(
    /<(?:ds:)?DigestValue[^>]*>([\s\S]*?)<\/(?:ds:)?DigestValue>/,
  );
  if (!digestValueMatch) {
    throw new Error("SAML: DigestValue not found in Reference");
  }
  const expectedDigest = digestValueMatch[1].replace(/\s+/g, "");

  // Find the referenced element
  const uri = refMatch[1];
  let referencedElement: string;
  if (uri === "" || uri === "#") {
    // Refers to the entire document root element
    referencedElement = xml;
  } else {
    // URI is like "#_id123" - find element with matching ID
    const refId = uri.startsWith("#") ? uri.slice(1) : uri;
    // Match element with ID attribute (handle common ID attribute names)
    const idPattern = new RegExp(
      `(<[^>]+(?:ID|Id|id)="${escapeRegex(refId)}"[\\s\\S]*?)(<\\/[^>]+>)\\s*$`,
    );
    // More robust: find the element that has this ID then capture it fully
    const elementStartPattern = new RegExp(
      `<(\\w+(?::\\w+)?)\\s[^>]*(?:ID|Id|id)="${escapeRegex(refId)}"`,
    );
    const startMatch = xml.match(elementStartPattern);
    if (!startMatch) {
      throw new Error(`SAML: Referenced element with ID "${refId}" not found`);
    }
    const tagName = startMatch[1];
    const startIdx = xml.indexOf(startMatch[0]);
    const closingTag = `</${tagName}>`;
    const endIdx = xml.indexOf(closingTag, startIdx);
    if (endIdx === -1) {
      throw new Error(`SAML: Could not find closing tag for referenced element "${tagName}"`);
    }
    referencedElement = xml.slice(startIdx, endIdx + closingTag.length);
  }

  // Remove the Signature element from the referenced element before computing digest
  // (Enveloped Signature Transform)
  const withoutSignature = referencedElement.replace(
    /<(?:ds:)?Signature\b[^>]*>[\s\S]*?<\/(?:ds:)?Signature>/,
    "",
  );

  // Compute digest
  const hash = crypto.createHash(hashAlgorithm);
  hash.update(withoutSignature, "utf-8");
  const computedDigest = hash.digest("base64");

  if (computedDigest !== expectedDigest) {
    throw new Error("SAML: Digest verification failed - content may have been tampered with");
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAssertion(xml: string): string {
  // Handle both saml: prefixed and unprefixed Assertion elements
  const assertionMatch = xml.match(/<(saml:|saml2:|)Assertion\b[\s\S]*?<\/\1Assertion>/);
  if (!assertionMatch) {
    throw new Error("SAML: No assertion found in response");
  }
  return assertionMatch[0];
}

function validateConditions(assertion: string, audience: string): void {
  const now = new Date();

  const notBeforeMatch = assertion.match(/NotBefore="([^"]+)"/);
  if (notBeforeMatch) {
    const notBefore = new Date(notBeforeMatch[1]);
    if (now < notBefore) {
      throw new Error("SAML: Assertion is not yet valid");
    }
  }

  const notAfterMatch = assertion.match(/NotOnOrAfter="([^"]+)"/);
  if (notAfterMatch) {
    const notAfter = new Date(notAfterMatch[1]);
    if (now >= notAfter) {
      throw new Error("SAML: Assertion has expired");
    }
  }

  // Validate Audience restriction
  const audienceMatch = assertion.match(/<(?:saml:)?Audience[^>]*>([^<]+)<\/(?:saml:)?Audience>/);
  if (audienceMatch) {
    const responseAudience = audienceMatch[1].trim();
    if (responseAudience !== audience) {
      throw new Error(
        `SAML: Audience mismatch - expected "${audience}", got "${responseAudience}"`,
      );
    }
  }
}

function extractProfile(assertion: string): SamlProfile {
  const nameIdMatch = assertion.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
  if (!nameIdMatch) {
    throw new Error("SAML: NameID not found in assertion");
  }

  const nameId = nameIdMatch[1];
  const attributes = extractAttributes(assertion);

  return {
    nameId,
    email: attributes["email"] ?? attributes["Email"] ?? nameId,
    firstName: attributes["firstName"] ?? attributes["givenName"] ?? attributes["first_name"],
    lastName: attributes["lastName"] ?? attributes["surname"] ?? attributes["last_name"],
    groups: attributes["groups"] ? attributes["groups"].split(",").map((g) => g.trim()) : undefined,
    attributes,
  };
}

function extractAttributes(assertion: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /<saml:Attribute\s+Name="([^"]+)"[^>]*>\s*<saml:AttributeValue[^>]*>([^<]*)<\/saml:AttributeValue>/g;

  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(assertion)) !== null) {
    const name = match[1].split("/").pop() ?? match[1];
    attrs[name] = match[2];
  }

  return attrs;
}
