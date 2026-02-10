/**
 * Email service abstraction for transactional emails (password reset, invites, MFA).
 *
 * Uses SMTP via nodemailer when SMTP_HOST is configured, otherwise falls back to
 * a console logger suitable for development and testing.
 */

import { passwordResetTemplate, inviteTemplate } from "./email-templates.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IEmailService {
  sendPasswordReset(email: string, token: string, name: string): Promise<void>;
  sendInvite(email: string, token: string, tenantName: string): Promise<void>;
  sendMfaEnabled(email: string, name: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// SMTP implementation (nodemailer)
// ---------------------------------------------------------------------------

export class SmtpEmailService implements IEmailService {
  private transporter: import("nodemailer").Transporter | null = null;
  private readonly from: string;

  constructor() {
    this.from = process.env.SMTP_FROM ?? "noreply@cerebro.ai";
  }

  private async getTransporter() {
    if (!this.transporter) {
      const nodemailer = await import("nodemailer");
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      });
    }
    return this.transporter;
  }

  async sendPasswordReset(email: string, token: string, name: string): Promise<void> {
    const adminUiUrl = process.env.ADMIN_UI_URL ?? "http://localhost:5173";
    const resetUrl = `${adminUiUrl}/reset-password/${token}`;
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: email,
      subject: "Password Reset Request",
      html: passwordResetTemplate(name, resetUrl),
    });
  }

  async sendInvite(email: string, token: string, tenantName: string): Promise<void> {
    const adminUiUrl = process.env.ADMIN_UI_URL ?? "http://localhost:5173";
    const inviteUrl = `${adminUiUrl}/register?invite=${token}`;
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: email,
      subject: `You're invited to join ${tenantName}`,
      html: inviteTemplate(tenantName, inviteUrl),
    });
  }

  async sendMfaEnabled(email: string, name: string): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: email,
      subject: "MFA Has Been Enabled",
      html: `<p>Hi ${name},</p><p>Multi-factor authentication has been enabled on your account. If you did not make this change, please contact your administrator immediately.</p>`,
    });
  }
}

// ---------------------------------------------------------------------------
// Console fallback (dev / test)
// ---------------------------------------------------------------------------

export class ConsoleEmailService implements IEmailService {
  async sendPasswordReset(email: string, token: string, name: string): Promise<void> {
    const adminUiUrl = process.env.ADMIN_UI_URL ?? "http://localhost:5173";
    const resetUrl = `${adminUiUrl}/reset-password/${token}`;
    console.log(`[EMAIL] Password reset for ${name} <${email}>: ${resetUrl}`);
  }

  async sendInvite(email: string, token: string, tenantName: string): Promise<void> {
    const adminUiUrl = process.env.ADMIN_UI_URL ?? "http://localhost:5173";
    const inviteUrl = `${adminUiUrl}/register?invite=${token}`;
    console.log(`[EMAIL] Invite to ${tenantName} for <${email}>: ${inviteUrl}`);
  }

  async sendMfaEnabled(email: string, name: string): Promise<void> {
    console.log(`[EMAIL] MFA enabled notification for ${name} <${email}>`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: IEmailService | null = null;

export function getEmailService(): IEmailService {
  if (!instance) {
    instance = process.env.SMTP_HOST ? new SmtpEmailService() : new ConsoleEmailService();
  }
  return instance;
}
