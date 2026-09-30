import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stderr, redirect_stdout

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from backtest import Bar, backtest, moving_average_signals
from kite_auth import save_token
from export_history import fetch_daily


class StarterTests(unittest.TestCase):
    def test_signal_uses_only_current_and_prior_closes(self):
        bars = [Bar(date(2024, 1, 1) + timedelta(days=i), 100, close) for i, close in enumerate([10, 9, 8, 12, 20])]
        signals = moving_average_signals(bars, fast=2, slow=3)
        changed_future = bars[:3] + [Bar(bars[3].date, 1, 1), Bar(bars[4].date, 1, 1)]
        self.assertEqual(signals[:3], moving_average_signals(changed_future, fast=2, slow=3)[:3])

    def test_next_open_costs_and_close_mark(self):
        bars = [Bar(date(2024, 1, 1) + timedelta(days=i), op, close) for i, (op, close) in enumerate([(10, 10), (10, 10), (12, 12), (15, 15)])]
        strategy = lambda prefix: [False, True, False, False][len(prefix) - 1]
        result = backtest(bars, 1000, 100, 100, strategy)
        self.assertEqual(result["trades"], 2)
        self.assertEqual(result["open_shares"], 0)
        # Entry fills at 12.12, exit at 14.85, with 1% fees on both sides.
        self.assertEqual(result["final_equity"], 1199.28)

    def test_strategy_receives_only_prefix_through_prior_close(self):
        bars = [Bar(date(2024, 1, 1) + timedelta(days=i), 10, close) for i, close in enumerate([1, 2, 3, 4])]
        lengths = []
        def strategy(prefix):
            lengths.append(len(prefix))
            return False
        backtest(bars, strategy=strategy)
        self.assertEqual(lengths, [1, 2, 3])

    def test_token_written_atomically_with_private_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nested" / "token.json"
            save_token(path, "sample", "2024-01-02T06:00:00+05:30")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text())["access_token"], "sample")
            self.assertEqual(list(path.parent.iterdir()), [path])

    def test_dry_run_order_does_not_import_broker_or_submit(self):
        from order import main
        output = io.StringIO()
        real_import = __import__
        def guarded_import(name, *args, **kwargs):
            if name == "kiteconnect":
                raise AssertionError("broker import in dry run")
            return real_import(name, *args, **kwargs)
        with patch.object(sys, "argv", ["order.py", "ABC", "BUY", "2", "10", "--max-value", "30"]), patch("builtins.__import__", side_effect=guarded_import), redirect_stdout(output):
            main()
        self.assertIn('"mode": "dry-run"', output.getvalue())

    def test_order_bounds_reject_excess_value(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/order.py"), "ABC", "BUY", "2", "10", "--max-value", "19"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exceeds --max-value", result.stderr)

    def test_uncertain_submission_is_persisted_and_duplicate_blocked(self):
        class Broker:
            VARIETY_REGULAR = "regular"
            EXCHANGE_NSE = "NSE"
            PRODUCT_CNC = "CNC"
            ORDER_TYPE_LIMIT = "LIMIT"
            calls = 0
            def set_access_token(self, _): pass
            def profile(self): return {"user_id": "expected"}
            def holdings(self): return []
            def orders(self): return []
            def place_order(self, **_):
                self.calls += 1
                raise TimeoutError("network timeout")
        broker = Broker()
        fake_module = type(sys)("kiteconnect")
        fake_module.KiteConnect = lambda **_: broker
        env = dict(os.environ, KITE_API_KEY="test", PYTHONPATH=str(ROOT / "scripts"))
        with tempfile.TemporaryDirectory() as tmp:
            token = Path(tmp) / "token.json"
            token.write_text('{"access_token":"test"}')
            intent = Path(tmp) / "intent.json"
            command = [sys.executable, str(ROOT / "scripts/order.py"), "ABC", "BUY", "1", "10", "--max-value", "10", "--expected-user-id", "expected", "--token-file", str(token), "--intent-file", str(intent), "--execute"]
            with patch.dict(sys.modules, {"kiteconnect": fake_module}), patch.object(sys, "argv", command[1:]), patch.dict(os.environ, env):
                from order import main
                with self.assertRaises(SystemExit) as caught:
                    main()
                self.assertIn("uncertain", str(caught.exception))
                self.assertEqual(json.loads(intent.read_text())["status"], "uncertain")
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    main()
                self.assertEqual(broker.calls, 1)

    def test_mock_live_success_saves_order_id(self):
        class Broker:
            VARIETY_REGULAR = "regular"
            EXCHANGE_NSE = "NSE"
            PRODUCT_CNC = "CNC"
            ORDER_TYPE_LIMIT = "LIMIT"
            def set_access_token(self, _): pass
            def profile(self): return {"user_id": "expected"}
            def orders(self): return []
            def place_order(self, **params):
                self.params = params
                return "mock-order-1"
        broker = Broker()
        fake_module = type(sys)("kiteconnect")
        fake_module.KiteConnect = lambda **_: broker
        with tempfile.TemporaryDirectory() as tmp:
            token = Path(tmp) / "token.json"
            token.write_text('{"access_token":"test"}')
            intent = Path(tmp) / "intent.json"
            argv = ["order.py", "ABC", "BUY", "1", "10", "--max-value", "10", "--expected-user-id", "expected", "--token-file", str(token), "--intent-file", str(intent), "--execute"]
            with patch.dict(sys.modules, {"kiteconnect": fake_module}), patch.object(sys, "argv", argv), patch.dict(os.environ, {"KITE_API_KEY": "test"}), redirect_stdout(io.StringIO()):
                from order import main
                main()
            self.assertEqual(json.loads(intent.read_text())["order_id"], "mock-order-1")
            self.assertEqual(broker.params["order_type"], "LIMIT")

    def test_cnc_sell_uses_settled_quantity_after_used_quantity(self):
        class Broker:
            VARIETY_REGULAR = "regular"
            EXCHANGE_NSE = "NSE"
            PRODUCT_CNC = "CNC"
            ORDER_TYPE_LIMIT = "LIMIT"
            def set_access_token(self, _): pass
            def profile(self): return {"user_id": "expected"}
            def orders(self): return []
            def holdings(self): return [{"exchange": "NSE", "tradingsymbol": "ABC", "quantity": 5, "used_quantity": 1, "authorised_quantity": 4}]
            def place_order(self, **params):
                self.params = params
                return "sell-order"
        broker = Broker()
        fake_module = type(sys)("kiteconnect")
        fake_module.KiteConnect = lambda **_: broker
        with tempfile.TemporaryDirectory() as tmp:
            token = Path(tmp) / "token.json"
            token.write_text('{"access_token":"test"}')
            intent = Path(tmp) / "intent.json"
            base = ["order.py", "ABC", "SELL", "4", "10", "--max-value", "40", "--expected-user-id", "expected", "--token-file", str(token), "--intent-file", str(intent), "--execute"]
            with patch.dict(sys.modules, {"kiteconnect": fake_module}), patch.object(sys, "argv", base), patch.dict(os.environ, {"KITE_API_KEY": "test"}), redirect_stdout(io.StringIO()):
                from order import main
                main()
            self.assertEqual(broker.params["transaction_type"], "SELL")

            intent.unlink()
            over = base.copy()
            over[3] = "5"
            with patch.dict(sys.modules, {"kiteconnect": fake_module}), patch.object(sys, "argv", over), patch.dict(os.environ, {"KITE_API_KEY": "test"}), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                main()
            self.assertFalse(intent.exists())
            self.assertEqual(broker.params["quantity"], 4)

    def test_history_export_chunks_at_365_days_and_writes_csv(self):
        class Broker:
            def __init__(self): self.calls = []
            def set_access_token(self, _): pass
            def historical_data(self, token, start, end, interval):
                self.calls.append((token, start, end, interval))
                return [{"date": start.isoformat(), "open": 1, "high": 2, "low": 1, "close": 2, "volume": 10}]
        broker = Broker()
        fake_module = type(sys)("kiteconnect")
        fake_module.KiteConnect = lambda **_: broker
        with tempfile.TemporaryDirectory() as tmp:
            token = Path(tmp) / "token.json"
            token.write_text('{"access_token":"test"}')
            output = Path(tmp) / "nested" / "history.csv"
            argv = ["export_history.py", "123", "2020-01-01", "2021-12-31", str(output), "--token-file", str(token)]
            with patch.dict(sys.modules, {"kiteconnect": fake_module}), patch.object(sys, "argv", argv), patch.dict(os.environ, {"KITE_API_KEY": "test"}), patch("export_history.time.sleep") as sleep, redirect_stdout(io.StringIO()):
                from export_history import main
                main()
            self.assertEqual(len(broker.calls), 3)
            self.assertTrue(all((end - start).days <= 364 for _, start, end, _ in broker.calls))
            self.assertEqual(broker.calls[1][1], broker.calls[0][2] + timedelta(days=1))
            self.assertEqual(broker.calls[2][1], broker.calls[1][2] + timedelta(days=1))
            self.assertEqual(sleep.call_count, 2)
            self.assertIn("date,open,high,low,close,volume", output.read_text())
            with output.open() as stream:
                self.assertEqual(sum(1 for _ in stream), 4)


if __name__ == "__main__":
    unittest.main()
