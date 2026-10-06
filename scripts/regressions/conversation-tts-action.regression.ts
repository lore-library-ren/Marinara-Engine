import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { ttsConfigSchema } from "../../packages/shared/src/types/tts.js";

const state = {
  config: ttsConfigSchema.parse({ enabled: true, source: "cartesia", voice: "voice-default", dialogueOnly: false }),
  active: null as string | null,
  playback: "idle",
  calls: [] as any[],
  stopped: 0,
};
(globalThis as any).__conversationTtsTest = state;
const mocks: Record<string, string> = {
  react: "export const useEffect=()=>{}; export const useMemo=f=>f(); export const useState=f=>[f(),()=>{}];",
  "react/jsx-runtime": "export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;",
  "lucide-react": 'export const Loader2="loading", Mic="speak", MicOff="stop";',
  "react-i18next": "export const useTranslation=()=>({t:k=>k});",
  "../../hooks/use-tts": "export const useTTSConfig=()=>({data:globalThis.__conversationTtsTest.config});",
  "../../stores/ui.store": "export const useUIStore=f=>f({ttsLineVolume:70});",
  "../../lib/tts-service": `const s=globalThis.__conversationTtsTest; export const ttsService={ getState:()=>s.playback, getActiveId:()=>s.active, subscribe:()=>()=>{}, stop:()=>s.stopped++, speakSequence:(...args)=>s.calls.push(args) };`,
  "./MessageActionButton": 'export const MessageActionButton="button", MESSAGE_ACTION_ICON_SIZE="1em";',
};
const compiled = await build({
  entryPoints: [
    fileURLToPath(new URL("../../packages/client/src/components/chat/ConversationMessageTTS.tsx", import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  plugins: [
    {
      name: "mock-controls",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (a.path in mocks ? { path: a.path, namespace: "mock" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: mocks[a.path], loader: "js" }));
      },
    },
  ],
});
const { ConversationMessageTTS } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0]!.text).toString("base64")
);
const props = { message: { id: "message-one", content: "Hello there.", characterId: "caleb" }, name: "Caleb" };
let button = ConversationMessageTTS(props);
assert.equal(button.props.title, "ui.chat.chatmessage.speak");
assert.equal(button.props.disabled, false);
button.props.onClick();
assert.equal(state.calls.length, 1);
assert.equal(state.calls[0][0][0].text, "Hello there.");
assert.equal(state.calls[0][1], "message-one");
assert.equal(state.calls[0][2].volume, 0.7);
state.active = "other-message";
state.playback = "playing";
button.props.onClick();
assert.equal(state.calls.length, 1, "stale click cannot interrupt another message");
assert.equal(ConversationMessageTTS(props).props.disabled, true);
state.active = "message-one";
button = ConversationMessageTTS(props);
assert.equal(button.props.title, "ui.chat.chatmessage.stopSpeaking");
button.props.onClick();
assert.equal(state.stopped, 1);
state.active = null;
state.playback = "idle";
assert.equal(ConversationMessageTTS({ ...props, message: { ...props.message, content: "" } }).props.disabled, true);
state.config.voiceMode = "per-character";
state.config.voiceAssignments = [
  { characterId: "caleb", characterName: "Caleb", voice: "caleb-voice" },
  { characterId: "friend", characterName: "Friend", voice: "friend-voice" },
];
const grouped = ConversationMessageTTS({
  ...props,
  message: { ...props.message, content: '<speaker="Caleb">Hello.</speaker><speaker="Friend">Hi.</speaker>' },
  charIdByName: new Map([
    ["caleb", "caleb"],
    ["friend", "friend"],
  ]),
});
grouped.props.onClick();
assert.deepEqual(
  state.calls.at(-1)[0].map((r: any) => r.voice),
  ["caleb-voice", "friend-voice"],
);
state.config.enabled = false;
assert.equal(ConversationMessageTTS(props), null);
delete (globalThis as any).__conversationTtsTest;
console.info("Conversation TTS action regression passed.");
