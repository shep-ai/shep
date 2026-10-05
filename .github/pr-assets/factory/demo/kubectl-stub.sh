#!/usr/bin/env bash
# Stub kubectl for the demo: answers like a healthy cluster for whatever
# deployment it is asked about, and logs every call it receives.
echo "kubectl $*" >> "$(dirname "$0")/kubectl.log"
args="$*"
name="$(printf '%s' "$args" | grep -oE 'deployment/[a-z0-9.-]+' | head -1 | cut -d/ -f2)"
# `get events` covers the whole namespace; name the workload last asked about
last="$(dirname "$0")/last-workload"
if [ -n "$name" ]; then printf '%s' "$name" > "$last"; else name="$(cat "$last" 2>/dev/null)"; fi
name="${name:-app}"
case "$args" in
  *"rollout restart"*) echo "deployment.apps/$name restarted" ;;
  *"rollout undo"*) echo "deployment.apps/$name rolled back" ;;
  *"scale"*) echo "deployment.apps/$name scaled" ;;
  *"rollout status"*) echo "deployment \"$name\" successfully rolled out" ;;
  *"get deployment"*)
    printf 'NAME       READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES\n%s   1/3     3            1           2d    %s   registry.acme.dev/%s:4.12.0\n' "$name" "$name" "$name" ;;
  *"events"*)
    # asked alongside `get deployment`; let that call record the workload first
    sleep 0.3
    name="$(cat "$last" 2>/dev/null || echo app)"
    printf 'LAST SEEN   TYPE      REASON              OBJECT                  MESSAGE\n2m          Normal    ScalingReplicaSet   deployment/%s   Scaled up replica set %s-7d9 to 3\n1m          Warning   BackOff             pod/%s-7d9-x2k   Back-off restarting failed container\n' "$name" "$name" "$name" ;;
  *"logs"*)
    printf 'ERROR TaxClient: unexpected field "jurisdiction" in response (4.12.0)\nERROR POST /%s 502 upstream tax-service\n' "$name" ;;
  *) echo "ok" ;;
esac
