"""Review or submit one bounded Kite LIMIT order."""

import argparse
import json
import math
import os
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("symbol")
    parser.add_argument("side", choices=("BUY", "SELL"))
    parser.add_argument("quantity", type=int)
    parser.add_argument("price", type=float)
    parser.add_argument("--max-value", type=float, required=True, help="required ceiling for quantity times limit price")
    parser.add_argument("--expected-user-id", help="required account identity check for live submission")
    parser.add_argument("--token-file", type=Path, default=Path(".state/kite-token.json"))
    parser.add_argument("--intent-file", type=Path, default=Path(".state/order-intent.json"))
    parser.add_argument("--execute", action="store_true", help="actually submit; default only prints the proposed order")
    args = parser.parse_args()
    if args.quantity <= 0 or not math.isfinite(args.price) or args.price <= 0 or not math.isfinite(args.max_value) or args.max_value <= 0:
        parser.error("quantity, price, and --max-value must be positive finite numbers")
    value = args.quantity * args.price
    if not math.isfinite(value) or value > args.max_value:
        parser.error(f"order value {value:.2f} exceeds --max-value {args.max_value:.2f}")
    order = {"symbol": args.symbol.upper(), "side": args.side, "quantity": args.quantity, "price": args.price, "value": round(value, 2), "type": "LIMIT"}
    if not args.execute:
        print(json.dumps({"mode": "dry-run", "order": order}, indent=2))
        return
    if not args.expected_user_id:
        parser.error("--expected-user-id is required with --execute")
    if not os.environ.get("KITE_API_KEY"):
        parser.error("set KITE_API_KEY in the environment")
    if args.intent_file.exists():
        parser.error(f"intent file already exists; reconcile broker state before another submission: {args.intent_file}")

    import uuid
    from kiteconnect import KiteConnect

    stored = json.loads(args.token_file.read_text())
    kite = KiteConnect(api_key=os.environ["KITE_API_KEY"])
    kite.set_access_token(stored["access_token"])
    user_id = str(kite.profile().get("user_id", ""))
    if user_id != args.expected_user_id:
        parser.error("authenticated Kite user does not match --expected-user-id")
    open_orders = [o for o in kite.orders() if o.get("exchange") == kite.EXCHANGE_NSE and o.get("tradingsymbol") == order["symbol"] and o.get("status") in {"OPEN", "TRIGGER PENDING", "AMO REQ RECEIVED", "VALIDATION PENDING", "PUT ORDER REQ RECEIVED"}]
    if open_orders:
        parser.error("an open order exists for this symbol; reconcile it before submitting another")
    if order["side"] == "SELL":
        holding = next((h for h in kite.holdings() if h.get("exchange") == kite.EXCHANGE_NSE and h.get("tradingsymbol") == order["symbol"]), {})
        sellable = max(0, int(holding.get("quantity", 0)) - int(holding.get("used_quantity", 0)))
        if order["quantity"] > sellable:
            parser.error("sell quantity exceeds settled CNC holdings after used quantity")

    intent_id = uuid.uuid4().hex[:20]
    payload = {"intent_id": intent_id, "status": "submitting", "order": order}
    args.intent_file.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(args.intent_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(payload, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    try:
        order_id = kite.place_order(
            variety=kite.VARIETY_REGULAR,
            exchange=kite.EXCHANGE_NSE,
            tradingsymbol=order["symbol"],
            transaction_type=order["side"],
            quantity=order["quantity"],
            product=kite.PRODUCT_CNC,
            order_type=kite.ORDER_TYPE_LIMIT,
            price=order["price"],
            tag=intent_id,
        )
    except Exception as exc:
        payload.update(status="uncertain", error_type=type(exc).__name__)
        _save_intent(args.intent_file, payload)
        raise SystemExit(f"Submission outcome may be uncertain ({type(exc).__name__}). Reconcile with Kite before any retry. Intent: {args.intent_file}") from None
    payload.update(status="submitted", order_id=str(order_id))
    _save_intent(args.intent_file, payload)
    print(json.dumps(payload, indent=2))


def _save_intent(path: Path, payload: dict) -> None:
    fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(payload, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
        path.chmod(0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


if __name__ == "__main__":
    main()
