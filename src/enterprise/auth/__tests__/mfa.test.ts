import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock otplib since the installed version (v13+) doesn't export `authenticator`
// as a named export. The source mfa.ts imports { authenticator } from 'otplib',
// so we need to provide a compatible mock.
const mockGenerateSecret = vi.fn(() => "MOCK_SECRET_BASE32");
const mockKeyuri = vi.fn(
  (account: string, issuer: string, secret: string) =>
    `otpauth://totp/${issuer}:${encodeURIComponent(account)}?secret=${secret}&issuer=${issuer}`,
);
const mockCheck = vi.fn(() => true);
const mockCreate = vi.fn(() => ({ check: mockCheck }));

vi.mock("otplib", () => ({
  authenticator: {
    generateSecret: mockGenerateSecret,
    keyuri: mockKeyuri,
    create: mockCreate,
    options: { window: 0 },
  },
}));

// Mock qrcode
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => "data:image/png;base64,MOCKQRDATA"),
  },
}));

// Import AFTER mocks are set up
const { generateMfaSecret, verifyMfaToken, generateBackupCodes } = await import("../mfa.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// generateMfaSecret
// ---------------------------------------------------------------------------

describe("generateMfaSecret", () => {
  it("returns secret, qrCode, and otpauthUrl", async () => {
    const result = await generateMfaSecret("alice@acme.com");
    expect(result.secret).toBe("MOCK_SECRET_BASE32");
    expect(result.otpauthUrl).toContain("otpauth://totp/");
    expect(result.otpauthUrl).toContain("alice%40acme.com");
    expect(result.qrCode).toBe("data:image/png;base64,MOCKQRDATA");
  });

  it("uses the provided issuer in the otpauth URL", async () => {
    const result = await generateMfaSecret("bob@acme.com", "MyApp");
    expect(mockKeyuri).toHaveBeenCalledWith("bob@acme.com", "MyApp", "MOCK_SECRET_BASE32");
    expect(result.otpauthUrl).toContain("MyApp");
  });

  it("defaults issuer to Cérebro", async () => {
    const result = await generateMfaSecret("carol@acme.com");
    expect(mockKeyuri).toHaveBeenCalledWith("carol@acme.com", "Cérebro", "MOCK_SECRET_BASE32");
    expect(result.otpauthUrl).toContain("Cérebro");
  });
});

// ---------------------------------------------------------------------------
// verifyMfaToken
// ---------------------------------------------------------------------------

describe("verifyMfaToken", () => {
  it("returns false for an incorrect token", () => {
    mockCheck.mockReturnValue(false);
    expect(verifyMfaToken("SOME_SECRET", "000000")).toBe(false);
  });

  it("returns true for a valid token", () => {
    mockCheck.mockReturnValue(true);
    expect(verifyMfaToken("SOME_SECRET", "123456")).toBe(true);
  });

  it("creates an authenticator instance with window=1", () => {
    verifyMfaToken("SOME_SECRET", "123456");
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ window: 1 }));
  });
});

// ---------------------------------------------------------------------------
// generateBackupCodes
// ---------------------------------------------------------------------------

describe("generateBackupCodes", () => {
  it("generates the default number (10) of backup codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
  });

  it("generates the requested number of codes", () => {
    const codes = generateBackupCodes(5);
    expect(codes).toHaveLength(5);
  });

  it("each code is 8 characters of alphanumeric characters", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("generates unique codes", () => {
    const codes = generateBackupCodes(20);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
