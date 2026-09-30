---
name: humanizer
description: Remove signs of AI-generated writing from text and make prose sound more natural, specific, and human-written. Use when Codex is asked to humanize, de-AI, rewrite, polish, review, or edit text for AI tells such as inflated significance, promotional language, superficial -ing phrases, vague attribution, em dash overuse, rule-of-three cadence, AI vocabulary, passive voice, negative parallelisms, filler phrases, generic conclusions, or chatbot-like tone.
---

# Humanizer

Edit text so it reads like a real person wrote it, while preserving meaning, coverage, and the intended register.

## Workflow

1. Read the input and determine the target voice. If the user provides a writing sample, inspect its sentence rhythm, word choice, paragraph starts, punctuation habits, recurring phrases, and transition style before rewriting.
2. Load `references/patterns.md` for the detailed catalog of AI tells, false positives, human-writing signals, and the full worked example. Use it as the checklist for substantive rewrites.
3. Identify clusters of AI patterns. Do not over-edit isolated false positives, quotes, proper names, titles, examples discussing the phrase itself, or legitimate style choices.
4. Write a draft rewrite that covers everything the original covers. If the original has five paragraphs, keep five paragraphs unless the user asks for restructuring.
5. Audit the draft by asking: "What makes the below so obviously AI generated?" Answer briefly with any remaining tells.
6. Revise into the final rewrite. Before returning it, scan for em dashes and en dashes. The final rewrite must not contain `—` or `–`; replace them with periods, commas, colons, parentheses, or a sentence restructure.

## Editing Rules

- Rewrite instead of deleting. Preserve the user's claims, facts, caveats, and level of detail.
- Prefer concrete subjects, active voice, simple verbs, and specific details. Use `is`, `are`, and `has` when they are clearer than inflated constructions.
- Remove chatbot framing, generic optimism, promotional language, forced significance, fake depth, vague attribution, formulaic conclusions, and mechanical bold-header lists.
- Vary rhythm without manufacturing drama. Short sentences are useful; strings of punchline fragments are not.
- Match the context. For encyclopedic, technical, legal, or reference text, neutral and plain is often the correct human voice. For essays, opinion, blog posts, or personal writing, allow personality, mixed feelings, and human friction when they fit the author.
- Preserve genuine human signals: unusual specifics, mixed feelings, dated references, defendable first-person choices, natural asides, self-corrections, and varied sentence length.
- Use straight quotes unless the user requests typographic quotes.

## Output

Return, in this order unless the user asks for a shorter deliverable:

1. Draft rewrite
2. Brief "still AI" audit bullets
3. Final rewrite
4. Optional short summary of changes

For small edits or when the user only asks for the cleaned text, return only the final rewrite.
