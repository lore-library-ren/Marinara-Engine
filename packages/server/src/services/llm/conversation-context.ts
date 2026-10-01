import { AsyncLocalStorage } from "node:async_hooks";

const conversationContext = new AsyncLocalStorage<string | undefined>();

function chatIdFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const chatId = (value as Record<string, unknown>).chatId;
  return typeof chatId === "string" && chatId.trim() ? chatId : undefined;
}

/** Preserve the real chat ID for nested request work that does not expose ChatOptions. */
export function withConversationContext<T>(request: { params?: unknown; body?: unknown }, operation: () => T): T {
  return conversationContext.run(chatIdFrom(request.params) ?? chatIdFrom(request.body), operation);
}

/** No generated identity: independent/background callers must supply their persistent chat ID. */
export function getCurrentConversationId(): string | undefined {
  return conversationContext.getStore();
}
