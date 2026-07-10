#!/usr/bin/env bash
#
# seed-orders.sh — push captured test orders into the Throttle store via the API.
#
# Uses the same server-side flow the storefront does — create cart, add a line
# item, write the shipping address, open a checkout session, complete it with
# the Card Simulator, then capture the payment — but entirely over the API, so
# no PaymentEmbed / card entry is needed. Requires TEST keys (sk_test_...); the
# Card Simulator connector must be active in the Throttle dashboard.
#
# Usage:
#   scripts/seed-orders.sh [count]        # default 5
#
# Reads THROTTLE_API_KEY / THROTTLE_STORE_ID / THROTTLE_API_BASE_URL from
# .env.local (falls back to https://api.usethrottle.dev).

set -euo pipefail
cd "$(dirname "$0")/.."

COUNT="${1:-5}"
ENV_FILE=".env.local"

read_env () { { grep -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | head -1 | cut -d= -f2- | tr -d '"'"'"'"' ; }
KEY="$(read_env THROTTLE_API_KEY)"
APP="$(read_env THROTTLE_STORE_ID)"
BASE="$(read_env THROTTLE_API_BASE_URL)"; BASE="${BASE:-https://api.usethrottle.dev}"

if [[ -z "$KEY" || -z "$APP" ]]; then
  echo "✗ THROTTLE_API_KEY / THROTTLE_STORE_ID missing from $ENV_FILE" >&2; exit 1
fi
if [[ "$KEY" != sk_test_* ]]; then
  echo "✗ Refusing to run: THROTTLE_API_KEY is not a sk_test_ key (this seeds real orders)." >&2; exit 1
fi

HDR=(-H "X-API-Key: $KEY" -H "content-type: application/json")

# name|unit_price_cents|ref   (cycled)
PRODUCTS=(
  "Slurm Diet 12oz Can|199|slurm-diet-12"
  "Popplers Family Pack|899|popplers-fam"
  "Bending Unit Rotor Cuff|4999|rotor-cuff"
  "Nixon Head Jar (Limited)|12999|nixon-jar"
  "Zoidberg Plush|2499|zoidberg-plush"
  "Slurm Six-Pack|1099|slurm-6pack"
)
# email|first|last|city|state|zip   (cycled)
BUYERS=(
  "fry@planetexpress.test|Philip|Fry|New New York|NY|10001"
  "leela@planetexpress.test|Turanga|Leela|Los Angeles|CA|90001"
  "bender@planetexpress.test|Bender|Rodriguez|Austin|TX|73301"
  "amy@planetexpress.test|Amy|Wong|Seattle|WA|98101"
  "zoidberg@planetexpress.test|John|Zoidberg|Miami|FL|33101"
)

jqpy () { python3 -c "import sys,json;$1"; }

seed_one () {
  local p="${PRODUCTS[$(( $1 % ${#PRODUCTS[@]} ))]}" b="${BUYERS[$(( $1 % ${#BUYERS[@]} ))]}"
  IFS='|' read -r name price ref <<<"$p"
  IFS='|' read -r email fn ln city state zip <<<"$b"
  local qty=$(( ($1 % 3) + 1 ))

  local cid sess resp oid pid
  cid=$(curl -s "${HDR[@]}" -X POST "$BASE/api/v1/carts" \
    -d "{\"applicationId\":\"$APP\",\"currency\":\"USD\",\"metadata\":{\"customerEmail\":\"$email\"}}" \
    | jqpy "print(json.load(sys.stdin)['data']['id'])")
  curl -s "${HDR[@]}" -X POST "$BASE/api/v1/carts/$cid/items" \
    -d "{\"name\":\"$name\",\"unitPrice\":$price,\"quantity\":$qty,\"referenceId\":\"$ref\"}" >/dev/null
  curl -s "${HDR[@]}" -X PATCH "$BASE/api/v1/carts/$cid" \
    -d "{\"shippingAddress\":{\"firstName\":\"$fn\",\"lastName\":\"$ln\",\"addressLine1\":\"1 Demo St\",\"city\":\"$city\",\"stateProvince\":\"$state\",\"postalCode\":\"$zip\",\"countryCode\":\"US\"}}" >/dev/null
  sess=$(curl -s "${HDR[@]}" -X POST "$BASE/api/v1/checkout/sessions" \
    -d "{\"applicationId\":\"$APP\",\"cartId\":\"$cid\",\"customerEmail\":\"$email\",\"returnUrl\":\"about:blank\",\"cancelUrl\":\"about:blank\",\"collect\":{\"shippingAddress\":false,\"billingAddress\":false}}" \
    | jqpy "print(json.load(sys.stdin)['sessionId'])")
  resp=$(curl -s "${HDR[@]}" -X POST "$BASE/api/v1/checkout/sessions/$sess/complete" -d '{"paymentMethod":"card"}')
  oid=$(echo "$resp" | jqpy "print(json.load(sys.stdin).get('orderId',''))")
  if [[ -z "$oid" ]]; then echo "  ✗ complete failed: $resp"; return; fi
  pid=$(curl -s "${HDR[@]}" "$BASE/api/v1/orders/$oid/payments" | jqpy "d=json.load(sys.stdin)['data'];print(d[0]['id'] if d else '')")
  curl -s "${HDR[@]}" -X POST "$BASE/api/v1/orders/$oid/capture" -d "{\"paymentId\":\"$pid\"}" >/dev/null
  local line
  line=$(curl -s "${HDR[@]}" "$BASE/api/v1/orders/$oid" \
    | jqpy "o=json.load(sys.stdin)['data'];print(f\"{o['orderNumber']}  {o['status']}/{o['paymentStatus']}  \${o['total']/100:>8.2f}\")")
  printf '  ✓ %s  %s x%s\n' "$line" "$name" "$qty"
}

echo "Seeding $COUNT captured test order(s) into store $APP …"
for i in $(seq 0 $((COUNT - 1))); do seed_one "$i"; done
echo "Done."
