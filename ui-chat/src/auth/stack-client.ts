import { StackClientApp } from "@stackframe/stack";

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
