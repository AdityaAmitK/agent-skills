"""Exchange a Kite request token and store the daily access token securely."""

import argparse
import getpass
import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


def save_token(path: Path, token: str, expires_at: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump({"access_token": token, "expires_at": expires_at}, stream)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
        path.chmod(0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token-file", type=Path, default=Path(".state/kite-token.json"))
    args = parser.parse_args()

    api_key = os.environ.get("KITE_API_KEY")
    api_secret = os.environ.get("KITE_API_SECRET")
    if not api_key or not api_secret:
        parser.error("set KITE_API_KEY and KITE_API_SECRET in the environment")
    request_token = getpass.getpass("Kite request_token from the registered redirect: ").strip()
    if not request_token:
        parser.error("request_token cannot be empty")

    from kiteconnect import KiteConnect

    session = KiteConnect(api_key=api_key).generate_session(request_token, api_secret=api_secret)
    # Kite documents expiry at 06:00 IST on the day after login; the broker may revoke sooner.
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    expiry = (now + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    save_token(args.token_file, session["access_token"], expiry.isoformat())
    print(f"Access token saved to {args.token_file} (mode 600). It is not printed.")


if __name__ == "__main__":
    main()
