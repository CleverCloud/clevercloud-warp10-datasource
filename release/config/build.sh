#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${GRAFANA_VERSION}" ]]; then
  echo "No GRAFANA_VERSION environment variable set"
  exit 1
fi

wget https://dl.grafana.com/oss/release/grafana-${GRAFANA_VERSION}.linux-amd64.tar.gz
echo "${GRAFANA_SHA_256}  grafana-${GRAFANA_VERSION}.linux-amd64.tar.gz" | sha256sum -c
tar -zxf grafana-${GRAFANA_VERSION}.linux-amd64.tar.gz

# Check if directory exists with or without 'v' prefix and move accordingly
if [ -d "grafana-${GRAFANA_VERSION}" ]; then
    mv grafana-${GRAFANA_VERSION} grafana
elif [ -d "grafana-v${GRAFANA_VERSION}" ]; then
    mv grafana-v${GRAFANA_VERSION} grafana
else
    echo "Error: Neither grafana-${GRAFANA_VERSION} nor grafana-v${GRAFANA_VERSION} directory found"
    exit 1
fi

cd grafana

mkdir -p data/plugins

## Load custom plugins (set in GRAFANA_PLUGINS env variable)

cd data/plugins
plugins="${GRAFANA_PLUGINS}"
readarray -td, array <<<"$plugins,"
unset 'array[-1]'
for plugin in "${array[@]}"
do
  if [[ $plugin =~ ^https?://.*/releases/download/.*$ ]];
      then
        filename=$(echo "$plugin" | sed 's|.*/\(.*\)\.zip$|\1|')
        echo "Downloading $plugin to $filename"
        wget "$plugin"
        unzip "$filename.zip"
        rm "$filename.zip"
      else
        if [[ $plugin =~ ^https?://.*/tree/.*$ ]];
              then
                repo="$(echo "$plugin" | sed -E 's|/tree/.*||').git"
                branch=$(echo "$plugin" | sed -E 's|.*/tree/||')
                git clone --branch $branch --single-branch "$repo"
              else
                if [[ $plugin == http* ]]
                  then
                    git clone "$plugin"
                  else
                    name=${plugin%%:*}
                    version=${plugin##*:}
                    if [ "$name" != "$version" ];
                    then
                      cd ../..
                      ./bin/grafana cli plugins install "$name" "$version"
                      cd data/plugins
                    else
                      cd ../..
                      ./bin/grafana cli plugins install "$name"
                      cd data/plugins
                    fi
                  fi
          fi
  fi
done
