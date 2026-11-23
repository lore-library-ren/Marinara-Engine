import assert from "node:assert/strict";
import { ttsConfigSchema, ttsSourceProfileFromConfig } from "../../packages/shared/src/types/tts.ts";
import {
  buildTTSVoiceRequests,
  getTTSUserIdentity,
  withTTSVoiceRequestCacheKeys,
} from "../../packages/client/src/lib/tts-dialogue.ts";
const config = ttsConfigSchema.parse({
  source: "cartesia",
  voice: "default",
  voiceMode: "per-character",
  dialogueOnly: false,
  voiceAssignments: [{ characterId: "character", characterName: "Same", voice: "character-voice" }],
  personaVoiceAssignments: [{ personaId: "old-persona", voice: "persona-voice" }],
});
const speak = (id?: string | null, name = "Same") =>
  buildTTSVoiceRequests("Hello Lolo.", config, name, "character", () => "character", id);
assert.equal(speak("old-persona")[0].voice, "persona-voice");
assert.equal(speak("missing")[0].voice, "default");
assert.equal(speak(null)[0].voice, "default");
assert.equal(speak()[0].voice, "character-voice");
assert.equal(speak("old-persona", "Renamed")[0].voice, "persona-voice");
const identity = getTTSUserIdentity(JSON.stringify({ personaSnapshot: { personaId: "old-persona", name: "Same" } }), {
  id: "new-persona",
  name: "New",
});
assert.equal(identity.id, "old-persona");
assert.equal(getTTSUserIdentity({}, { id: "new-persona", name: "New" }).id, "new-persona");
assert.equal(
  getTTSUserIdentity({ personaSnapshot: { personaId: "character", source: "character" } }).source,
  "character",
);
assert.deepEqual(ttsSourceProfileFromConfig(config).personaVoiceAssignments, config.personaVoiceAssignments);
assert.deepEqual(ttsConfigSchema.parse({}).personaVoiceAssignments, []);
assert.equal(
  buildTTSVoiceRequests("Hello", { ...config, voiceMode: "single" }, "Same", null, undefined, "old-persona")[0].voice,
  "default",
);
const changed = { ...config, personaVoiceAssignments: [{ personaId: "old-persona", voice: "new-voice" }] };
assert.notDeepEqual(
  withTTSVoiceRequestCacheKeys(speak("old-persona"), config, "message"),
  withTTSVoiceRequestCacheKeys(speak("old-persona"), changed, "message"),
);
console.log("Persona TTS regression passed: identity, fallback, rename, collision, profiles, and cache.");
