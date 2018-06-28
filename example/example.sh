#!/usr/bin/env bash

docker exec \
    -it $(docker ps | grep node-a | awk '{print $1}') \
    curl http://localhost:8080/api/echo/$RANDOM | jq
