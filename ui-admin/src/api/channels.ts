import type { Channel, ChannelConfig, ChannelTestResult } from "./types";
import { client } from "./client";

interface ChannelsListResponse {
  channels: Channel[];
  total: number;
}

export async function getChannels(): Promise<ChannelsListResponse> {
  return client.get<ChannelsListResponse>("/channels");
}

export async function getChannel(id: string): Promise<Channel> {
  return client.get<Channel>(`/channels/${id}`);
}

export interface CreateChannelRequest {
  type: string;
  name: string;
  config?: Record<string, unknown>;
  capabilities?: string[];
}

export async function createChannel(data: CreateChannelRequest): Promise<Channel> {
  return client.post<Channel>("/channels", data);
}

export async function updateChannel(
  id: string,
  data: {
    name?: string;
    config?: Record<string, unknown>;
    status?: string;
    capabilities?: string[];
  },
): Promise<Channel> {
  return client.patch<Channel>(`/channels/${id}`, data);
}

export async function deleteChannel(id: string): Promise<void> {
  return client.delete<void>(`/channels/${id}`);
}

export async function connectChannel(id: string, config?: ChannelConfig): Promise<Channel> {
  return client.post<Channel>(`/channels/${id}/connect`, config ?? {});
}

export async function disconnectChannel(id: string): Promise<Channel> {
  return client.delete<Channel>(`/channels/${id}/disconnect`);
}

export async function testChannel(id: string): Promise<ChannelTestResult> {
  const res = await client.post<{ status: string; message: string; latencyMs: number }>(
    `/channels/${id}/test`,
  );
  return {
    success: res.status === "ok",
    message: res.message,
    latencyMs: res.latencyMs,
  };
}

// ── WhatsApp Web QR Flow ──────────────────────────────────────

export interface WhatsAppQrResponse {
  loginId: string;
  qrDataUrl: string | null;
  message: string;
}

export interface WhatsAppQrStatus {
  status: "waiting" | "connected" | "error" | "expired";
  message: string;
  phoneNumber?: string;
}

export async function startWhatsAppQr(channelId: string): Promise<WhatsAppQrResponse> {
  return client.post<WhatsAppQrResponse>(`/channels/${channelId}/qr`);
}

export async function getWhatsAppQrStatus(
  channelId: string,
  loginId: string,
): Promise<WhatsAppQrStatus> {
  return client.get<WhatsAppQrStatus>(`/channels/${channelId}/qr-status?loginId=${loginId}`);
}

export async function disconnectWhatsAppWeb(channelId: string): Promise<Channel> {
  return client.post<Channel>(`/channels/${channelId}/qr-disconnect`);
}
