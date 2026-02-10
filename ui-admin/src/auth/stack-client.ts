import { StackClientApp } from "@stackframe/stack";

export const stackApp = new StackClientApp({
  projectId: import.meta.env.VITE_STACK_AUTH_PROJECT_ID,
  publishableClientKey: import.meta.env.VITE_STACK_AUTH_PUBLISHABLE_KEY,
  tokenStore: "cookie",
});
