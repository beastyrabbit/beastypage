#!/bin/sh
set -eu

NAMESPACE="${IMPORT_CLEANUP_NAMESPACE:-webpage}"
POD_NAME="${IMPORT_CLEANUP_POD:-beastypage-postgres-import}"
FLUX_NAMESPACE="${LOGIN_FLUX_NAMESPACE:?LOGIN_FLUX_NAMESPACE is required}"
FLUX_KUSTOMIZATION="${LOGIN_FLUX_KUSTOMIZATION:?LOGIN_FLUX_KUSTOMIZATION is required}"

fail() {
  echo "cleanup failed: $*" >&2
  exit 1
}

if ! kubectl -n "$NAMESPACE" delete pod "$POD_NAME" --ignore-not-found --wait=true; then
  fail "could not delete pod/$POD_NAME"
fi

if ! kubectl -n "$NAMESPACE" wait --for=delete "pod/$POD_NAME" --timeout=2m >/dev/null 2>&1; then
  if [ -n "$(kubectl -n "$NAMESPACE" get pod "$POD_NAME" --ignore-not-found -o name)" ]; then
    fail "pod/$POD_NAME still exists after the delete wait"
  fi
fi

if ! flux -n "$FLUX_NAMESPACE" reconcile kustomization "$FLUX_KUSTOMIZATION" \
  --with-source --timeout=10m; then
  fail "Flux kustomization $FLUX_KUSTOMIZATION did not reconcile"
fi

ROLE_CAN_LOGIN="$(kubectl -n "$NAMESPACE" cnpg psql beastypage-postgres -- -Atqc \
  "select rolcanlogin from pg_roles where rolname = 'beastypage_import'")" \
  || fail "could not verify beastypage_import login state"
if [ "$(printf '%s' "$ROLE_CAN_LOGIN" | tr -d '[:space:]')" != "f" ]; then
  fail "beastypage_import still permits login; merge the reviewed login:false change and rerun this script"
fi

echo "[cleanup] pod removed, Flux reconciled, beastypage_import login is disabled"
