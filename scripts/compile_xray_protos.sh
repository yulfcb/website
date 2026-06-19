#!/usr/bin/env bash
# 编译 xray gRPC stubs 到 ./.xray_pb
# 用法：bash scripts/compile_xray_protos.sh
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_SRC="/root/yulei/code/vpn-server/scripts/xray-protos"
OUT_DIR="$PROJECT_ROOT/.xray_pb"

if [ ! -d "$PROTO_SRC" ]; then
  echo "[ERROR] 找不到 proto 源目录：$PROTO_SRC"
  exit 1
fi

mkdir -p "$OUT_DIR"
cd "$PROJECT_ROOT"
source venv/bin/activate

python -m grpc_tools.protoc -I "$PROTO_SRC" \
  --python_out="$OUT_DIR" \
  --grpc_python_out="$OUT_DIR" \
  "$PROTO_SRC/app/proxyman/command/command.proto" \
  "$PROTO_SRC/app/stats/command/command.proto" \
  "$PROTO_SRC/proxy/vless/inbound/config.proto" \
  "$PROTO_SRC/proxy/vless/account.proto" \
  "$PROTO_SRC/common/protocol/user.proto" \
  "$PROTO_SRC/common/serial/typed_message.proto" \
  "$PROTO_SRC/core/config.proto" \
  "$PROTO_SRC/transport/global/config.proto" \
  "$PROTO_SRC/transport/internet/config.proto"

# 把生成代码里的包名从 app. 改成 xrayapi.（避开项目里的 app.py）
if [ -d "$OUT_DIR/app" ]; then
  find "$OUT_DIR" -type d -exec touch {}/__init__.py \;
  mv "$OUT_DIR/app" "$OUT_DIR/xrayapi"
  find "$OUT_DIR" -name "*.py" -exec sed -i 's|from app\.|from xrayapi.|g; s|^import app\.|import xrayapi.|g' {} +
fi

echo "[OK] 编译完成：$OUT_DIR"
