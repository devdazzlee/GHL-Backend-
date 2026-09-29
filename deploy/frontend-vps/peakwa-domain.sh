#!/usr/bin/env bash
# peakwa-domain: serve a client's own domain for a Peakwa site on the frontend VPS
# (169.58.4.58): one nginx file per domain + a Let's Encrypt certificate (Certbot).
#
#   peakwa-domain add <domain> [--dry-run]   e.g. peakwa-domain add www.acmehvac.com
#   peakwa-domain remove <domain>
#   peakwa-domain list
#
# Only touches nginx files named peakwa-domain-<domain> and certificates named <domain>.
# Never edits another app's config. Runs `nginx -t` before every reload, and undoes its
# own nginx file if the certificate can't be issued.
#
# Which site the domain shows is set in the dashboard (Custom domain), not here: nginx
# sends every custom domain to the same renderer, which maps the host to the site.
# Install: install -m 755 deploy/frontend-vps/peakwa-domain.sh /usr/local/sbin/peakwa-domain
set -euo pipefail

FRONTEND_IP="${PEAKWA_FRONTEND_IP:-169.58.4.58}"
RENDERER="${PEAKWA_RENDERER:-127.0.0.1:3100}"
AVAILABLE=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled
PREFIX=peakwa-domain-

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "==> $*"; }

normalize() {
  local d
  d=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's#^[a-z][a-z0-9+.-]*://##; s#[/?#].*$##; s#:[0-9]+$##; s#\.$##')
  printf '%s' "$d"
}

valid_domain() {
  [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$ ]] || return 1
  case "$1" in peakwa.com|*.peakwa.com|*.vercel.app|localhost) return 1 ;; esac
}

# www.acme.com <-> acme.com; nothing for deeper subdomains.
alternate_of() {
  local d="$1"
  if [[ "$d" == www.* ]]; then echo "${d#www.}";
  elif [[ $(awk -F. '{print NF}' <<<"$d") -eq 2 ]]; then echo "www.$d";
  fi
}

# A records of a host from public resolvers (not this server's cache).
a_records() {
  node -e '
    const { Resolver } = require("node:dns").promises;
    const r = new Resolver({ timeout: 4000, tries: 2 }); r.setServers(["1.1.1.1", "8.8.8.8"]);
    r.resolve4(process.argv[1]).then((a) => console.log(a.join(" ")), () => console.log(""));
  ' "$1"
}

aaaa_records() {
  node -e '
    const { Resolver } = require("node:dns").promises;
    const r = new Resolver({ timeout: 4000, tries: 2 }); r.setServers(["1.1.1.1", "8.8.8.8"]);
    r.resolve6(process.argv[1]).then((a) => console.log(a.join(" ")), () => console.log(""));
  ' "$1"
}

# 0 when every A record is this server and there is no AAAA record.
points_here() {
  local host="$1" a aaaa
  a=$(a_records "$host"); aaaa=$(aaaa_records "$host")
  if [[ -z "$a" ]]; then echo "   $host: no A record yet (needs A -> $FRONTEND_IP)"; return 1; fi
  for ip in $a; do
    [[ "$ip" == "$FRONTEND_IP" ]] || { echo "   $host: A records are '$a'; all must be $FRONTEND_IP"; return 1; }
  done
  [[ -z "$aaaa" ]] || { echo "   $host: remove the AAAA records ($aaaa); this server answers on IPv4 only"; return 1; }
  echo "   $host: OK ($a)"
}

nginx_reload() {
  nginx -t 2>&1 | tail -2
  systemctl reload nginx
}

config_for() {
  local names="$1" domain="$2"
  cat <<EOF
# Managed by peakwa-domain: custom domain for a Peakwa site.
# Remove with: peakwa-domain remove $domain
server {
    listen 80;
    listen [::]:80;
    server_name $names;

    client_max_body_size 10m;

    location / {
        proxy_pass http://$RENDERER;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
}

cmd_add() {
  local domain alt names file dry_run=false
  domain=$(normalize "${1:-}")
  [[ "${2:-}" == "--dry-run" ]] && dry_run=true
  valid_domain "$domain" || die "'${1:-}' is not a client domain (expected e.g. www.acmehvac.com)."
  file="$AVAILABLE/$PREFIX$domain"
  [[ -e "$file" ]] && die "$domain is already set up ($file). To redo it: peakwa-domain remove $domain, then add again."

  say "Checking DNS for $domain (must point at $FRONTEND_IP)"
  points_here "$domain" || die "DNS for $domain is not ready. Fix the records above, wait for them to spread, then run this again."
  names="$domain"
  alt=$(alternate_of "$domain")
  if [[ -n "$alt" ]]; then
    if points_here "$alt"; then
      names="$domain $alt"
    else
      echo "   (skipping $alt: its DNS is not pointed here, so it won't redirect to $domain. Add it later by removing and re-adding $domain.)"
    fi
  fi

  if $dry_run; then
    say "Dry run: would write $file and request a certificate for: $names"
    config_for "$names" "$domain"
    return 0
  fi

  say "Writing $file"
  config_for "$names" "$domain" > "$file"
  ln -sf "$file" "$ENABLED/$PREFIX$domain"
  if ! nginx -t >/dev/null 2>&1; then
    rm -f "$ENABLED/$PREFIX$domain" "$file"
    nginx -t || true
    die "nginx rejected the new file; it was removed and nothing was reloaded."
  fi
  systemctl reload nginx

  say "Requesting the certificate (HTTP check) for: $names"
  local -a args=(--nginx --non-interactive --agree-tos --redirect --cert-name "$domain")
  for n in $names; do args+=(-d "$n"); done
  if ! certbot "${args[@]}"; then
    say "Certificate failed: removing $file again"
    rm -f "$ENABLED/$PREFIX$domain" "$file"
    nginx_reload
    die "No certificate for $domain. Nothing is left behind; see /var/log/letsencrypt/letsencrypt.log."
  fi
  nginx_reload

  say "Done. https://$domain now reaches the Peakwa renderer (certificate renews automatically)."
  echo "   Next: in the dashboard, open the site > Custom domain > Verify. The site moves to"
  echo "   https://$domain only after that check passes."
}

cmd_remove() {
  local domain file
  domain=$(normalize "${1:-}")
  valid_domain "$domain" || die "'${1:-}' is not a client domain."
  file="$AVAILABLE/$PREFIX$domain"
  [[ -e "$file" || -L "$ENABLED/$PREFIX$domain" ]] || die "$domain is not set up here."
  say "Removing the nginx file for $domain"
  rm -f "$ENABLED/$PREFIX$domain" "$file"
  nginx_reload
  if certbot certificates --cert-name "$domain" 2>/dev/null | grep -q "Certificate Name: $domain"; then
    say "Deleting the certificate $domain"
    certbot delete --non-interactive --cert-name "$domain"
  fi
  say "Removed. Remove (or clear) the domain in the dashboard too, so the site's links move back to site.peakwa.com."
}

cmd_list() {
  local f domain
  shopt -s nullglob
  for f in "$AVAILABLE/$PREFIX"*; do
    domain=${f#"$AVAILABLE/$PREFIX"}
    echo "$domain  names: $(grep -m1 -oP 'server_name \K[^;]+' "$f")  certificate: $(certbot certificates --cert-name "$domain" 2>/dev/null | grep -m1 -oP 'Expiry Date: \K.*' || echo none)"
  done
}

[[ $EUID -eq 0 ]] || die "Run as root."
case "${1:-}" in
  add) shift; cmd_add "$@" ;;
  remove) shift; cmd_remove "$@" ;;
  list) cmd_list ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
