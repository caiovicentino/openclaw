export interface ITranscriptStore {
  append(tenantId: string, sessionKey: string, entry: TranscriptStoreEntry): Promise<void>;
  getTranscript(
    tenantId: string,
    sessionKey: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<TranscriptStoreEntry[]>;
  deleteTranscript(tenantId: string, sessionKey: string): Promise<void>;
  deleteOlderThan(tenantId: string, beforeDate: Date): Promise<number>;
}

export type TranscriptStoreEntry = {
  seqNum: number;
  entryType: string;
  role?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  tokensIn?: number;
  tokensOut?: number;
  createdAt?: Date;
};
