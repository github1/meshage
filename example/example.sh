#!/usr/bin/env bash

CLUSTER_NODE=$(docker ps | grep 'example_node-member' | awk '{print $1}')

if [[ -z "${CLUSTER_NODE}" ]]; then
  echo "cluster node not found"
  exit 0
fi

docker exec \
    -it ${CLUSTER_NODE} \
    curl http://localhost:8080/api/echo/$RANDOM | jq .
