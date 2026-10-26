# Setup

This package uses Python 3.9+, OpenSSH and an existing T3 server with the
`thread start`, `thread show`, `thread send` and `thread list` CLI commands on
each environment. It introduces no public listener or background network service.
The stdio MCP server starts when the agent starts it. Each peer must be awake,
reachable and authenticated with its own provider account.

## Configure SSH first

Create a dedicated SSH key and host alias for each required direction. Configure
host-key verification before enabling unattended use. Keep private keys, hostnames,
addresses and account details in your private SSH configuration, outside this repo.
The bridge uses `BatchMode=yes` and `StrictHostKeyChecking=yes`; it cannot answer
password prompts or accept unknown host keys. Use the account that owns the remote
T3 installation rather than an unrelated administrative account.

Confirm the alias can run the remote T3 CLI without a password. Limit key access
to the intended network source and disable unnecessary forwarding/PTY access when
appropriate. Remote command execution is required. The bridge runs with that SSH
account's existing permissions; task instructions are not an operating-system sandbox.

## Install on each environment

Copy [config.example.json](config.example.json) to a private location and replace
all placeholders. `machine` is a local label. `peers` maps arbitrary destination
labels to SSH aliases and absolute remote executable/script paths. `default_project`
is the local T3 project path or registered ID. Reverse the configuration on the
other environment; each peer's script path must point to its installed runtime.
Do not commit the edited configuration or use secrets as tool-visible labels.

From this skill's directory, run as the agent account:

```sh
python3 scripts/install.py --config /path/to/private/bridge-config.json
```

The installer copies the runtime and this skill into the current user's Codex and
Claude skill directories. It creates `~/.config/t3-agent-bridge/config.json` with
mode 600. For subsequent updates, omit `--config`; existing configuration is
preserved. Review existing skill contents before replacing them with an update.

Register the runtime with the providers you use:

```sh
codex mcp add remote-agent-bridge -- /absolute/path/to/python3 "$HOME/.local/share/t3-agent-bridge/bridge.py"
claude mcp add --scope user remote-agent-bridge -- /absolute/path/to/python3 "$HOME/.local/share/t3-agent-bridge/bridge.py"
```

Replace the Python executable placeholder. This registers an MCP server; it does
not install, update or restart T3. Reconnect or start new agent sessions to load
new MCP registrations and skills. No credentials belong in these commands.

## Tools

| Tool | Arguments | Result |
|---|---|---|
| `remote_agent_targets` | none | Local label and configured destination names |
| `remote_agent_status` | destination | Remote platform, T3 connectivity, default project and artifact directory |
| `remote_agent_start` | destination, request_id, task; optional title, project, provider and model | Remote thread/run IDs, link and output directory |
| `remote_agent_read` | destination, thread_id; optional message_limit | Thread state and latest messages |
| `remote_agent_send` | destination, request_id, thread_id, message | Follow-up submission IDs |
| `remote_file_get` | destination, path | Saved local path, byte count and SHA-256 |

Provider and model must be supplied together; otherwise the project's model
selection is inherited. Read returns 10 messages by default, at most 50, with each
message capped at 16,000 characters and truncation flagged.

For a basic stdio check before restarting an agent:

```sh
python3 ~/.local/share/t3-agent-bridge/bridge.py <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"remote_agent_targets","arguments":{}}}
JSON
```

## Runtime state and reliability

Runtime: `~/.local/share/t3-agent-bridge/bridge.py`. Private configuration:
`~/.config/t3-agent-bridge/config.json`. The runtime directory also contains:

- `requests.sqlite`: intent journal and cached start/send results.
- `artifacts/<request_id>/`: files remote agents explicitly stage for transfer.
- `downloads/`: retrieved files, saved under unique names with mode 600.

Use a stable unique request_id (1–100 letters, digits, underscores or hyphens)
for each mutation. Identical retries reuse cached results. Reusing the ID with
different arguments fails. A crash after recording intent can leave an unknown
outcome: inspect remote T3 threads for the request marker rather than launching
a replacement. This intentionally avoids automatic retries that could create
duplicate agents or messages. Keep configuration stable during retries.

SSH operations time out after 55 seconds, CLI calls after 40 seconds; remote
model runs continue independently. Threads are separate top-level threads, not
native children, and there is no automatic completion wakeup or cancellation tool.

File transfer accepts at most 20 MiB from regular files inside the remote
artifact directory. It rejects paths resolving outside that directory. Outputs
are not automatically deleted. Review retention needs and never export secrets.

## Verification and troubleshooting

After installing, check targets and status from both environments. Start a small
read-only task on each peer that reports its platform, retrieve its reply, send a
follow-up and transfer a staged non-sensitive artifact. Replaying an identical
request must return the same submission IDs. Confirm out-of-directory transfer
is rejected. These are manual integration checks; no test suite is installed.

If SSH fails, check the alias, host-key pinning, account access and network path.
If status reaches SSH but T3 fails, check the configured CLI and registered project.
If the model fails, read the remote thread instead of resubmitting it. If tools
are missing in an existing agent, reconnect the provider session or use the stdio
fallback. Do not treat a running T3 process as proof of provider authentication.

To remove, unregister `remote-agent-bridge` using each provider's `mcp remove`
command, then remove this package's runtime/configuration and skill directories
when no longer needed. Preserve journals/downloads if useful. SSH authorization
is configured separately; removing this package neither revokes keys nor stops
already running remote threads.
