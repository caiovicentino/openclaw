/**
 * BaileysManager — singleton that manages WhatsApp Web (Baileys) connections.
 *
 * Connections are keyed by `{tenantId}:{channelId}`.
 * Auth credentials persist on disk so sessions survive server restarts.
 */
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { query } from "../db/connection.js";
import { logger } from "../lib/logger.js";
import { getAdapter } from "./adapter-registry.js";
import { routeIncomingMessage } from "./webhook-router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WaSocket = ReturnType<typeof makeWASocket>;

interface ActiveConnection {
  tenantId: string;
  channelId: string;
  sock: WaSocket;
  authDir: string;
  connected: boolean;
  phoneNumber: string | null;
}

interface PendingLogin {
  loginId: string;
  tenantId: string;
  channelId: string;
  sock: WaSocket;
  authDir: string;
  qrDataUrl: string | null;
  connected: boolean;
  error: string | null;
  startedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_BASE = "/tmp/openclaw-whatsapp";

function connKey(tenantId: string, channelId: string): string {
  return `${tenantId}:${channelId}`;
}

function authDir(tenantId: string, channelId: string): string {
  // Sanitize inputs to prevent path traversal
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeChannel = channelId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(AUTH_BASE, safeTenant, safeChannel);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function getStatusCode(err: unknown): number | undefined {
  return (
    (err as { output?: { statusCode?: number } })?.output?.statusCode ??
    (err as { status?: number })?.status
  );
}

/** Suppress Baileys' verbose internal logging. */
function silentLogger(): ReturnType<(typeof import("pino"))["default"]> {
  // Baileys expects a pino-compatible logger.  We return a minimal stub that
  // swallows everything so the console stays clean.
  const noop = () => {};
  const child = () => silentLogger();
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child,
    level: "silent",
  } as unknown as ReturnType<(typeof import("pino"))["default"]>;
}

/** Build channelConfig with injected _tenantId and _channelId for the adapter. */
async function buildChannelConfig(
  tenantId: string,
  channelId: string,
): Promise<Record<string, unknown>> {
  const channelResult = await query("SELECT config FROM channels WHERE id = $1", [channelId]);
  const config = (channelResult.rows[0]?.config ?? {}) as Record<string, unknown>;
  return { ...config, _tenantId: tenantId, _channelId: channelId };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

class BaileysManager {
  private connections = new Map<string, ActiveConnection>();
  private pendingLogins = new Map<string, PendingLogin>();

  // ── QR Login Flow ───────────────────────────────────────────

  async startQrLogin(
    tenantId: string,
    channelId: string,
  ): Promise<{ loginId: string; qrDataUrl: string | null; message: string }> {
    const key = connKey(tenantId, channelId);

    // If already connected, return immediately
    const existing = this.connections.get(key);
    if (existing?.connected) {
      return { loginId: "", qrDataUrl: null, message: "Already connected" };
    }

    // Close any stale active connection that's not connected
    if (existing && !existing.connected) {
      try {
        existing.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.connections.delete(key);
    }

    // If there's already a pending login, return it if still fresh
    const existingLogin = this.pendingLogins.get(key);
    if (existingLogin && Date.now() - existingLogin.startedAt < 60_000) {
      return {
        loginId: existingLogin.loginId,
        qrDataUrl: existingLogin.qrDataUrl,
        message: "Login already in progress",
      };
    }

    // Clean up any previous pending login (expired)
    if (existingLogin) {
      try {
        existingLogin.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.pendingLogins.delete(key);
    }

    const loginId = randomUUID();
    const dir = authDir(tenantId, channelId);
    await ensureDir(dir);

    const pending: PendingLogin = {
      loginId,
      tenantId,
      channelId,
      sock: null as unknown as WaSocket,
      authDir: dir,
      qrDataUrl: null,
      connected: false,
      error: null,
      startedAt: Date.now(),
    };

    // Create socket and wait for QR
    try {
      const { state, saveCreds } = await useMultiFileAuthState(dir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, silentLogger()),
        },
        version,
        logger: silentLogger(),
        printQRInTerminal: false,
        browser: ["Cerebro", "admin", "1.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      pending.sock = sock;
      this.pendingLogins.set(key, pending);

      // Wait for the first QR code (up to 30s)
      const qrDataUrl = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 30_000);

        sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
          if (update.qr) {
            clearTimeout(timeout);
            QRCode.toDataURL(update.qr)
              .then((url) => {
                pending.qrDataUrl = url;
                resolve(url);
              })
              .catch(() => resolve(null));
          }
          if (update.connection === "open") {
            clearTimeout(timeout);
            resolve(null); // Connected without QR (existing creds)
          }
        });

        // Also set up all handlers
        this.setupSocketHandlers(sock, saveCreds, tenantId, channelId, key, pending);
      });

      return { loginId, qrDataUrl, message: qrDataUrl ? "Scan QR code" : "Connecting..." };
    } catch (err) {
      pending.error = err instanceof Error ? err.message : String(err);
      logger.error("Failed to start QR login", { tenantId, channelId, error: pending.error });
      return { loginId, qrDataUrl: null, message: `Failed: ${pending.error}` };
    }
  }

  getLoginStatus(
    tenantId: string,
    channelId: string,
    loginId: string,
  ): {
    status: "waiting" | "connected" | "error" | "expired";
    message: string;
    phoneNumber?: string;
  } {
    const key = connKey(tenantId, channelId);

    // Check active connections first
    const conn = this.connections.get(key);
    if (conn?.connected) {
      return {
        status: "connected",
        message: "WhatsApp connected",
        phoneNumber: conn.phoneNumber ?? undefined,
      };
    }

    const pending = this.pendingLogins.get(key);
    if (!pending || pending.loginId !== loginId) {
      return { status: "expired", message: "Login session expired or not found" };
    }

    if (pending.connected) {
      return { status: "connected", message: "WhatsApp connected", phoneNumber: undefined };
    }

    if (pending.error) {
      return { status: "error", message: pending.error };
    }

    // Check timeout (60s)
    if (Date.now() - pending.startedAt > 60_000) {
      try {
        pending.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.pendingLogins.delete(key);
      return { status: "expired", message: "QR code expired" };
    }

    return { status: "waiting", message: "Waiting for QR scan..." };
  }

  // ── Disconnect ──────────────────────────────────────────────

  async disconnect(tenantId: string, channelId: string): Promise<void> {
    const key = connKey(tenantId, channelId);

    // Close active connection
    const conn = this.connections.get(key);
    if (conn) {
      try {
        conn.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.connections.delete(key);
    }

    // Close pending login
    const pending = this.pendingLogins.get(key);
    if (pending) {
      try {
        pending.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.pendingLogins.delete(key);
    }

    // Remove auth directory
    rmDir(authDir(tenantId, channelId));

    // Update DB
    await query(
      `UPDATE channels SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [channelId, tenantId],
    );

    logger.info("WhatsApp Web disconnected", { tenantId, channelId });
  }

  // ── Send Message ────────────────────────────────────────────

  async sendMessage(
    tenantId: string,
    channelId: string,
    jid: string,
    text: string,
  ): Promise<boolean> {
    const key = connKey(tenantId, channelId);
    const conn = this.connections.get(key);
    if (!conn?.connected) return false;

    try {
      await conn.sock.sendMessage(jid, { text });
      return true;
    } catch (err) {
      logger.error("Failed to send WhatsApp message", {
        tenantId,
        channelId,
        jid,
        error: String(err),
      });
      return false;
    }
  }

  // ── Connection State ────────────────────────────────────────

  isConnected(tenantId: string, channelId: string): boolean {
    return this.connections.get(connKey(tenantId, channelId))?.connected === true;
  }

  // ── Cleanup ────────────────────────────────────────────────

  /** Clean up any pending logins older than 90 seconds. */
  cleanupStalePendingLogins(): void {
    const now = Date.now();
    for (const [key, pending] of this.pendingLogins) {
      if (now - pending.startedAt > 90_000) {
        try {
          pending.sock.end(undefined);
        } catch {
          /* ignore */
        }
        this.pendingLogins.delete(key);
        logger.info("Cleaned up stale pending login", {
          tenantId: pending.tenantId,
          channelId: pending.channelId,
        });
      }
    }
  }

  // ── Auto-Reconnect ─────────────────────────────────────────

  async reconnectAll(): Promise<void> {
    // Start periodic cleanup of stale pending logins (every 60s)
    setInterval(() => this.cleanupStalePendingLogins(), 60_000);

    try {
      const result = await query(
        `SELECT id, tenant_id FROM channels WHERE type = 'whatsapp-web' AND status = 'active'`,
      );

      for (const row of result.rows) {
        const tenantId = row.tenant_id as string;
        const channelId = row.id as string;
        const dir = authDir(tenantId, channelId);

        // Only reconnect if auth creds exist on disk
        if (!fs.existsSync(path.join(dir, "creds.json"))) {
          logger.warn("No creds for whatsapp-web channel, marking inactive", {
            tenantId,
            channelId,
          });
          await query(
            `UPDATE channels SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [channelId, tenantId],
          ).catch(() => {});
          continue;
        }

        this.reconnectChannel(tenantId, channelId).catch((err) => {
          logger.error("Failed to reconnect whatsapp-web channel", {
            tenantId,
            channelId,
            error: String(err),
          });
        });
      }
    } catch (err) {
      logger.error("Failed to query channels for reconnect", { error: String(err) });
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private async reconnectChannel(
    tenantId: string,
    channelId: string,
    retryCount = 0,
  ): Promise<void> {
    const key = connKey(tenantId, channelId);
    const existingConn = this.connections.get(key);
    if (existingConn?.connected) return;

    // Close any stale socket before reconnecting
    if (existingConn) {
      try {
        existingConn.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.connections.delete(key);
    }

    const dir = authDir(tenantId, channelId);
    await ensureDir(dir);

    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger()),
      },
      version,
      logger: silentLogger(),
      printQRInTerminal: false,
      browser: ["Cerebro", "admin", "1.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const conn: ActiveConnection = {
      tenantId,
      channelId,
      sock,
      authDir: dir,
      connected: false,
      phoneNumber: null,
    };
    this.connections.set(key, conn);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      if (update.connection === "open") {
        conn.connected = true;
        const me = sock.user;
        conn.phoneNumber = me?.id?.split(":")[0] ?? me?.id ?? null;
        logger.info("WhatsApp Web reconnected", { tenantId, channelId, phone: conn.phoneNumber });

        query(
          `UPDATE channels SET status = 'active', last_active_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [channelId, tenantId],
        ).catch(() => {});
      }

      if (update.connection === "close") {
        conn.connected = false;
        const status = getStatusCode(update.lastDisconnect?.error);

        if (status === DisconnectReason.loggedOut) {
          // User logged out — clean up
          this.connections.delete(key);
          rmDir(dir);
          query(
            `UPDATE channels SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [channelId, tenantId],
          ).catch(() => {});
          logger.info("WhatsApp Web logged out", { tenantId, channelId });
          return;
        }

        // Auto-retry with exponential backoff
        const maxRetries = 5;
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 60_000);
          logger.info("WhatsApp Web reconnecting...", { tenantId, channelId, retryCount, delay });
          setTimeout(() => {
            this.reconnectChannel(tenantId, channelId, retryCount + 1).catch(() => {});
          }, delay);
        } else {
          logger.error("WhatsApp Web max retries reached", { tenantId, channelId });
          this.connections.delete(key);
          query(
            `UPDATE channels SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [channelId, tenantId],
          ).catch(() => {});
        }
      }
    });

    // Single message handler (shared helper)
    this.attachMessageHandler(sock, tenantId, channelId);
  }

  private setupSocketHandlers(
    sock: WaSocket,
    saveCreds: () => Promise<void>,
    tenantId: string,
    channelId: string,
    key: string,
    pending: PendingLogin,
  ): void {
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      // Update QR if a new one arrives
      if (update.qr) {
        QRCode.toDataURL(update.qr)
          .then((url) => {
            pending.qrDataUrl = url;
          })
          .catch(() => {});
      }

      if (update.connection === "open") {
        pending.connected = true;
        const me = sock.user;
        const phoneNumber = me?.id?.split(":")[0] ?? me?.id ?? null;

        // Promote to active connection
        const conn: ActiveConnection = {
          tenantId,
          channelId,
          sock,
          authDir: pending.authDir,
          connected: true,
          phoneNumber,
        };
        this.connections.set(key, conn);
        this.pendingLogins.delete(key);

        // Update DB
        query(
          `UPDATE channels SET status = 'active', last_active_at = NOW(), updated_at = NOW(), config = config || $3::jsonb WHERE id = $1 AND tenant_id = $2`,
          [channelId, tenantId, JSON.stringify({ phone: phoneNumber })],
        ).catch(() => {});

        logger.info("WhatsApp Web connected via QR", { tenantId, channelId, phone: phoneNumber });

        // Set up message handler (single registration)
        this.attachMessageHandler(sock, tenantId, channelId);
      }

      if (update.connection === "close") {
        const status = getStatusCode(update.lastDisconnect?.error);

        if (status === DisconnectReason.loggedOut) {
          pending.error = "WhatsApp logged out";
          this.pendingLogins.delete(key);
          this.connections.delete(key);
          rmDir(pending.authDir);
          return;
        }

        // For status 515 (restart required), retry after 2s
        if (status === 515) {
          setTimeout(() => {
            this.reconnectChannel(tenantId, channelId).catch(() => {});
          }, 2000);
          return;
        }

        pending.error = `Connection closed (${status ?? "unknown"})`;
      }
    });
  }

  /**
   * Single shared message handler — used by both QR login flow and reconnect flow.
   * Injects _tenantId and _channelId into channelConfig so the adapter can send replies.
   */
  private attachMessageHandler(sock: WaSocket, tenantId: string, channelId: string): void {
    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? null;
        if (!text) continue;

        const senderJid = msg.key.remoteJid ?? "";
        const pushName = msg.pushName ?? "User";

        const incomingMessage = {
          externalId: msg.key.id ?? randomUUID(),
          senderId: senderJid,
          senderName: pushName,
          text,
          platform: "whatsapp-web" as const,
          metadata: { jid: senderJid },
        };

        const adapter = getAdapter("whatsapp-web");
        const config = await buildChannelConfig(tenantId, channelId);

        routeIncomingMessage(channelId, incomingMessage, adapter, config).catch((err) => {
          logger.error("WhatsApp Web message processing failed", { channelId, error: String(err) });
        });
      }
    });

    if (sock.ws && typeof (sock.ws as unknown as { on?: unknown }).on === "function") {
      sock.ws.on("error", (err: Error) => {
        logger.error("WhatsApp WebSocket error", { tenantId, channelId, error: String(err) });
      });
    }
  }
}

// Singleton export
export const baileysManager = new BaileysManager();
