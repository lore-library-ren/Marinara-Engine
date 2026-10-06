import { normalizeTextForMatch } from "@marinara-engine/shared";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTTSConfig } from "../../hooks/use-tts";
import { useUIStore } from "../../stores/ui.store";
import { ttsService } from "../../lib/tts-service";
import { buildTTSVoiceRequests, withTTSVoiceRequestCacheKeys } from "../../lib/tts-dialogue";
import { MessageActionButton, MESSAGE_ACTION_ICON_SIZE } from "./MessageActionButton";

export function ConversationMessageTTS({
  message,
  name,
  charIdByName,
}: {
  message: { id: string; content: string; characterId?: string | null };
  name: string;
  charIdByName?: Map<string, string> | null;
}) {
  const { t } = useTranslation();
  const { data: config } = useTTSConfig();
  const volume = useUIStore((s) => s.ttsLineVolume) / 100;
  const [playback, setPlayback] = useState(() => ({ state: ttsService.getState(), id: ttsService.getActiveId() }));
  useEffect(() => ttsService.subscribe((state, id) => setPlayback({ state, id })), []);
  const requests = useMemo(
    () =>
      config
        ? withTTSVoiceRequestCacheKeys(
            buildTTSVoiceRequests(message.content, config, name, message.characterId, (speaker) =>
              speaker ? charIdByName?.get(normalizeTextForMatch(speaker)) : undefined,
            ),
            config,
            message.id,
          )
        : [],
    [config, message.content, message.characterId, message.id, name, charIdByName],
  );
  const active = playback.id === message.id;
  const loading = active && playback.state === "loading";
  const busy = ["loading", "playing", "paused", "blocked"].includes(playback.state);
  if (!config?.enabled) return null;
  return (
    <MessageActionButton
      icon={
        loading ? (
          <Loader2 size={MESSAGE_ACTION_ICON_SIZE} className="animate-spin" />
        ) : active ? (
          <MicOff size={MESSAGE_ACTION_ICON_SIZE} />
        ) : (
          <Mic size={MESSAGE_ACTION_ICON_SIZE} />
        )
      }
      title={t(
        active
          ? loading
            ? "ui.panels.ttsconfigcard.loading"
            : "ui.chat.chatmessage.stopSpeaking"
          : requests.length
            ? "ui.chat.chatmessage.speak"
            : "ui.chat.chatmessage.noDialogueToSpeak",
      )}
      disabled={(!active && !requests.length) || (busy && !active)}
      stopPropagation
      onClick={() => {
        const state = ttsService.getState();
        if (ttsService.getActiveId() === message.id) {
          ttsService.stop();
          return;
        }
        if (["loading", "playing", "paused", "blocked"].includes(state) || !requests.length) return;
        void ttsService.speakSequence(requests, message.id, { progressive: config.progressivePlayback, volume });
      }}
    />
  );
}
