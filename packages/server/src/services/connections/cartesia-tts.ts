import { z } from "zod";
import type { TTSVoicesResponse } from "@marinara-engine/shared";
import { isTtsLocalUrlsEnabled } from "../../config/runtime-config.js";
import { safeFetch } from "../../utils/security.js";

// Keep the wire contract pinned together; verified against Cartesia's current REST API.
export const CARTESIA_API_VERSION = "2026-08-14";
export const CARTESIA_DEFAULT_MODEL = "sonic-3.6";
export const cartesiaVoiceIdSchema = z.string().uuid();

export function cartesiaHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Cartesia-Version": CARTESIA_API_VERSION,
    "Content-Type": "application/json",
  };
}

export function buildCartesiaSpeechRequest(input: { text: string; model: string; voice: string; speed: number }) {
  // Provider-specific transcript/emotion translation can be added here without changing playback callers.
  return {
    model_id: input.model.trim() || CARTESIA_DEFAULT_MODEL,
    transcript: input.text,
    voice: { id: cartesiaVoiceIdSchema.parse(input.voice.trim()) },
    output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44_100 },
    generation_config: { speed: Math.min(1.5, Math.max(0.6, input.speed)) },
  };
}

const voicePageSchema = z.object({
  data: z.array(
    z.object({
      id: cartesiaVoiceIdSchema,
      name: z.string(),
      description: z.string().nullish(),
      is_owner: z.boolean(),
      gender: z.string().nullish(),
      language: z.string().nullish(),
    }),
  ),
  has_more: z.boolean(),
  next_page: z.string().nullish(),
});

export async function fetchCartesiaVoiceOptions(
  baseUrl: string,
  apiKey: string,
): Promise<NonNullable<TTSVoicesResponse["voiceOptions"]>> {
  const voices = new Map<string, NonNullable<TTSVoicesResponse["voiceOptions"]>[number]>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  const signal = AbortSignal.timeout(30_000);
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}/voices`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    const response = await safeFetch(url, {
      headers: cartesiaHeaders(apiKey),
      signal,
      policy: {
        allowLocal: isTtsLocalUrlsEnabled(),
        allowedProtocols: ["https:", "http:"],
        flagName: "TTS_LOCAL_URLS_ENABLED",
      },
      maxResponseBytes: 2 * 1024 * 1024,
      decodeCompressedResponse: true,
    });
    if (!response.ok)
      throw new Error(`Cartesia voices request failed (${response.status}). Check your API key and voice access.`);
    const result = voicePageSchema.parse(await response.json());
    for (const voice of result.data) {
      voices.set(voice.id, {
        id: voice.id,
        name: voice.name,
        description: voice.description,
        category: voice.is_owner ? "cartesia-owned" : "cartesia-library",
        labels: {
          is_owner: voice.is_owner,
          gender:
            voice.gender === "masculine" ? "male" : voice.gender === "feminine" ? "female" : (voice.gender ?? null),
          language: voice.language ?? null,
        },
      });
    }
    if (!result.has_more)
      return [...voices.values()].sort(
        (a, b) => Number(b.labels?.is_owner) - Number(a.labels?.is_owner) || a.name.localeCompare(b.name),
      );
    const next = result.next_page || result.data.at(-1)?.id;
    if (!next || cursors.has(next)) throw new Error("Cartesia voices pagination returned a missing or repeated cursor");
    cursors.add(next);
    cursor = next;
  }
  throw new Error("Cartesia voice discovery exceeded 100 pages");
}
