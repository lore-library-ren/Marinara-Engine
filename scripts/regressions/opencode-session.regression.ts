import { completeAgentCall } from "../../packages/server/src/services/agents/agent-progress.js";
import { connectionsRoutes } from "../../packages/server/src/routes/connections.routes.js";
import { encryptApiKey } from "../../packages/server/src/utils/crypto.js";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import Fastify from "../../packages/server/node_modules/fastify/fastify.js";
import { OpenAIProvider } from "../../packages/server/src/services/llm/providers/openai.provider.js";
import { withConversationContext } from "../../packages/server/src/services/llm/conversation-context.js";
import { withRateLimitAwareProvider } from "../../packages/server/src/services/llm/rate-limit-aware-provider.js";
import { withConnectionDefaultParameters } from "../../packages/server/src/services/llm/connection-default-provider.js";
import { safeFetch } from "../../packages/server/src/utils/security.js";
import type { BaseLLMProvider, ChatOptions } from "../../packages/server/src/services/llm/base-provider.js";

const seen: Array<{ session?: string; agent?: string; auth?: string; extra?: string; path?: string; body: any }> = [];
let failOnce = false;
const upstream = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  seen.push({
    session: req.headers["x-opencode-session"] as string | undefined,
    agent: req.headers["user-agent"],
    auth: req.headers.authorization,
    extra: req.headers["x-test"] as string | undefined,
    path: req.url,
    body,
  });
  if (req.url === "/redirect") {
    res.writeHead(302, { location: `http://localhost:${(upstream.address() as { port: number }).port}/outside` }).end();
  } else if (failOnce) {
    failOnce = false;
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "0" }).end('{"error":{"message":"retry"}}');
  } else if (req.url?.endsWith("/responses")) {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
      }),
    );
  } else if (body.stream) {
    res
      .writeHead(200, { "Content-Type": "text/event-stream" })
      .end('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: [DONE]\n\n');
  } else {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }));
  }
});
await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const address = upstream.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const provider = new OpenAIProvider(`${origin}/v1`, "test-key", undefined, null, null, "custom");
const messages = [{ role: "user" as const, content: "hi" }];
async function stream(p: BaseLLMProvider, options: ChatOptions) {
  for await (const _chunk of p.chat(messages, options)) {
    /* drain */
  }
}
process.env.ENCRYPTION_KEY = "11".repeat(32);
const connectionRow = {
  id: "session-test",
  provider: "custom",
  model: "kimi-2.6",
  baseUrl: origin + "/v1",
  apiKeyEncrypted: encryptApiKey("test-key"),
  defaultParameters: "{}",
};
const app = Fastify();
app.decorate("db", { select: () => ({ from: () => ({ where: async () => [connectionRow] }) }) } as never);
await app.register(connectionsRoutes, { prefix: "/connections" });
app.addHook("preHandler", (req, _reply, done) => withConversationContext(req, done));
app.post("/game/:chatId", async () => {
  await stream(provider, { model: "kimi-2.6", stream: true });
  await provider.chatComplete(messages, { model: "kimi-2.6", stream: false });
  return { ok: true };
});
try {
  const a: ChatOptions = { model: "kimi-2.6", conversationId: "chat-a", stream: true };
  await stream(provider, a);
  await provider.chatComplete(messages, { ...a, stream: false });
  await new OpenAIProvider(`${origin}/v1`, "test-key").chatComplete(messages, { ...a, stream: false });
  assert.deepEqual(
    seen.map((r) => r.session),
    ["chat-a", "chat-a", "chat-a"],
  );
  await Promise.all(["chat-a", "chat-b"].map((conversationId) => stream(provider, { ...a, conversationId })));
  assert.deepEqual(
    seen
      .slice(-2)
      .map((r) => r.session)
      .sort(),
    ["chat-a", "chat-b"],
  );
  assert.equal(a.conversationId, "chat-a");
  assert.match(seen[0].agent!, /^Marinara-Engine\//);
  assert.equal(seen[0].auth, "Bearer test-key");
  const configured = new OpenAIProvider(`${origin}/v1`, "test-key", undefined, null, null, "custom", {
    "X-OpenCode-Session": "configured-session",
    "uSeR-aGeNt": "My-Marinara/1.0",
    "X-Test": "kept",
  });
  await stream(configured, a);
  await configured.chatComplete(messages, { ...a, stream: false });
  assert(
    seen
      .slice(-2)
      .every((r) => r.session === "configured-session" && r.agent === "My-Marinara/1.0" && r.extra === "kept"),
  );
  const defaults = withConnectionDefaultParameters(provider, { customParameters: { temperature: 1, top_p: 0.95 } });
  const retrying = withRateLimitAwareProvider(defaults, "session-regression");
  for (const useStream of [true, false]) {
    failOnce = true;
    if (useStream) await stream(retrying, a);
    else await retrying.chatComplete(messages, { ...a, stream: false });
    assert(seen.slice(-2).every((r) => r.session === "chat-a" && r.body.temperature === 1 && r.body.top_p === 0.95));
  }
  await provider.chatComplete(
    [
      ...messages,
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{}" } }],
      },
      { role: "tool", content: "found", tool_call_id: "call-1" },
    ],
    { ...a, stream: false },
  );
  assert.equal(seen.at(-1)!.session, "chat-a");
  const responses = new OpenAIProvider(`${origin}/v1`, "test-key");
  await stream(responses, { ...a, model: "gpt-5.4", stream: false });
  await responses.chatComplete(messages, { ...a, model: "gpt-5.4", stream: false });
  assert(seen.slice(-2).every((r) => r.path === "/v1/responses" && r.session === "chat-a"));
  for (const chatId of ["chat-a", "chat-b", "chat-a"]) {
    const result = await app.inject({ method: "POST", url: `/game/${chatId}` });
    assert.equal(result.statusCode, 200, result.body);
    assert(seen.slice(-2).every((r) => r.session === chatId));
  }
  await withConversationContext({ body: { chatId: "outer-chat" } }, () =>
    provider.chatComplete(messages, { ...a, stream: false }),
  );
  assert.equal(seen.at(-1)!.session, "chat-a", "explicit option takes precedence over inherited context");
  await withConversationContext({ body: { chatId: "outer-chat" } }, () =>
    withConversationContext({}, () => provider.chatComplete(messages, { model: "kimi-2.6", stream: false })),
  );
  assert.equal(seen.at(-1)!.session, undefined, "a separate context without a chat must not inherit a session");
  await provider.chatComplete(messages, { model: "kimi-2.6", stream: false });
  await stream(provider, { model: "kimi-2.6", stream: true });
  assert(
    seen.slice(-2).every((r) => r.session === undefined),
    "no global or random fallback for standalone calls",
  );
  await (
    await safeFetch(`${origin}/redirect`, {
      headers: { "x-opencode-session": "chat-a" },
      policy: { allowLoopback: true, allowedProtocols: ["http:"] },
    })
  ).text();
  assert.equal(seen.at(-2)!.session, "chat-a");
  assert.equal(seen.at(-1)!.session, undefined, "session headers do not leak across origins");
  for (const progress of [undefined, () => {}]) {
    await completeAgentCall({ chatId: "agent-chat", agentProgress: progress } as any, [], provider, messages, {
      model: "kimi-2.6",
      stream: false,
    });
    assert.equal(seen.at(-1)!.session, "agent-chat", "agents retain chat identity with and without progress reporting");
  }
  for (const chatId of [undefined, undefined, "diagnostic-chat"]) {
    const result = await app.inject({
      method: "POST",
      url: "/connections/session-test/test-message",
      payload: chatId ? { chatId } : {},
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(seen.at(-1)!.session, chatId ?? "marinara-connection-test:session-test");
  }
  console.info("OpenCode conversation session regression passed");
} finally {
  await app.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
}
