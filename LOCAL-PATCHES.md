# Local Marinara restoration (2.4.6)

The installed branch is `local/cartesia-2.4.6` in https://github.com/lore-library-ren/Marinara-Engine, based on upstream commit `12a0acd5b`.

Preserve these changes on future updates:

- Native Cartesia Audio/TTS, Sonic 3.6, owned-voice discovery, and WAV output (commit `b4d041b0a`). Credentials and voice selections remain in local storage, outside Git.
- OpenCode conversation identity, adapted from `5718f783d` on `fix/local-opencode-session`. Main chat, agents, summaries, and nested requests retain the persistent chat ID. Explicit session headers take precedence; cross-origin redirects strip the session header. Connection diagnostics without a chat use `marinara-connection-test:<connection-id>`; ordinary independent calls do not invent a session.

The original `fix/local-opencode-session` branch remains intact, including its separate custom-provider parameter fixes. Its custom-provider settings fix is now adapted on this branch too: saved connection settings override Game/Scene defaults, chat settings override connection defaults, and explicit raw custom parameters win last. Built-in provider rules and newer native/remote GLM compatibility remain in place. Unrelated UI feature branches have not been ported.

Automatic Engine updates are disabled in this installation's local `.env`. Before a deliberate upstream update, back up local data and `.env`, preserve this branch, and port both fixes onto the intended release. Do not replace this branch with upstream or blindly run the older branch's rebase instructions. Keep personal data and credentials out of Git.

Validation: build, lint, OpenCode session regression (including connection diagnostics and agent progress paths), and Cartesia regression. The repository-wide check is currently blocked by pre-existing formatting issues; this is not a full-check pass. A real Cartesia sample was generated after its restoration; OpenCode provider behavior is covered by the mock HTTP regression, with live testing reported separately.
