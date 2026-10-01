import assert from "node:assert/strict";
import { createServer } from "node:http";
import Fastify from "../../packages/server/node_modules/fastify/fastify.js";
import { connectionsRoutes } from "../../packages/server/src/routes/connections.routes.js";
import { resolveGenerationProviderRuntime } from "../../packages/server/src/services/generation/provider-generation-runtime.js";
import { resolveModelAccessPolicy } from "../../packages/server/src/services/generation/model-access-policy.js";

const bodies: Record<string, unknown>[] = [];
const upstream = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  bodies.push(body);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }));
});
await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const address = upstream.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;
const defaults = {
  temperature: 1,
  topP: 0.85,
  topK: 33,
  minP: 0.05,
  frequencyPenalty: 0.2,
  presencePenalty: 0.3,
  maxTokens: 4096,
  reasoningEffort: "xhigh" as const,
  verbosity: "low" as const,
  stopSequences: ["END"],
  enabledParameters: { temperature: true, maxTokens: true, reasoningEffort: true },
};
const row = {
  id: "connection-defaults-regression",
  provider: "custom",
  model: "kimi-k2.5",
  baseUrl,
  apiKeyEncrypted: "",
  defaultParameters: JSON.stringify(defaults),
};
const app = Fastify();
// Keep storage in memory; exercise the real route, factory and HTTP serialization.
app.decorate("db", { select: () => ({ from: () => ({ where: async () => [row] }) }) } as never);
await app.register(connectionsRoutes);
try {
  const testMessage = () => app.inject({ method: "POST", url: `/${row.id}/test-message`, payload: {} });
  const result = await testMessage();
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().success, true, result.body);
  const expected = {
    temperature: 1,
    top_p: 0.85,
    top_k: 33,
    min_p: 0.05,
    frequency_penalty: 0.2,
    presence_penalty: 0.3,
    max_tokens: 4096,
    reasoning_effort: "xhigh",
    verbosity: "low",
    stop: ["END"],
  };
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(bodies.at(-1)?.[key], value, key);

  row.model = "unknown-roleplay-model";
  for (const effort of ["low", "medium", "high", "xhigh", "maximum"]) {
    row.defaultParameters = JSON.stringify({ ...defaults, reasoningEffort: effort });
    assert.equal((await testMessage()).json().success, true);
    assert.equal(bodies.at(-1)?.reasoning_effort, effort === "maximum" ? "max" : effort);
  }
  row.model = "kimi-k2.5";
  row.defaultParameters = JSON.stringify({
    ...defaults,
    enabledParameters: { temperature: false, reasoningEffort: false },
  });
  assert.equal((await testMessage()).json().success, true);
  assert.equal("temperature" in bodies.at(-1)!, false);
  assert.equal("reasoning_effort" in bodies.at(-1)!, false);

  row.defaultParameters = JSON.stringify({
    ...defaults,
    customParameters: { temperature: 0.9, reasoning_effort: "low" },
  });
  assert.equal((await testMessage()).json().success, true);
  assert.equal(bodies.at(-1)?.temperature, 0.9);
  assert.equal(bodies.at(-1)?.reasoning_effort, "low");

  // Chat-specific settings remain deliberate overrides; model and mode guesses do not.
  for (const model of ["kimi-k2.5", "gpt-5.6", "claude-opus-4-7", "claude-sonnet-4-5"]) {
    for (const chatMode of ["roleplay", "game"]) {
      const runtime = resolveGenerationProviderRuntime({
        connectionId: row.id,
        connection: { provider: "custom", model, apiKey: "", defaultParameters: defaults },
        baseUrl,
        chatMode,
        isSceneChat: true,
        chatParameters: { topP: 0.75 },
        managedParameterDefinitions: [],
        modelAccessPolicy: resolveModelAccessPolicy({ provider: "custom", model }),
        initial: {
          temperature: 0.7,
          maxTokens: 200,
          topP: 1,
          topK: 0,
          minP: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          showThoughts: true,
          reasoningEffort: null,
          verbosity: null,
          serviceTier: null,
          assistantPrefill: "",
          assistantReasoningPrefill: "",
          customThinkingTags: [],
          customParameters: {},
          enabledParameters: undefined,
          stopSequences: [],
          effectiveMaxContext: undefined,
        },
      });
      assert.equal(runtime.parameterSources.temperature, "connection");
      assert.equal(runtime.parameterSources.topP, "chat");
      assert.equal(runtime.parameterSources.maxTokens, "connection");
      assert.equal(runtime.temperature, 1);
      assert.equal(runtime.topP, 0.75);
      assert.equal(runtime.maxTokens, 4096);
      assert.equal(runtime.providerReasoningEffort, "xhigh");
      await runtime.provider.chatComplete([{ role: "user", content: "hi" }], {
        ...runtime,
        model,
        stream: false,
        reasoningEffort: runtime.providerReasoningEffort,
        verbosity: runtime.verbosity ?? undefined,
        topK: runtime.providerTopK,
      });
      assert.equal(bodies.at(-1)?.temperature, 1, model);
      assert.equal(bodies.at(-1)?.top_p, 0.75, model);
      assert.equal(bodies.at(-1)?.top_k, 33, model);
      assert.equal(bodies.at(-1)?.reasoning_effort, "xhigh", model);
    }
  }
  process.stdout.write("Connection defaults regression passed.\n");
} finally {
  await app.close();
  await new Promise<void>((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
}
