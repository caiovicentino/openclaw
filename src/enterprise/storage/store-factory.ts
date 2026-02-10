import type { IConfigStore } from "./config-store.js";
import type { ISessionStore } from "./session-store.js";
import type { ITranscriptStore } from "./transcript-store.js";
import { isEnterpriseMode } from "../mode.js";
import { PgConfigStore } from "./pg-config-store.js";
import { PgSessionStore } from "./pg-session-store.js";
import { PgTranscriptStore } from "./pg-transcript-store.js";
import { RedisSessionStore } from "./redis-session-store.js";

export function createSessionStore(): ISessionStore {
  if (isEnterpriseMode()) {
    const storeType = process.env.SESSION_STORE?.toLowerCase();
    if (storeType === "redis") {
      return new RedisSessionStore();
    }
    return new PgSessionStore();
  }
  throw new Error("No session store available in community mode");
}

export function createTranscriptStore(): ITranscriptStore {
  if (isEnterpriseMode()) {
    return new PgTranscriptStore();
  }
  throw new Error("No transcript store available in community mode");
}

export function createConfigStore(): IConfigStore {
  if (isEnterpriseMode()) {
    return new PgConfigStore();
  }
  throw new Error("No config store available in community mode");
}
