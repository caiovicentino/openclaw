import { StackClientApp } from "@stackframe/stack";

/**
 * Read Stack Auth config from runtime injection (window.__ENV__) first,
 * then fall back to Vite build-time env vars. This allows Railway to
 * inject values at container start without rebuilding the image.
 */
const runtimeEnv = (globalThis as any).__ENV__ ?? {};
const projectId =
  runtimeEnv.VITE_STACK_AUTH_PROJECT_ID || import.meta.env.VITE_STACK_AUTH_PROJECT_ID;
const publishableKey =
  runtimeEnv.VITE_STACK_AUTH_PUBLISHABLE_KEY || import.meta.env.VITE_STACK_AUTH_PUBLISHABLE_KEY;

if (!projectId || !publishableKey) {
  console.error(
    "[stack-auth] Missing configuration. Set VITE_STACK_AUTH_PROJECT_ID and VITE_STACK_AUTH_PUBLISHABLE_KEY.",
  );
}

export const stackApp = new StackClientApp({
  projectId: projectId ?? "",
  publishableClientKey: publishableKey ?? "",
  tokenStore: "cookie",
});
