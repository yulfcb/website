"""
Xray gRPC 客户端
- 用 AddUserOperation / RemoveUserOperation 动态增删 inbound 用户
- 用 QueryStats 拉取用户流量
"""
from __future__ import annotations  # 推迟 type hint 评估

import logging
import os
import sys
import grpc

log = logging.getLogger("xray-client")

# gRPC stubs 编译自 xray proto。
# 优先 XRAY_PB_DIR；缺省时尝试 (1) /opt/xray_pb（容器内）、(2) 项目下 .xray_pb（本地开发）
_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PB = "/opt/xray_pb"
_LOCAL_PB = os.path.join(_PROJECT_ROOT, ".xray_pb")
_XRAY_PB_DIR = os.environ.get("XRAY_PB_DIR")
if not _XRAY_PB_DIR:
    if os.path.isdir(_DEFAULT_PB):
        _XRAY_PB_DIR = _DEFAULT_PB
    elif os.path.isdir(_LOCAL_PB):
        _XRAY_PB_DIR = _LOCAL_PB
if _XRAY_PB_DIR and os.path.isdir(_XRAY_PB_DIR) and _XRAY_PB_DIR not in sys.path:
    sys.path.insert(0, _XRAY_PB_DIR)

stats_cmd_pb = None
stats_cmd_grpc = None
pm_cmd_pb = None
pm_cmd_grpc = None
user_pb = None
tm_pb = None
VlessAccount = None
_PROTOS_OK = False

try:
    from xrayapi.stats.command import command_pb2 as _stats_cmd_pb
    from xrayapi.stats.command import command_pb2_grpc as _stats_cmd_grpc
    from xrayapi.proxyman.command import command_pb2 as _pm_cmd_pb
    from xrayapi.proxyman.command import command_pb2_grpc as _pm_cmd_grpc
    from common.protocol import user_pb2 as _user_pb
    from common.serial import typed_message_pb2 as _tm_pb
    from proxy.vless.account_pb2 import Account as _VlessAccount
    stats_cmd_pb = _stats_cmd_pb
    stats_cmd_grpc = _stats_cmd_grpc
    pm_cmd_pb = _pm_cmd_pb
    pm_cmd_grpc = _pm_cmd_grpc
    user_pb = _user_pb
    tm_pb = _tm_pb
    VlessAccount = _VlessAccount
    _PROTOS_OK = True
    del _stats_cmd_pb, _stats_cmd_grpc, _pm_cmd_pb, _pm_cmd_grpc
    del _user_pb, _tm_pb, _VlessAccount
except Exception as e:
    log.warning(f"[xray-client] gRPC stubs 未加载: {e}")


XRAY_API_ADDR = os.environ.get("VPN_XRAY_GRPC", os.environ.get("XRAY_API_ADDR", "127.0.0.1:10085"))
INBOUND_TAG = "vless-in"  # 与 xray config.json 中的 inbound tag 对应


def _channel():
    return grpc.insecure_channel(
        XRAY_API_ADDR,
        options=[
            ("grpc.keepalive_time_ms", 30000),
            ("grpc.keepalive_timeout_ms", 10000),
        ],
    )


def _vless_account_msg(uuid_str):
    """构造 xray.proxy.vless.Account 的 TypedMessage"""
    acct = VlessAccount()
    acct.id = uuid_str
    acct.flow = ""
    tm = tm_pb.TypedMessage()
    tm.type = "xray.proxy.vless.Account"
    tm.value = acct.SerializeToString()
    return tm


def add_user(uuid_str: str, email: str) -> bool:
    """通过 AddUserOperation 动态添加一个 VLESS 用户。
    若 xray 已存在同名 email（"User ... already exists"），视为成功 —— 目标状态已达成。
    """
    if not _PROTOS_OK:
        log.warning("[xray-client] stub 未加载，add_user 跳过")
        return False
    try:
        user = user_pb.User(email=email, account=_vless_account_msg(uuid_str))
        op = pm_cmd_pb.AddUserOperation(user=user)
        op_tm = tm_pb.TypedMessage()
        op_tm.type = "xray.app.proxyman.command.AddUserOperation"
        op_tm.value = op.SerializeToString()

        req = pm_cmd_pb.AlterInboundRequest(tag=INBOUND_TAG, operation=op_tm)
        ch = _channel()
        stub = pm_cmd_grpc.HandlerServiceStub(ch)
        stub.AlterInbound(req, timeout=5)
        log.info(f"[xray-client] add_user OK: {email} ({uuid_str[:8]}…)")
        return True
    except grpc.RpcError as e:
        # "already exists" 在启动同步场景里其实是目标状态（用户已在 xray），
        # 启动重试无意义 —— 重试只会一直报这个错。
        details = (e.details() or "").lower() if hasattr(e, "details") else ""
        if "already exists" in details:
            log.info(f"[xray-client] add_user {email}: 已存在于 xray，跳过")
            return True
        log.error(f"[xray-client] add_user 失败 {email}: {e}")
        return False


def remove_user(email: str) -> bool:
    """通过 RemoveUserOperation 删除用户（按 email）"""
    if not _PROTOS_OK:
        return False
    try:
        op = pm_cmd_pb.RemoveUserOperation(email=email)
        op_tm = tm_pb.TypedMessage()
        op_tm.type = "xray.app.proxyman.command.RemoveUserOperation"
        op_tm.value = op.SerializeToString()

        req = pm_cmd_pb.AlterInboundRequest(tag=INBOUND_TAG, operation=op_tm)
        ch = _channel()
        stub = pm_cmd_grpc.HandlerServiceStub(ch)
        stub.AlterInbound(req, timeout=5)
        log.info(f"[xray-client] remove_user OK: {email}")
        return True
    except grpc.RpcError as e:
        log.error(f"[xray-client] remove_user 失败 {email}: {e}")
        return False


def query_user_traffic_by_email(email: str) -> tuple:
    """用 email 查询（add_user 时我们用 username 作为 email 传给 xray）"""
    if not _PROTOS_OK:
        return (0, 0)
    pattern_up = f"user>>>{email}>>>traffic>>>uplink"
    pattern_dn = f"user>>>{email}>>>traffic>>>downlink"
    up = dn = 0
    try:
        ch = _channel()
        stub = stats_cmd_grpc.StatsServiceStub(ch)
        for pat, var in ((pattern_up, "up"), (pattern_dn, "dn")):
            try:
                resp = stub.QueryStats(stats_cmd_pb.QueryStatsRequest(pattern=pat, reset=False))
                for s in resp.stat:
                    if s.name == pat:
                        if var == "up":
                            up = s.value
                        else:
                            dn = s.value
            except grpc.RpcError:
                pass
        return (up, dn)
    except grpc.RpcError as e:
        log.error(f"[xray-client] query_user_traffic 失败 {email}: {e}")
        return (0, 0)


def query_inbound_total() -> tuple:
    """查询整个 inbound 的总流量"""
    if not _PROTOS_OK:
        return (0, 0)
    up = dn = 0
    try:
        ch = _channel()
        stub = stats_cmd_grpc.StatsServiceStub(ch)
        for pat, var in (
            ("inbound>>>vless-in>>>traffic>>>uplink", "up"),
            ("inbound>>>vless-in>>>traffic>>>downlink", "dn"),
        ):
            try:
                resp = stub.QueryStats(stats_cmd_pb.QueryStatsRequest(pattern=pat, reset=False))
                for s in resp.stat:
                    if s.name == pat:
                        if var == "up":
                            up = s.value
                        else:
                            dn = s.value
            except grpc.RpcError:
                pass
        return (up, dn)
    except grpc.RpcError as e:
        log.error(f"[xray-client] query_inbound_total 失败: {e}")
        return (0, 0)


def test_connection() -> bool:
    """测试 gRPC 通道是否可达"""
    if not _PROTOS_OK:
        return False
    try:
        ch = _channel()
        grpc.channel_ready_future(ch).result(timeout=5)
        return True
    except Exception as e:
        log.warning(f"[xray-client] gRPC 不可达 {XRAY_API_ADDR}: {e}")
        return False
