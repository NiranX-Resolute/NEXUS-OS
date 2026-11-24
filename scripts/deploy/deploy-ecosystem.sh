#!/usr/bin/env bash
# ==============================================================================
# NEXUS OS — Multi-Site Cloudflare Deployment Script (Bash)
# Deploys all 4 micro-frontends to Cloudflare Pages
# ==============================================================================

set -e

TOOL="${1:-wrangler}"

echo "=========================================================="
echo "   NEXUS OS — Cloudflare Multi-Site Deployment Orchestrator"
echo "=========================================================="

deploy_site() {
    local NAME=$1
    local PATH_DIR=$2
    echo -e "\n[+] Deploying $NAME from $PATH_DIR..."

    if [ "$TOOL" == "cf" ]; then
        cf pages deploy "$PATH_DIR" --project-name="$NAME"
    else
        npx wrangler pages deploy "$PATH_DIR" --project-name="$NAME"
    fi
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

deploy_site "ecosystem-landing" "./web/landing"
deploy_site "ecosystem-auth" "./web/auth"
deploy_site "ecosystem-status" "./web/status"
deploy_site "ecosystem-admin" "./web/admin"

echo -e "\n=========================================================="
echo " All 4 Micro-Frontends deployed to Cloudflare Pages!"
echo "  - Landing Portal: https://ecosystem-landing.pages.dev"
echo "  - Identity Gateway: https://ecosystem-auth.pages.dev"
echo "  - System Radar: https://ecosystem-status.pages.dev"
echo "  - Admin Command HQ: https://ecosystem-admin.pages.dev"
echo "=========================================================="
