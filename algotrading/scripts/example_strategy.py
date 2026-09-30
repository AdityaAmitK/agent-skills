"""Example custom daily strategy for backtest.py --strategy example_strategy:signal."""

from backtest import Bar


def signal(bars: list[Bar]) -> bool:
    """Stay long when the 10-session mean close exceeds the 30-session mean."""
    closes = [bar.close for bar in bars]
    if len(closes) < 30:
        return False
    return sum(closes[-10:]) / 10 > sum(closes[-30:]) / 30
