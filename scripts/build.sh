mkdir -p proto/google/api

echo "fetching version: $npm_package_config_broker_version"

curl "https://raw.githubusercontent.com/sparkswap/broker/$npm_package_config_broker_version/broker-daemon/proto/broker.proto" -o proto/broker.proto
curl "https://raw.githubusercontent.com/sparkswap/broker/$npm_package_config_broker_version/broker-daemon/proto/google/api/annotations.proto" -o proto/google/api/annotations.proto
curl "https://raw.githubusercontent.com/sparkswap/broker/$npm_package_config_broker_version/broker-daemon/proto/google/api/http.proto" -o proto/google/api/http.proto
