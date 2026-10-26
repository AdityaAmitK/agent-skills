---
name: remote-agent-bridge
description: Delegate focused work to another configured T3 environment over SSH, retrieve replies, and transfer screenshots or artifacts. Use when the other environment provides needed browser access, native apps, operating system, files, or deployed services. Keep tasks local when local capabilities suffice.
---

# Remote agent bridge

Use the environment that provides the evidence or capability needed. Browser and
native-app review belongs where those apps run; deployed-service inspection
belongs where the service runs. Ordinary implementation stays local unless the
user requests another environment or its capabilities are needed. Prefer native
subagents for work on the same machine.

## Workflow

1. Call `remote_agent_targets` to discover configured peer names, then
   `remote_agent_status(destination)` to check the selected peer. Never assume a
   peer's capabilities from its name. Use its available tools and report missing
   access instead of silently substituting a different browser or environment.
2. Call `remote_agent_start` with a unique `request_id`, destination, focused task
   and title. Supply the actual remote project path or ID when its default is not
   appropriate. Omit provider/model to inherit that project's defaults, or pass
   both explicitly. Put requested model behavior in the task when the CLI cannot
   enforce it; do not claim a message guarantees a model setting.
3. Include the goal, relevant context, URLs, deliverables, allowed actions and
   exclusions. Parent conversation history is not transferred automatically.
   For a review, specify read-only scope. For screenshots or other outputs, ask
   the agent to save them in the artifact directory provided by the bridge.
4. Retain destination, request_id, threadId, artifact directory and link. Mention
   the returned link verbatim. Perform independent local work, then retrieve
   results with `remote_agent_read`. This bridge provides no automatic parent
   wakeup: do not promise one or poll in a tight loop. If unfinished at handback,
   give the remote link and state that result retrieval remains pending.
5. Send follow-ups using `remote_agent_send`, with a new request_id for each
   distinct message. Start a new task for an independent review when needed.
6. Retrieve staged files using `remote_file_get`. It returns a local path, size
   and SHA-256. Open retrieved images with the local image tool; remote paths
   are not local paths.

## Scope and recovery

- Delegation inherits the user's authorization, without expanding permission for
  deployments, service changes, financial actions or unrelated mutations.
- Ask remote agents not to delegate further unless their task explicitly requires
  it. Do not automatically bounce work between environments.
- Reuse the exact request_id and arguments after a dropped connection. The remote
  journal prevents duplicate submissions. If `outcome_unknown` is returned,
  inspect remote threads for the request marker before taking further action;
  never substitute a fresh ID to retry an uncertain launch or send.
- Start/send return after submission; busy threads queue follow-ups. The installed
  CLI-backed version has no cancellation tool. Closing SSH does not stop the
  remote agent; use the destination's T3 interface to stop it if necessary.
- Only regular files staged inside the remote bridge artifact directory can be
  transferred, up to 20 MiB. Never stage secrets, private configuration or keys.

## Setup and fallback

Read [references/setup.md](references/setup.md) to install and register the MCP,
configure peers, or diagnose connectivity. Runtime and private configuration live
outside the skill source. New agent sessions discover the registration and skill;
existing sessions may need reconnecting.

If MCP tools are not loaded yet, send JSON-RPC `tools/list` or `tools/call` lines
through stdin to `python3 ~/.local/share/t3-agent-bridge/bridge.py`. This uses the
same tools and retry journal. Do not bypass the journal by launching replacements
through direct CLI calls after an uncertain outcome.
