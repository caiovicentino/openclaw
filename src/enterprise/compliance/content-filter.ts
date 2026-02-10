// Content filter for PII/sensitive data scanning
// Operates on text content (user input, agent output) to detect and optionally redact sensitive data.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SensitiveDataType =
  | "email"
  | "phone"
  | "cpf" // Brazilian CPF
  | "cnpj" // Brazilian CNPJ
  | "credit_card"
  | "ssn" // US Social Security Number
  | "ip_address"
  | "api_key"
  | "jwt_token"
  | "password_literal"
  | "aws_key"
  | "private_key";

export type DetectedItem = {
  type: SensitiveDataType;
  value: string;
  redacted: string;
  startIndex: number;
  endIndex: number;
};

export type ContentFilterResult = {
  containsSensitiveData: boolean;
  detectedItems: DetectedItem[];
  redactedContent: string;
  originalLength: number;
};

export type ContentFilterConfig = {
  enabledTypes: SensitiveDataType[];
  redactCharacter?: string;
  blockOnDetection?: boolean;
  logDetections?: boolean;
};

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const ALL_TYPES: SensitiveDataType[] = [
  "email",
  "phone",
  "cpf",
  "cnpj",
  "credit_card",
  "ssn",
  "ip_address",
  "api_key",
  "jwt_token",
  "password_literal",
  "aws_key",
  "private_key",
];

const DEFAULT_CONFIG: ContentFilterConfig = {
  enabledTypes: ALL_TYPES,
  redactCharacter: "*",
  blockOnDetection: false,
  logDetections: true,
};

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

type PatternDef = {
  type: SensitiveDataType;
  pattern: RegExp;
  redact: (match: string, char: string) => string;
  validate?: (match: string) => boolean;
};

const PATTERNS: PatternDef[] = [
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    redact: (match, char) => {
      const [local, domain] = match.split("@");
      if (!local || !domain) return char.repeat(match.length);
      return local[0] + char.repeat(local.length - 1) + "@" + char.repeat(domain.length);
    },
  },
  {
    type: "phone",
    // Matches common phone formats: +55 11 91234-5678, (11) 91234-5678, 11912345678, +1-555-123-4567
    pattern: /(?:\+\d{1,3}[\s\-]?)?\(?\d{2,3}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}\b/g,
    redact: (match, char) => match.replace(/\d/g, char),
  },
  {
    type: "cpf",
    // Brazilian CPF: 123.456.789-09 or 12345678909
    pattern: /\b\d{3}\.?\d{3}\.?\d{3}[\-]?\d{2}\b/g,
    redact: (match, char) => match.replace(/\d/g, char),
    validate: (match) => validateCpf(match.replace(/\D/g, "")),
  },
  {
    type: "cnpj",
    // Brazilian CNPJ: 12.345.678/0001-09 or 12345678000109
    pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[\-]?\d{2}\b/g,
    redact: (match, char) => match.replace(/\d/g, char),
    validate: (match) => validateCnpj(match.replace(/\D/g, "")),
  },
  {
    type: "credit_card",
    // Credit card numbers (Visa, Mastercard, Amex, etc.)
    pattern: /\b(?:\d{4}[\s\-]?){3}\d{1,4}\b/g,
    redact: (match, char) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) return match;
      const last4 = digits.slice(-4);
      return char.repeat(digits.length - 4) + last4;
    },
    validate: (match) => luhnCheck(match.replace(/\D/g, "")),
  },
  {
    type: "ssn",
    // US SSN: 123-45-6789
    pattern: /\b\d{3}[\-\s]?\d{2}[\-\s]?\d{4}\b/g,
    redact: (match, char) => match.replace(/\d/g, char),
    validate: (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length !== 9) return false;
      // SSNs cannot start with 000, 666, or 900-999
      const area = Number(digits.slice(0, 3));
      return area !== 0 && area !== 666 && area < 900;
    },
  },
  {
    type: "ip_address",
    // IPv4 addresses (not matching common non-sensitive ones like 0.0.0.0, 127.0.0.1, etc.)
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|1?\d\d?)\b/g,
    redact: (match, char) => match.replace(/\d+/g, (d) => char.repeat(d.length)),
    validate: (match) => {
      // Skip common non-sensitive IPs
      return (
        match !== "0.0.0.0" &&
        match !== "127.0.0.1" &&
        !match.startsWith("192.168.") &&
        !match.startsWith("10.")
      );
    },
  },
  {
    type: "api_key",
    // Common API key patterns: sk-..., pk-..., api_..., key-...
    pattern: /\b(?:sk|pk|api|key|token)[\-_][A-Za-z0-9\-_]{20,}\b/gi,
    redact: (match, char) => {
      const prefix = match.slice(0, 4);
      return prefix + char.repeat(match.length - 4);
    },
  },
  {
    type: "jwt_token",
    // JWT tokens: eyJ...
    pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
    redact: (match, char) => "eyJ" + char.repeat(Math.min(match.length - 3, 40)) + "...",
  },
  {
    type: "password_literal",
    // Matches patterns like password=..., password: "...", passwd=...
    pattern: /(?:password|passwd|pwd|secret|token)\s*[:=]\s*["']?([^\s"',;]{4,})["']?/gi,
    redact: (match, char) => {
      const eqIdx = match.search(/[:=]/);
      if (eqIdx === -1) return char.repeat(match.length);
      return match.slice(0, eqIdx + 1) + " " + char.repeat(8);
    },
  },
  {
    type: "aws_key",
    // AWS access key IDs (AKIA...)
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    redact: (match, char) => match.slice(0, 4) + char.repeat(match.length - 4),
  },
  {
    type: "private_key",
    // PEM private key headers
    pattern:
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    redact: (_match, _char) => "[REDACTED PRIVATE KEY]",
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function luhnCheck(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function validateCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (slice: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (factor - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(digits.slice(0, 9), 10);
  const d2 = calcDigit(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

function validateCnpj(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (slice: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(slice[i]) * weights[i];
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcDigit(digits.slice(0, 12), weights1);
  const d2 = calcDigit(digits.slice(0, 13), weights2);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

// ---------------------------------------------------------------------------
// Core scanning function
// ---------------------------------------------------------------------------

export function scanContent(
  content: string,
  config: ContentFilterConfig = DEFAULT_CONFIG,
): ContentFilterResult {
  const redactChar = config.redactCharacter ?? "*";
  const enabledSet = new Set(config.enabledTypes);
  const detectedItems: DetectedItem[] = [];

  for (const patternDef of PATTERNS) {
    if (!enabledSet.has(patternDef.type)) continue;

    // Reset the regex lastIndex for global patterns
    patternDef.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = patternDef.pattern.exec(content)) !== null) {
      const value = match[0];

      if (patternDef.validate && !patternDef.validate(value)) {
        continue;
      }

      detectedItems.push({
        type: patternDef.type,
        value,
        redacted: patternDef.redact(value, redactChar),
        startIndex: match.index,
        endIndex: match.index + value.length,
      });
    }
  }

  // Sort by start index descending so we can safely replace without offset shifts
  detectedItems.sort((a, b) => b.startIndex - a.startIndex);

  let redactedContent = content;
  for (const item of detectedItems) {
    redactedContent =
      redactedContent.slice(0, item.startIndex) +
      item.redacted +
      redactedContent.slice(item.endIndex);
  }

  // Re-sort by start index ascending for output
  detectedItems.sort((a, b) => a.startIndex - b.startIndex);

  return {
    containsSensitiveData: detectedItems.length > 0,
    detectedItems,
    redactedContent,
    originalLength: content.length,
  };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

export function containsPII(content: string): boolean {
  return scanContent(content, {
    enabledTypes: ["email", "phone", "cpf", "cnpj", "ssn", "credit_card"],
  }).containsSensitiveData;
}

export function containsSecrets(content: string): boolean {
  return scanContent(content, {
    enabledTypes: ["api_key", "jwt_token", "password_literal", "aws_key", "private_key"],
  }).containsSensitiveData;
}

export function redactPII(content: string): string {
  return scanContent(content, {
    enabledTypes: ["email", "phone", "cpf", "cnpj", "ssn", "credit_card"],
  }).redactedContent;
}

export function redactSecrets(content: string): string {
  return scanContent(content, {
    enabledTypes: ["api_key", "jwt_token", "password_literal", "aws_key", "private_key"],
  }).redactedContent;
}

export function redactAll(content: string): string {
  return scanContent(content).redactedContent;
}

export function getDefaultConfig(): ContentFilterConfig {
  return { ...DEFAULT_CONFIG, enabledTypes: [...DEFAULT_CONFIG.enabledTypes] };
}

// ---------------------------------------------------------------------------
// PII_PATTERNS – Simplified regex exports for direct use (LGPD + intl)
// ---------------------------------------------------------------------------

export const PII_PATTERNS: Record<string, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_br: /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/g,
  cpf: /\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/g,
  cnpj: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2}/g,
  credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
};

// ---------------------------------------------------------------------------
// High-level ContentFilter class (wraps scanContent for policy-engine use)
// ---------------------------------------------------------------------------

export type ComplianceFilterConfig = {
  blockPii: boolean;
  blockPiiTypes: string[];
  blockKeywords: string[];
  blockCategories: string[];
  warnOnly: boolean;
  redactInsteadOfBlock: boolean;
};

export type ContentDetection = {
  type: "pii" | "keyword" | "category";
  subtype: string;
  match: string;
  position: { start: number; end: number };
  action: "blocked" | "redacted" | "warned";
};

export type ComplianceFilterResult = {
  allowed: boolean;
  filtered: boolean;
  originalContent?: string;
  filteredContent?: string;
  detections: ContentDetection[];
};

export class ComplianceContentFilter {
  constructor(private cfg: ComplianceFilterConfig) {}

  filter(content: string): ComplianceFilterResult {
    const detections: ContentDetection[] = [];

    // PII detection via the core scanner
    if (this.cfg.blockPii) {
      const piiTypes =
        this.cfg.blockPiiTypes.length > 0
          ? (this.cfg.blockPiiTypes as SensitiveDataType[])
          : (["email", "phone", "cpf", "cnpj", "credit_card", "ssn"] as SensitiveDataType[]);

      const scanResult = scanContent(content, { enabledTypes: piiTypes });
      for (const item of scanResult.detectedItems) {
        detections.push({
          type: "pii",
          subtype: item.type,
          match: item.value,
          position: { start: item.startIndex, end: item.endIndex },
          action: "blocked",
        });
      }
    }

    // Keyword detection
    if (this.cfg.blockKeywords.length > 0) {
      const lowerContent = content.toLowerCase();
      for (const keyword of this.cfg.blockKeywords) {
        const lowerKw = keyword.toLowerCase();
        let searchStart = 0;
        let idx: number;
        while ((idx = lowerContent.indexOf(lowerKw, searchStart)) !== -1) {
          detections.push({
            type: "keyword",
            subtype: keyword,
            match: content.slice(idx, idx + keyword.length),
            position: { start: idx, end: idx + keyword.length },
            action: "blocked",
          });
          searchStart = idx + keyword.length;
        }
      }
    }

    if (detections.length === 0) {
      return { allowed: true, filtered: false, detections: [] };
    }

    // Resolve action
    const action: "blocked" | "redacted" | "warned" = this.cfg.warnOnly
      ? "warned"
      : this.cfg.redactInsteadOfBlock
        ? "redacted"
        : "blocked";

    for (const det of detections) {
      det.action = action;
    }

    if (action === "warned") {
      return { allowed: true, filtered: false, detections };
    }

    if (action === "redacted") {
      const filteredContent = this.redactContent(content, detections);
      return {
        allowed: true,
        filtered: true,
        originalContent: content,
        filteredContent,
        detections,
      };
    }

    return {
      allowed: false,
      filtered: false,
      originalContent: content,
      detections,
    };
  }

  private redactContent(content: string, detections: ContentDetection[]): string {
    const sorted = [...detections].sort((a, b) => b.position.start - a.position.start);
    let result = content;
    for (const det of sorted) {
      const tag = `[${det.type.toUpperCase()}:${det.subtype.toUpperCase()}]`;
      result = result.slice(0, det.position.start) + tag + result.slice(det.position.end);
    }
    return result;
  }
}

export function createComplianceFilter(config: ComplianceFilterConfig): ComplianceContentFilter {
  return new ComplianceContentFilter(config);
}
