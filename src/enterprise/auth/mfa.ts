import { randomInt } from "crypto";
import { TOTP, generateSecret as otpGenerateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

export type MfaSetupResult = {
  secret: string;
  otpauthUrl: string;
  qrCode: string;
};

export async function generateMfaSecret(
  userEmail: string,
  issuer: string = "Cérebro",
): Promise<MfaSetupResult> {
  const secret = otpGenerateSecret();
  const otpauthUrl = generateURI({ type: "totp", secret, label: userEmail, issuer });
  const qrCode = await QRCode.toDataURL(otpauthUrl);

  return { secret, otpauthUrl, qrCode };
}

export function verifyMfaToken(secret: string, token: string): boolean {
  return verifySync({ token, secret, window: 1 });
}

export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[randomInt(chars.length)];
    }
    codes.push(code);
  }

  return codes;
}
