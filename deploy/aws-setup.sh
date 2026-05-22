#!/usr/bin/env bash
# =============================================================================
# Secure Chat System — AWS Amazon Linux 2023 (AL2023) bootstrap script
#
# Usage:
#   sudo bash deploy/aws-setup.sh
#
# This script:
#   1. Updates the system
#   2. Installs Docker + Docker Compose v2
#   3. Clones (or pulls) the repository
#   4. Prints instructions for configuring .env files
# =============================================================================

set -euo pipefail

APP_REPO_URL="${APP_REPO_URL:-https://github.com/YOUR_ORG/YOUR_REPO.git}"
APP_BRANCH="${APP_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/secure-chat}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}>>> $*${NC}"; }
warn()  { echo -e "${YELLOW}[!] $*${NC}"; }

# ── 1. System Update ──────────────────────────────────────────────────────────
info "Updating system packages..."
dnf update -y

# ── 2. Install Docker ─────────────────────────────────────────────────────────
info "Installing Docker..."
dnf install -y docker
systemctl enable docker
systemctl start docker

# Allow ec2-user to run docker without sudo (takes effect on next login)
usermod -aG docker ec2-user
info "ec2-user added to docker group (re-login or run 'newgrp docker' to apply)"

# ── 3. Install Docker Compose v2 ──────────────────────────────────────────────
info "Installing Docker Compose v2..."
ARCH=$(uname -m)   # x86_64 or aarch64
COMPOSE_VERSION="v2.27.1"
COMPOSE_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}"
curl -fsSL "$COMPOSE_URL" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
docker-compose version

# ── 4. Install Git ────────────────────────────────────────────────────────────
info "Installing Git..."
dnf install -y git

# ── 5. Clone / Pull Repository ────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
    info "Cloning repository to $APP_DIR ..."
    git clone --branch "$APP_BRANCH" "$APP_REPO_URL" "$APP_DIR"
else
    info "Repository already present — pulling latest changes..."
    git -C "$APP_DIR" pull origin "$APP_BRANCH"
fi

# ── 6. Open HTTP port in firewalld (if active) ────────────────────────────────
if systemctl is-active --quiet firewalld 2>/dev/null; then
    info "Configuring firewalld to allow HTTP traffic..."
    firewall-cmd --permanent --add-service=http
    firewall-cmd --reload
fi

# ── 7. Next Steps ─────────────────────────────────────────────────────────────
echo ""
echo "========================================================================="
info "Bootstrap complete. Follow these steps to finish the deployment:"
echo "========================================================================="
echo ""
echo "  1. Configure the server environment file:"
echo ""
echo "       cp $APP_DIR/src/server/.env.example $APP_DIR/src/server/.env"
echo "       nano $APP_DIR/src/server/.env"
echo ""
echo "     Required values for production:"
echo "       NODE_ENV=production"
echo "       PORT=3000"
echo "       CLIENT_URL=http://<your-ec2-public-ip-or-domain>"
echo "       CORS_ORIGIN=http://<your-ec2-public-ip-or-domain>"
echo "       MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>"
echo "       JWT_SECRET=<64-char random secret>"
echo "       GOOGLE_CLIENT_ID=<your-google-oauth-client-id>"
echo "       SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  (for email OTP)"
echo ""
echo "  2. Create the root .env for docker-compose build args:"
echo ""
echo "       nano $APP_DIR/.env"
echo ""
echo "     Contents:"
echo "       VITE_GOOGLE_CLIENT_ID=<your-google-oauth-client-id>"
echo "       # VITE_SOCKET_URL=   # leave blank — Nginx handles WebSocket routing"
echo ""
echo "  3. Build and start all containers:"
echo ""
echo "       cd $APP_DIR"
echo "       docker-compose up -d --build"
echo ""
echo "  4. Verify the deployment:"
echo ""
echo "       docker-compose ps"
echo "       curl http://localhost/api/health"
echo ""
echo "  5. (Optional) Set up HTTPS with Let's Encrypt:"
echo "     Install Certbot, obtain a certificate, then update"
echo "     src/client/nginx.conf to add an HTTPS server block."
echo "     Or terminate SSL at an AWS Application Load Balancer."
echo ""
warn "Security checklist before going live:"
echo "    - Restrict the EC2 security group: allow only ports 80 (and 443) inbound"
echo "    - Never commit .env files to git"
echo "    - Rotate JWT_SECRET immediately if the value was ever exposed"
echo "    - Enable MongoDB Atlas IP allowlist / VPC peering"
echo ""
