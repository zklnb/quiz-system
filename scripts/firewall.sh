#!/usr/bin/env bash
# Hardening host (Ubuntu): chỉ cho phép SSH + HTTP/HTTPS. Chạy bằng sudo.
set -euo pipefail
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose
