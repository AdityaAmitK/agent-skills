---
name: algotrading
description: Help build, backtest, configure, and operate reusable algorithmic trading tooling, especially with Zerodha Kite Connect. Use when the user asks for Kite authentication, trading project setup, strategy research, backtesting, or order execution.
---

# Algorithmic trading project guide

Use this skill to guide work in the user's chosen trading project. It is guidance for building project-specific tooling; it does not bundle a trading engine, credentials, strategies, market data, or VPS access details. Inspect the project and preserve its architecture. Do not import personal account assumptions or artifacts from another checkout.

## Kite authentication

- Read current official Kite Connect documentation before implementing or changing authentication. Prefer the supported login flow: redirect the user to Kite's login URL, receive the `request_token` at the registered redirect URL, exchange it with the API secret for an `access_token`, and persist the token securely for its documented lifetime.
- API secrets and access tokens are credentials. Load them from a user-managed secret store or environment; never commit, log, print, or include them in generated reports. Restrict token-file permissions and avoid storing the user's Kite password or TOTP seed as an unattended login mechanism.
- Only add Selenium/browser-driven password and TOTP login when the user explicitly requests that method. Before doing so, verify current broker documentation and terms, explain the operational and credential risks, and keep the automation isolated and opt-in. Do not assume UI selectors or flows are stable.
- Keep authentication behind a small adapter so backtests and strategy logic can run without a live broker session.

## Project and VPS setup

- Make setup portable: ask for or infer the target OS and deployment model, keep paths configurable, and document Python/runtime, dependency, service, logging, and restart steps. Do not embed personal usernames, host addresses, SSH-key paths, app directories, or service names.
- Keep credentials, runtime state, databases, logs, and generated artifacts outside source control. Provide an example environment file with variable names only, and ensure ignore rules cover real secret and runtime files.
- Treat VPS work as a deployment to a user-controlled host. Never connect to or modify a VPS unless the user explicitly asks for that operation; prepare and review deployment files first.

## Backtesting and strategy research

- Separate pure signal and portfolio logic from broker I/O so the same strategy can be backtested and run in paper mode.
- Make data source, universe, dates, timeframe, timezone, execution timing, starting capital, cash flows, and assumptions explicit. Check for lookahead, survivorship, stale/missing data, corporate actions, and signal-to-fill timing. Model brokerage, taxes, exchange fees, slippage, spread, and rejected or partial fills when applicable; label estimates and omissions.
- Use chronological train/validation/holdout periods or walk-forward evaluation. Do not tune on the final holdout. Compare against a relevant benchmark and simple baselines, and report drawdown, exposure, turnover, trade count, and return alongside headline performance.
- Keep strategy parameters external and validated. Record configuration and data provenance with every result so runs can be reproduced. Treat a backtest as research evidence, not a promise of future returns.

## Strategy implementation

- Define entry, exit, sizing, rebalancing, cash handling, and failure behavior before wiring broker calls. Match live decision timing to the backtest's assumptions.
- Start with deterministic signals and replayable historical inputs. Add a paper or simulation mode that exercises the same planning and risk checks as live execution.
- Make account-specific holdings, manual trades, and existing positions explicit inputs. Reconcile broker positions and open orders before planning; never assume the strategy owns every account holding.

## Order execution

- Default every new implementation to dry-run or paper mode. Live order placement must require a clear user request and an explicit configuration switch that is off by default; surface the selected account, exchange, symbol, side, quantity, order type, and estimated value before enabling it.
- Apply configurable limits for order value, position size, daily loss, duplicate orders, and allowed instruments. Validate market hours, quote freshness, tick/lot sizes, available funds, and current holdings. Follow broker rate limits and current API requirements.
- Use an idempotent order lifecycle: persist an intent before submission, retain broker order IDs, reconcile status and fills, and handle partial fills and cancellations. Do not blindly retry an order after a timeout; first query the broker for the original order's state.
- Keep live submission isolated behind one reviewed adapter and log decisions with secrets redacted. Stop and report uncertainty when broker state cannot be reconciled; never silently convert an error into a replacement order.

## References

For broker-specific behavior, consult current official documentation rather than relying on memory:

- [Kite Connect documentation](https://kite.trade/docs/connect/v3/)
- [Kite Connect Python client](https://github.com/zerodha/pykiteconnect)
