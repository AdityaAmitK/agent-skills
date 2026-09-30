"""Export Kite historical candles to CSV."""

import argparse
import csv
import json
import os
import time
from datetime import date, timedelta
from pathlib import Path


def fetch_daily(kite, instrument_token: int, start: date, end: date, interval: str = "day") -> list[dict]:
    rows = []
    cursor = start
    while cursor <= end:
        chunk_end = min(end, cursor + timedelta(days=364))
        rows.extend(kite.historical_data(instrument_token, cursor, chunk_end, interval))
        cursor = chunk_end + timedelta(days=1)
        if cursor <= end:
            time.sleep(0.4)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("instrument_token", type=int)
    parser.add_argument("start", help="YYYY-MM-DD")
    parser.add_argument("end", help="YYYY-MM-DD")
    parser.add_argument("output", type=Path)
    parser.add_argument("--interval", choices=("day",), default="day")
    parser.add_argument("--token-file", type=Path, default=Path(".state/kite-token.json"))
    args = parser.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    if start > end:
        parser.error("start must be on or before end")
    if not os.environ.get("KITE_API_KEY"):
        parser.error("set KITE_API_KEY in the environment")

    from kiteconnect import KiteConnect

    stored = json.loads(args.token_file.read_text())
    kite = KiteConnect(api_key=os.environ["KITE_API_KEY"])
    kite.set_access_token(stored["access_token"])
    candles = fetch_daily(kite, args.instrument_token, start, end, args.interval)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fields = ["date", "open", "high", "low", "close", "volume"]
    with args.output.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(candles)
    print(f"Exported {len(candles)} candles to {args.output}")


if __name__ == "__main__":
    main()
