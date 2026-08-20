#!/usr/bin/env bash
# Endurecimiento SSH — ejecutar una vez en VPS como root o con sudo
set -euo pipefail

SSHD="/etc/ssh/sshd_config.d/99-kleynners-hardening.conf"

sudo tee "$SSHD" > /dev/null <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
MaxAuthTries 3
LoginGraceTime 30
AllowUsers deploy
EOF

sudo sshd -t
sudo systemctl reload sshd
echo "SSH hardened OK — solo deploy con clave"
