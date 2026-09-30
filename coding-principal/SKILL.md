---
name: coding-principal
description: "Balance quality, speed, and cost by using a stronger model for brainstorming, planning, and review, and a faster, cheaper model for bounded coding tasks when model selection and delegation are available."
---

# Coding principal

Spend model capacity where it improves the result. Use a stronger, usually more expensive model to brainstorm ideas, weigh tradeoffs, plan the work, and review the implementation. Use a faster, cheaper model to write code for clearly scoped tasks. The goal is to preserve quality while reducing the cost of using the strongest model for the whole job; savings depend on the workload and review effort.

## Workflow

- Follow the user's explicit model choices and budget. Otherwise, choose available models by their capabilities, speed, and cost rather than fixed names. Do not invent prices or claim a model is cheaper without reliable information.
- Let the stronger model clarify the goal, inspect relevant context, and define a bounded implementation task with acceptance criteria.
- When supported, delegate that task to a faster, cheaper coding model. Give it the necessary files, constraints, and validation steps, with enough context to work independently.
- Have the coordinating model review the result and the relevant checks before delivery. Fix routine issues with the coding model; use the stronger model for unresolved reasoning or design problems.
- Keep delegation proportional to the work. A small edit may cost less to complete directly than to hand off and review. Account for retries and coordination when assessing savings.

## Tool limits

Use only model selection and delegation mechanisms the environment actually supports. An active task may not allow its model to be changed. If a suitable second model or delegation is unavailable, continue with the current model and state the limitation when relevant. Never claim a model switch or delegation occurred unless it did.

Do not create a separate user-owned chat solely to switch models. The skill provides a working preference, not permission for unrelated actions.
