"""Stdlib daily long-only moving-average crossover example and CSV backtest."""

import argparse
import csv
import importlib
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Bar:
    date: date
    open: float
    close: float


def moving_average_signals(bars: list[Bar], fast: int = 5, slow: int = 20) -> list[bool]:
    if fast < 1 or slow <= fast:
        raise ValueError("require 1 <= fast < slow")
    closes = [bar.close for bar in bars]
    signals = []
    for i in range(len(bars)):
        if i + 1 < slow:
            signals.append(False)
            continue
        fast_avg = sum(closes[i - fast + 1 : i + 1]) / fast
        slow_avg = sum(closes[i - slow + 1 : i + 1]) / slow
        signals.append(fast_avg > slow_avg)
    return signals


def backtest(bars: list[Bar], starting_cash: float = 100_000, fee_bps: float = 10, slippage_bps: float = 5, strategy=None) -> dict:
    if not all(math.isfinite(x) for x in (starting_cash, fee_bps, slippage_bps)) or starting_cash <= 0 or not 0 <= fee_bps < 10_000 or not 0 <= slippage_bps < 10_000:
        raise ValueError("capital must be positive and fee/slippage rates must be finite bps in [0, 10000)")
    if any(not all(math.isfinite(x) and x > 0 for x in (bar.open, bar.close)) for bar in bars):
        raise ValueError("OHLC prices must be positive finite numbers")
    if any(bars[i].date >= bars[i + 1].date for i in range(len(bars) - 1)):
        raise ValueError("bar dates must be strictly increasing")
    # ponytail: generic prefix callbacks trade safety for O(n^2) replay; use a streaming strategy for large datasets.
    signal_for_prefix = strategy or (lambda prefix: moving_average_signals(prefix)[-1])
    cash, shares, previous_signal, trades = starting_cash, 0, False, 0
    cost_rate = (fee_bps + slippage_bps) / 10_000
    for i in range(1, len(bars)):
        signal = signal_for_prefix(bars[:i])  # only prior-close data reaches strategy
        if not isinstance(signal, bool):
            raise ValueError("strategy callback must return bool")
        if signal and not previous_signal and shares == 0:
            fill = bars[i].open * (1 + slippage_bps / 10_000)
            shares = int(cash / (fill * (1 + fee_bps / 10_000)))
            cash -= shares * fill * (1 + fee_bps / 10_000)
            trades += bool(shares)
        elif not signal and previous_signal and shares:
            fill = bars[i].open * (1 - slippage_bps / 10_000)
            cash += shares * fill * (1 - fee_bps / 10_000)
            shares = 0
            trades += 1
        previous_signal = signal
    equity = cash + shares * bars[-1].close if bars else starting_cash
    return {"starting_cash": starting_cash, "final_equity": round(equity, 2), "return_pct": round((equity / starting_cash - 1) * 100, 2), "trades": trades, "open_shares": shares, "estimated_cost_bps_per_side": round(cost_rate * 10_000, 2)}


def read_bars(path: Path) -> list[Bar]:
    with path.open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    bars = [Bar(date.fromisoformat(row["date"][:10]), float(row["open"]), float(row["close"])) for row in rows]
    if any(not all(math.isfinite(x) and x > 0 for x in (b.open, b.close)) for b in bars) or any(bars[i].date >= bars[i + 1].date for i in range(len(bars) - 1)):
        raise ValueError("prices must be positive and dates strictly increasing")
    return bars


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, help="CSV with date, open, close columns")
    parser.add_argument("--cash", type=float, default=100_000)
    parser.add_argument("--fee-bps", type=float, default=10)
    parser.add_argument("--slippage-bps", type=float, default=5)
    parser.add_argument("--strategy", help="optional module:function callable; receives bars through prior close and returns one bool")
    args = parser.parse_args()
    strategy = None
    if args.strategy:
        module_name, function_name = args.strategy.split(":", 1)
        strategy = getattr(importlib.import_module(module_name), function_name)
    print(backtest(read_bars(args.csv), args.cash, args.fee_bps, args.slippage_bps, strategy))


if __name__ == "__main__":
    main()
