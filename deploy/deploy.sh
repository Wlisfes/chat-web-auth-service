#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
SERVICE_VERSION=${SERVICE_VERSION:-${IMAGE##*:}}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=auth-service
CONTAINER=chat-web-auth-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-8}
deployment_started=0

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE" >&2
    exit 1
fi

if [ ! -f .env ]; then
    echo "Missing $(pwd)/.env; create it from deploy/.env.example before the first deployment." >&2
    exit 1
fi

old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" SERVICE_VERSION="$SERVICE_VERSION" docker compose -f "$COMPOSE_FILE" "$@"
}

rollback() {
    echo "Deployment failed; showing the latest container logs." >&2
    docker logs --tail 100 "$CONTAINER" 2>&1 || true

    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        echo "Rolling back to $old_image" >&2
        IMAGE="$old_image" SERVICE_VERSION="${old_image##*:}" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
    else
        echo "No previous image is available for rollback." >&2
    fi
}

trap 'deployment_started=0; rollback; exit 130' HUP INT TERM

attempt=1
while ! docker pull "$IMAGE"; do
    if [ "$attempt" -ge "$PULL_ATTEMPTS" ]; then
        echo "Failed to pull $IMAGE after $PULL_ATTEMPTS attempts." >&2
        exit 1
    fi
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
done

network=$(sed -n 's/^DOCKER_NETWORK=//p' .env | tail -n 1 | tr -d '\r')
network=${network:-chat-web-infrastructure}
case "$network" in
    *[!A-Za-z0-9_.-]*|'')
        echo "Invalid DOCKER_NETWORK in .env" >&2
        exit 1
        ;;
esac
docker network inspect "$network" >/dev/null 2>&1 || {
    echo "Required Docker network is unavailable: $network" >&2
    exit 1
}

# 鉴权服务与账号服务共享 chat_web_account 数据库，表结构由账号服务负责发布，这里不执行任何迁移。
echo "Starting $SERVICE"
deployment_started=1
if ! compose up -d --no-deps "$SERVICE"; then
    rollback
    exit 1
fi

elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
    case "$state" in
        healthy)
            if ! docker exec "$CONTAINER" node -e "require('http').get('http://127.0.0.1:5050/health/ready', response => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; then
                echo "Auth readiness endpoint failed after the container became healthy." >&2
                rollback
                exit 1
            fi
            register_ip=$(sed -n 's/^NACOS_REGISTER_IP=//p' .env | tail -n 1 | tr -d '\r')
            if [ -n "$register_ip" ]; then
                if ! printf '%s' "$register_ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
                    echo "NACOS_REGISTER_IP must be a valid IPv4 address: $register_ip" >&2
                    rollback
                    exit 1
                fi
                if ! docker exec -e CHECK_IP="$register_ip" chat-web-gateway-service node -e 'fetch("http://" + process.env.CHECK_IP + ":5050/health").then(async response => { const body = await response.text(); console.log("Nacos register IP probe status=" + response.status + " body=" + body); if (response.status !== 200) process.exit(1); }).catch(error => { console.error(String(error)); process.exit(1); })'; then
                    echo "NACOS_REGISTER_IP=${register_ip}:5050 is not reachable from Gateway. Docker port publishing to the WireGuard address may not work on Windows. Unset NACOS_REGISTER_IP so the service registers the container network IP." >&2
                    rollback
                    exit 1
                fi
            fi
            echo "Deployment succeeded: $IMAGE"
            trap - HUP INT TERM
            docker image prune -f >/dev/null 2>&1 || true
            exit 0
            ;;
        exited|dead|unhealthy)
            echo "Container state: $state" >&2
            rollback
            exit 1
            ;;
    esac
    sleep 5
    elapsed=$((elapsed + 5))
done

echo "Health check timed out after ${HEALTH_TIMEOUT}s." >&2
rollback
exit 1
