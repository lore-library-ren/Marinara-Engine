# Local Marinara patch stack

This installation maintains local changes on `fix/local-opencode-session` rather than modifying the upstream remote. No patches have been submitted or pushed. The starting release is Marinara 2.4.4, upstream commit `1a299369a`. The local `local-upstream-base` tag records the upstream base of the patch stack.

## Changes to preserve

1. **Custom provider configuration** (`85a7f538c`): honor explicit reasoning/sampling settings and saved connection defaults without inferring restrictions from custom model names.
2. **Conversation session identity**: `ChatOptions.conversationId` carries the persistent chat ID through main generation, tool loops, agent calls, summaries, and related generation. Nested HTTP work can inherit the real parent chat ID through AsyncLocalStorage. OpenAI-compatible headers preserve explicitly configured session and User-Agent values. There is no random/global session fallback or mutable session field on provider instances. Cross-origin redirects strip the session header.

The earlier `OPENCODE_SESSION_BASE_URLS` workaround has been removed. No gateway allowlist environment setting is required. Session identity is an HTTP header, not a Custom Parameters body option.

Standalone calls without a conversation must omit the header unless one was explicitly configured. Consequently, a connection test without a chat ID may be rejected by providers that require sessions. For a chat-scoped diagnostic, send a persistent `chatId` to `/api/connections/:id/test-message` or `/api/generate/raw`; do not use the connection ID, run ID, or a random UUID as a conversation substitute. Background code outside the request lifecycle should pass `conversationId` in its ChatOptions. Capability language-model calls also accept that option.

## Updating from upstream

Keep the installed release as the base for this local maintenance branch. An eventual upstream contribution should be adapted to `staging` according to CONTRIBUTING.md.

Stop Marinara before updating. Ensure `git status --short` shows no uncommitted source changes, and back up `.env` and the server data directory separately; Git does not store secrets or conversations. Then, from the repository root in PowerShell:

```powershell
$backupBranch = 'backup/local-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
git branch $backupBranch
git fetch origin
git rebase --onto origin/main local-upstream-base fix/local-opencode-session
```

Resolve conflicts by preserving the behavior described above. If the integration is unsuitable, `git rebase --abort` returns to the original stack while the rebase is in progress. Do not force an automatic conflict resolution. After resolving, validate before starting the server:

```powershell
npx --yes pnpm@10.34.5 install --frozen-lockfile
node scripts/run-regressions.mjs --filter scripts/regressions/opencode-session.regression.ts
node scripts/run-regressions.mjs --filter scripts/regressions/provider-compat.regression.ts
node scripts/run-regressions.mjs --filter scripts/regressions/connection-defaults.regression.ts
node scripts/run-regressions.mjs --filter scripts/regressions/conversation-summary.regression.ts
npx --yes pnpm@10.34.5 check
```

Use the package-manager version pinned by the new upstream release if it changes. If the broad check is blocked by unrelated baseline failures, record the failure and run targeted lint/build checks; do not silently treat the full check as passed. Once integration and validation succeed, update the base marker:

```powershell
git tag -f local-upstream-base origin/main
```

Run the local build with `start-local.bat`. The ordinary launcher includes an auto-update flow, so use the local launcher when preserving this patch stack. Only start one server against the data directory.

Export refreshed patches with `git format-patch local-upstream-base..HEAD -o <output-directory>`. A bundle of that same range can also transfer the commits to another clone that already contains the upstream base. Avoid `git add .` for personal environment backups; this checkout's `.git/info/exclude` ignores `.env.before-*` files.
