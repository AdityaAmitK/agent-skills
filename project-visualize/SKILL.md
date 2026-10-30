---
name: project-visualize
description: "Explain an implemented or planned project feature, workflow, architecture slice, or change with a source-grounded flowchart that teammates and stakeholders can follow. Use when Aditya wants to visualize project work, explain a PR or plan to others, or show how a feature works. Works across Reco and other projects; ordinary charts, UI mockups, and website implementation use their own skills."
---

# Project Visualize

Create a diagram someone can use to explain one part of a project without reading its code. Start with what triggers the flow, follow its important decisions and handoffs, and finish with what changes for the user or system.

Use `archify` as the diagram engine. Read the installed `archify/SKILL.md` and [the flowchart design guide](references/flowchart-style.md) before authoring. This skill owns project scope, source tracing, and explanation; Archify owns diagram types, schemas, layout, validation, and standalone HTML delivery. Follow higher-priority host instructions for display and browser use.

The [saved base skill](references/base-visualize.md), captured from bundled Visualize 1.0.47 on 9 October 2026, is historical reference only. Do not load its renderer, inline marker, or custom HTML/SVG requirements for this workflow. After compaction, reload this skill and Archify before authoring.

## Understand the slice

- Use the project, issue, PR, branch or plan already named. Inspect relevant code and callers read-only. For a change, read its actual diff and enough surrounding code to explain it. Drawing an explainer does not authorize implementation or deployment.
- Trace trigger → entry point → decision → work → persistence/external handoff → outcome. Identify synchronous versus queued work, parallel steps, retries, terminal exits and meaningful side effects. Keep branches that change the explanation.
- For implemented work, record the source revision and distinguish code existence from merged/deployed status. A PR is not evidence of production behavior. For planned work, follow the supplied plan and mark assumptions.
- Default audience: a technically literate teammate unfamiliar with the feature. Use plain action labels such as “Check eligibility” and “Restore messaging preferences.” Include exact technical names only when they clarify ownership or an important contract.
- Resolve vague scope from conversation/project context. Ask only if materially different flows remain plausible; inspect repository facts yourself.

## Explain the flow

Choose one dominant flow: top-to-bottom main path, off-path outcomes beside their decisions, and a separate lane for asynchronous work. Use grouped stages and short node descriptions from the design guide. Do not expand a small feature into a whole-system map.

Make these distinctions visible where relevant:

- **What changes:** name the actual store/provider, e.g. “Delete Iterable profile” and “Reco account remains.” Never collapse both into “Delete profile.”
- **Decisions:** put the question at the branch and label edges with their conditions.
- **Ownership:** name queue/service/datastore/provider boundaries. A handoff is not a completed outcome.
- **Timing:** show cron cadence, delays, retries and parallel joins where they explain behavior.
- **State:** separate accepted requests from verified completion when that matters.
- **Current versus proposed:** label views or mark proposed stages with text and a distinct line style; color alone is insufficient. Avoid duplicating an entire flow to highlight a small change.

Put source paths, detailed rules and caveats in a concise companion note, not every box. If the diagram is too dense, split overview/detail instead of shrinking labels. Never invent metrics, infrastructure, performance or readiness claims.

## Deliver the visual

- Use Archify's native `workflow` for processes and decisions, `architecture` for components and boundaries, `sequence` for call chains, or another type from its router when it fits better. Treat Mermaid input as topology to re-author in Archify, not as the output renderer.
- Author a complete candidate with source evidence, then run Archify's `finalize` command with the repository root for repository-backed diagrams. Follow its repair limits and delivery gates. Do not replace the renderer with custom HTML/SVG or the bundled Visualize helper.
- Use the design guide for readable labels, grouping, decisions, async lanes, and ownership. Archify's schema and layout rules take precedence over the guide's old surface and connector implementation advice.
- Always deliver standalone HTML with an absolute clickable file link and a concise source/status note. Follow the host's inline display contract when one is available; preserve the standalone artifact. Do not use the saved base's inline marker unless the host explicitly supports it.
- Hosting/posting is a separate requested action using the applicable workflow. Do not upload private project information merely to draw it. Redact secrets/personal records and use synthetic examples.
- If Archify is unavailable, report the missing dependency and provide a source-grounded text outline. Do not silently switch engines, install dependencies, or claim a verified visual.

## Verify and hand off

Read the result as a new teammate: can they identify the trigger, decisions, ownership and outcomes? Match those answers to the inspected source or approved plan.

Follow Archify's finalize receipts and applicable visual review requirements. Respect host restrictions on browser use. Distinguish automated artifact/browser checks from actual visual inspection, and disclose gates or requested reviews that could not run. Do not add custom connector measurement code or a second renderer.

Hand off the HTML link with a short explanation only when needed, plus material uncertainty/source status. Do not repeat the diagram in prose or present planned behavior as complete.

Examples:

- `$project-visualize Explain this PR's flow to the team.`
- `$project-visualize Show how the proposed feature will work.`
- `$project-visualize Draw the payment retry flow and export it for sharing.`
