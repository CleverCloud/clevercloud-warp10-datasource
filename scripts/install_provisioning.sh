#!/bin/sh

## install a warp10 instance
docker run -d -p 8080:8080 -p 8081:8081 warp10io/warp10:3.4.1-alpine &

# run docker compose to set-up grafana with the plugin and provisioning
docker compose up -d
