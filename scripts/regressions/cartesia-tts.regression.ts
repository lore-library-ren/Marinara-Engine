import assert from "node:assert/strict";
import { createServer } from "node:http";
import Fastify from "../../packages/server/node_modules/fastify/fastify.js";
import { ttsConfigSchema, TTS_API_KEY_MASK } from "../../packages/shared/src/types/tts.js";
import { createConnectionSchema } from "../../packages/shared/src/schemas/connection.schema.js";
import {
  ttsRoutes,
  maskTTSConfigForResponse,
  prepareTTSConfigForStorage,
} from "../../packages/server/src/routes/tts.routes.ts";
import { connectionsRoutes } from "../../packages/server/src/routes/connections.routes.ts";
import { appSettings } from "../../packages/server/src/db/schema/app-settings.js";
import { encryptApiKey } from "../../packages/server/src/utils/crypto.js";
import {
  buildCartesiaSpeechRequest,
  fetchCartesiaVoiceOptions,
} from "../../packages/server/src/services/connections/cartesia-tts.ts";

process.env.TTS_LOCAL_URLS_ENABLED = "true";
process.env.PROVIDER_LOCAL_URLS_ENABLED = "true";
process.env.ENCRYPTION_KEY = "11".repeat(32);
const owned = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
const library = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b";
let mode = "ok";
const requests: Array<{ path: string; headers: Record<string, unknown>; body: any }> = [];
const wav = Buffer.alloc(46);
wav.write("RIFF", 0);
wav.writeUInt32LE(38, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(44100, 24);
wav.writeUInt32LE(88200, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(2, 40);
const upstream = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString();
  const url = new URL(req.url!, "http://localhost");
  requests.push({ path: req.url!, headers: req.headers, body: text ? JSON.parse(text) : null });
  if (mode === "error") {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return;
  }
  if (url.pathname === "/voices") {
    const page2 = url.searchParams.has("starting_after");
    const voice = page2
      ? { id: owned, name: "Z Owned", is_owner: true, gender: "masculine" }
      : { id: library, name: "A Library", is_owner: false, gender: "feminine" };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [voice], has_more: !page2 || mode === "repeat", next_page: "cursor-page-2" }));
  } else if (url.pathname === "/tts/bytes") {
    res.writeHead(200, {
      "content-type":
        mode === "json" ? "application/json" : mode === "binary" ? "application/octet-stream" : "audio/wav",
    });
    res.end(mode === "json" ? '{"error":"no audio"}' : wav);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const address = upstream.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;
let config = ttsConfigSchema.parse({
  enabled: true,
  source: "cartesia",
  baseUrl,
  model: "sonic-3.6",
  voice: owned,
  apiKey: encryptApiKey("test-cartesia-key"),
  speed: 4,
});
const row = {
  id: "cartesia-connection",
  provider: "audio",
  audioSource: "cartesia",
  baseUrl,
  model: "sonic-3.6",
  audioVoice: owned,
  apiKeyEncrypted: encryptApiKey("test-cartesia-key"),
};
const db = {
  select: () => ({
    from: (table: unknown) => ({
      where: async () => (table === appSettings ? [{ value: JSON.stringify(config) }] : [row]),
    }),
  }),
};
const app = Fastify();
app.decorate("db", db as never);
await app.register(ttsRoutes, { prefix: "/tts" });
await app.register(connectionsRoutes, { prefix: "/connections" });
try {
  assert.equal(
    createConnectionSchema.parse({ name: "Cartesia", provider: "audio", audioSource: "cartesia" }).audioSource,
    "cartesia",
  );
  for (const [speed, expected] of [
    [0.25, 0.6],
    [1, 1],
    [4, 1.5],
  ])
    assert.equal(
      buildCartesiaSpeechRequest({ text: "Hello", voice: owned, model: "", speed }).generation_config.speed,
      expected,
    );
  assert.throws(() => buildCartesiaSpeechRequest({ text: "Hello", voice: "alloy", model: "", speed: 1 }));
  const masked = maskTTSConfigForResponse(config);
  assert.equal(masked.apiKey, TTS_API_KEY_MASK);
  assert.equal(masked.sourceProfiles.cartesia?.apiKey, TTS_API_KEY_MASK);
  assert.equal(prepareTTSConfigForStorage(masked, config).sourceProfiles.cartesia?.apiKey, config.apiKey);
  const voices = await app.inject({ method: "GET", url: "/tts/voices?connectionId=cartesia-connection" });
  assert.equal(voices.statusCode, 200, voices.body);
  assert.deepEqual(voices.json().voices, [owned, library]);
  assert.equal(voices.json().voiceOptions[0].category, "cartesia-owned");
  assert.equal(voices.json().voiceOptions[0].labels.gender, "male");
  assert.equal(requests[0].path, "/voices?limit=100");
  assert.equal(requests[1].path, "/voices?limit=100&starting_after=cursor-page-2");
  const speak = (voice = library, audioConnectionId = row.id) =>
    app.inject({
      method: "POST",
      url: "/tts/speak",
      payload: { text: "Hello from Marinara.", voice, audioConnectionId },
    });
  let audio = await speak();
  assert.equal(audio.statusCode, 200, audio.body);
  assert.equal(audio.headers["content-type"], "audio/wav");
  assert.deepEqual(audio.rawPayload, wav);
  assert.deepEqual(requests.at(-1)?.body, {
    model_id: "sonic-3.6",
    transcript: "Hello from Marinara.",
    voice: { id: library },
    output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
    generation_config: { speed: 1.5 },
  });
  mode = "binary";
  audio = await speak();
  assert.equal(audio.statusCode, 200);
  assert.match(String(audio.headers["content-type"]), /wav/);
  mode = "json";
  assert.equal((await speak()).statusCode, 502);
  mode = "error";
  const error = await speak();
  assert.equal(error.statusCode, 502);
  assert.match(error.body, /401/);
  assert.equal((await app.inject({ url: "/tts/voices" })).statusCode, 502);
  mode = "repeat";
  await assert.rejects(fetchCartesiaVoiceOptions(baseUrl, "test-cartesia-key"), /repeated cursor/);
  mode = "ok";
  const before = requests.length;
  assert.equal((await speak("alloy")).statusCode, 400);
  assert.equal(requests.length, before);
  config = { ...config, apiKey: "" };
  assert.equal((await speak(owned, "")).statusCode, 400);
  config = { ...config, apiKey: encryptApiKey("test-cartesia-key"), enabled: false };
  assert.equal((await speak(owned, "")).statusCode, 400);
  assert.equal((await speak()).statusCode, 200);
  const test = await app.inject({ method: "POST", url: `/connections/${row.id}/test`, payload: {} });
  assert.equal(test.json().success, true, test.body);
  assert.equal(requests.at(-1)?.path, "/voices?limit=1");
  const models = await app.inject({ url: `/connections/${row.id}/models` });
  assert.equal(models.json().models[0].id, "sonic-3.6");
  for (const request of requests) {
    assert.equal(request.headers.authorization, "Bearer test-cartesia-key");
    assert.equal(request.headers["cartesia-version"], "2026-08-14");
    assert.equal(request.headers["xi-api-key"], undefined);
  }
  console.log(
    "Cartesia TTS regression passed: voices, pagination, encrypted profiles, connection checks, synthesis, WAV and errors.",
  );
} finally {
  await app.close();
  await new Promise<void>((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
}
