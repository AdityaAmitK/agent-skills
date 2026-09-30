# Generic VPS setup example

This is an offline backtest service template only. It does not place orders and includes no timer. The service is not installed or enabled by the skill. Replace every placeholder, verify the service account and file permissions, and review the systemd hardening options for the target host before installing it. Do not put secrets in the unit file. Add a timer only for a user-requested offline job; live trading requires a separately reviewed design and explicit authorization.

Copy [vps-systemd.example.service](vps-systemd.example.service) into the host's systemd unit directory after editing it, then inspect it with `systemd-analyze verify`. Install it with `systemctl daemon-reload`; leave it disabled until the user explicitly chooses to enable this offline job. Configure logs and a controlled write location if the job needs output files.

The sample uses absolute placeholder paths so it cannot run unchanged. It is not a complete deployment script and does not provision a host, firewall, Python runtime, data, or credentials.
