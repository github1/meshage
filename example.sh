#!/usr/bin/env bash

# Usage examples
# ./example.sh -X POST -d '{"message":"hi"}'

CLUSTER_NODE=$(docker ps | grep 'meshage_node-member' | awk '{print $1}')

if [[ -z "${CLUSTER_NODE}" ]]; then
  echo "cluster node not found"
  exit 0
fi

docker run --rm -it --network="container:${CLUSTER_NODE}" curlimages/curl:7.70.0 \
 -s -H 'Content-Type: application/json' "http://${CLUSTER_NODE}:8080/api/echo/${RANDOM}" "$@" | jq
