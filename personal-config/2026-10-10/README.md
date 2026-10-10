# Sanitized Marinara connection settings — 2026-10-10

Personal reference snapshot for the maintained fork. No application code changes.

- `connections-sanitized.json`: 18 named connections, public provider endpoints, models, limits, routing flags, and allowlisted generation parameters.
- `local-ai-sanitized.json`: local runtime/model settings and global Decision Model selection.

## Privacy and scope

Exported using an explicit field allowlist. API keys, encrypted credentials, management tokens, headers, credential references, connection IDs, image paths, local model paths, private network addresses, URL query strings, custom prompts, embedded workflows, and unrestricted custom payloads are excluded. Allowed raw parameters are sampling controls, output limits, and reasoning effort. Public provider endpoint paths and connection names are intentionally included.

These are JSON reference backups, **not native Marinara import envelopes**. They are not complete disaster-recovery backups: keep the full application-data backup privately. Chats, characters, presets, agents, audio voice assignments, workflow definitions, and per-chat routing are not included.

## Restore manually

1. Create each required connection through Marinara's Connections editor, using its name, provider, model, and public base URL. Replace `REENTER_PRIVATE_ENDPOINT` with the original local address.
2. Enter credentials privately. Re-select audio voices, image workflows, and other excluded provider-specific resources from the private backup.
3. Copy normal generation settings from `defaultParameters`. Add each `customParameters` item as its own name/value row; numeric values must remain numbers. Reapply the parameter enable switches and desired default/fallback roles.
4. In Local AI Model, select/download the listed model and apply the saved runtime/helper settings. Do not paste a filename into a public API connection.
5. Select the primary local model in the global Decision Model control. Advanced Memory has separate per-chat decision configuration; this export does not enable it or replace the general agent connection.
6. Test connections and a representative real helper call before relying on the restored configuration.

## Local-model changes applied

- Global Decision Model: unselected -> primary local Gemma 4 E2B Q8.
- General helper temperature: 0.3 -> 0.1.
- General helper maximum output: 4096 -> 2048.
- Kept Auto decision thinking, 8192 context per request, two parallel jobs, NVIDIA runtime, automatic GPU offload, F16 KV cache, native tool calls, and existing tracker/game usage.
- Kept local model as general agent default disabled. General agent connections were not rerouted.

The direct-answer test passed after saving; this is a transport/format check, not a calibrated accuracy benchmark. Real roleplay decision quality still needs observation. Dedicated decision requests use their own temperature/output settings.
