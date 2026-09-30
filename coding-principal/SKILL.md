---
name: coding-principal
description: "Keep planning and default Codex work on GPT-6 Sol low, and delegate bounded coding work to a GPT-6 Luna low subagent when available."
---

# Coding principal

Use this preference for Codex work:

- The main agent plans, coordinates, and handles default tasks on `gpt-6-sol` with low reasoning effort when that model can be selected.
- For a concrete, bounded coding subtask, spawn a subagent using `gpt-6-luna` with low reasoning effort. Give it the task context and let the main agent review the result and finish the user request. Use a limited history fork when setting the subagent model and effort.

"Light" means the model selector's **low** reasoning effort. Explicit model instructions in the current request override this preference.

An active task's model cannot be changed by this skill. Subagents can use a different model when the available agent tool supports it. Do not create a separate user-owned Codex task solely to change models. If subagent delegation is unavailable, continue the task and state the model limitation when it matters; never claim a switch occurred.

This is a simple fixed preference. Do not call Jev, classify complexity, or add escalation rules unless Aditya asks to extend the principal.
