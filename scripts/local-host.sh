#!/usr/bin/env bash
# Serve the cockpit at http://cockpit.finnova.local/ on this Mac.
#
# Two things need root and are done here, once:
#   1. a hosts entry so cockpit.finnova.local resolves to loopback
#   2. a pf redirect so port 80 lands on the unprivileged service on 8787
#
# The service itself keeps binding to 127.0.0.1:8787 as an ordinary user.
#
#   scripts/local-host.sh up      # add hosts entry + port redirect
#   scripts/local-host.sh down    # remove the redirect (hosts entry stays)
set -euo pipefail

HOST_NAME=cockpit.finnova.local
PORT=${PORT:-8787}
RULE="rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${PORT}"

case "${1:-up}" in
  up)
    if ! grep -q "[[:space:]]${HOST_NAME}\$" /etc/hosts; then
      echo "127.0.0.1 ${HOST_NAME}" | sudo tee -a /etc/hosts >/dev/null
      echo "hosts: added ${HOST_NAME} -> 127.0.0.1"
    else
      echo "hosts: ${HOST_NAME} already present"
    fi
    # Loads a single rdr rule as the active pf ruleset and enables pf.
    # 'pf already enabled' from pfctl is harmless.
    echo "${RULE}" | sudo pfctl -ef - 2>&1 | grep -v 'already enabled' || true
    echo "pf: 80 -> ${PORT} on loopback"
    echo
    echo "Start the service with 'npm run serve' and open http://${HOST_NAME}/"
    ;;
  down)
    sudo pfctl -F all -f /etc/pf.conf >/dev/null 2>&1 || true
    sudo pfctl -d >/dev/null 2>&1 || true
    echo "pf: redirect removed, Apple default rules restored"
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 2
    ;;
esac
