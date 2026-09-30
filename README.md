# Agent Skills

Reusable skills for coding agents. Each skill is a directory containing a `SKILL.md` entrypoint and any supporting references it needs.

## Install

Copy the skill directories you want into the skills directory supported by your agent. For Codex, this is commonly `~/.codex/skills/`. Claude Code supports project skills under `.claude/skills/` and user skills under `~/.claude/skills/`. Check the current documentation for your agent if its installation paths or discovery rules have changed.

For example, from this repository:

```sh
cp -R algotrading ~/.codex/skills/
cp -R algotrading .claude/skills/
```

Install `humanizer` and `coding-principal` the same way when wanted. Avoid overwriting an existing skill directory without reviewing its contents first.

## Skills

- `algotrading`: project guidance for Kite Connect workflows, research, backtesting, and controlled execution. It does not include a trading engine or personal account configuration.
- `humanizer`: adapted writing guidance with upstream attribution in `THIRD_PARTY_NOTICES.md`.
- `coding-principal`: preference guidance for planning and bounded coding delegation.

## License

See `LICENSE` for this repository's license and `THIRD_PARTY_NOTICES.md` for retained third-party notices.
