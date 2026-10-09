# Local Marinara fork (2.5.0)

The installed branch is `local/cartesia-2.4.6` in https://github.com/lore-library-ren/Marinara-Engine, updated by merging upstream `c56501495` (2.5.0) while retaining the local patch history. The branch name is kept for compatibility.

Preserve these changes on future updates:

- Manual Conversation speak/stop controls and the one-shot Add spice rewrite action.
- Native Cartesia Audio/TTS, Sonic 3.6, owned-voice discovery, and WAV output (commit `b4d041b0a`). Credentials and voice selections remain in local storage, outside Git.
- OpenCode conversation identity, adapted from `5718f783d` on `fix/local-opencode-session`. Main chat, agents, summaries, and nested requests retain the persistent chat ID. Explicit session headers take precedence; cross-origin redirects strip the session header. Connection diagnostics without a chat use `marinara-connection-test:<connection-id>`; ordinary independent calls do not invent a session.

The original `fix/local-opencode-session` branch remains intact, including its separate custom-provider parameter fixes. Its custom-provider settings fix is now adapted on this branch too: saved connection settings override Game/Scene defaults, chat settings override connection defaults, and explicit raw custom parameters win last. Built-in provider rules and newer native/remote GLM compatibility remain in place. Unrelated UI feature branches have not been ported.

Automatic Engine updates are disabled in this installation's local `.env`. Before a deliberate upstream update, back up local data and `.env`, preserve this branch, and merge the intended stable release while preserving all listed fixes. Do not replace this branch with upstream or blindly run the older branch's rebase instructions. Keep personal data and credentials out of Git.

The 2.5.0 merge retains explicit OpenCode headers and real chat IDs instead of upstream request-generated sessions. Custom endpoints retain their configured sampling/reasoning choices, including raw overrides. Shared ChatOptions now carries conversationId following upstream type extraction.

Validation for the 2.5.0 merge: full `pnpm check` passed (localization, formatting, lint/type checks and production build). Eleven focused regression suites passed: Cartesia TTS, OpenCode sessions, connection defaults, provider compatibility, Conversation TTS actions, Game generation parameters, Game satellite connection parameters, agent activation, generation replay, TTS source persistence and TTS voice assignment. Live external provider generation is separate from these mock/local checks.
