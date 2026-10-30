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

- `algotrading`: includes a small Python starter toolkit for Kite daily history, CSV export, a generic strategy callback and backtest, and a bounded dry-run-first order helper. It is an example starter, not a production trading system or personal account configuration.
- `humanizer`: adapted writing guidance with upstream attribution in `THIRD_PARTY_NOTICES.md`.
- `remote-agent-bridge`: SSH-backed MCP tools and capability-based routing between configured T3 environments, with retry protection and staged artifact transfer.
- `eli5`: plain-language explanations that use Archify when diagrams or flowcharts help.
- `project-visualize`: source-grounded project flows rendered and delivered through Archify.
- `archify`: the bundled Archify 3.2 diagram engine, including local delivery preferences, schemas, renderers, and references.
- `coding-principal`: balances stronger models for brainstorming, planning, and review with faster, cheaper models for writing code, aiming to retain quality while reducing cost.

Install `archify` alongside `eli5` or `project-visualize` for their diagram workflows. Copy the complete directories so references, schemas, renderers, and licenses remain available.

## Kestrl

Kestrl's agent skill and MCP server are maintained in the [Kestrl repository](https://github.com/AdityaAmitK/kestrl) (`skills/kestrl/SKILL.md`, `kestrl mcp`), not copied here. Its MCP tools accept a `host` argument for running a single Kestrl command on another machine over SSH; use `remote-agent-bridge` for multi-step work delegated to that machine's agent.

## Remote agent bridge

`remote-agent-bridge` includes a dependency-free SSH-backed MCP server and a routing skill for delegating to other T3 environments. It supports task submission, reply retrieval, follow-ups and staged artifact transfer. See [setup](remote-agent-bridge/references/setup.md) for private peer configuration and MCP registration. Copying the skill alone does not configure SSH or install the runtime.

## AlgoTrading starter

Use Python 3.10 or newer. From `algotrading/`, create an environment and install the Kite dependency:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Set `KITE_API_KEY` and `KITE_API_SECRET` using your secret manager. Configure the Kite app's registered redirect URL. Open `https://kite.zerodha.com/connect/login?v=3&api_key=YOUR_API_KEY`, complete the broker login, and copy the short-lived `request_token` from the registered redirect URL when prompted by `.venv/bin/python scripts/kite_auth.py`. The helper exchanges it immediately and stores the access token in a mode-600 file. See the [official Kite login flow](https://kite.trade/docs/connect/v3/user/) for details.

Export a daily history CSV with your own instrument token, then run the example strategy:

```sh
.venv/bin/python scripts/export_history.py 123456 2020-01-01 2025-12-31 data/daily.csv
.venv/bin/python scripts/backtest.py data/daily.csv --strategy example_strategy:signal --cash 100000 --fee-bps 10 --slippage-bps 5
.venv/bin/python scripts/order.py ABC BUY 1 100 --max-value 5000
```

The history exporter makes bounded requests and pauses between chunks. `data/daily.csv` is generated input, not included. The last command only prints a proposed order; history export and real order submission contact Kite. Live submission additionally requires explicit `--execute`, account identity and value limits. Review the AlgoTrading skill and code before use. From the repository root, run offline checks with `python3 -m unittest discover -s algotrading/tests`.

For a VPS, start with the [offline systemd example](algotrading/references/vps.md). It provides an editable backtest service template and does not install a service or enable a trading schedule.

## License

See `LICENSE` for this repository's license and `THIRD_PARTY_NOTICES.md` for retained third-party notices.
