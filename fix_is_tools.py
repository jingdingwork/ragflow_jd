"""
一次性脚本：把 deepseek-v4-pro 在 tenant_llm 层的 is_tools 强制置为 True。

原因：tenant_llm.api_key 被存成了 JSON，内含 is_tools:false，优先级高于 llm 目录表，
把工具调用能力挡掉了（get_model_config_by_type_and_name 里 api_key 解码出的 is_tools
会覆盖目录表兜底）。这里保留真实 api_key 不变，只把 is_tools 翻成 True。

运行（项目根目录）：
    python.exe fix_is_tools.py
"""

from api.db.db_models import TenantLLM
from api.db.services.tenant_llm_service import TenantLLMService

NAME = "deepseek-v4-pro"


def _mask(k: str) -> str:
    if not k:
        return "<empty>"
    return (k[:6] + "..." + k[-4:]) if len(k) > 12 else k


rows = list(TenantLLM.select().where(TenantLLM.llm_name == NAME))
print(f"[before] {len(rows)} tenant_llm row(s) named {NAME!r}:")
for r in rows:
    raw, is_tools, _ = TenantLLMService._decode_api_key_config(r.api_key or "")
    print(f"   id={r.id} tenant={r.tenant_id} factory={r.llm_factory} "
          f"decoded_is_tools={is_tools} key={_mask(raw)}")

fixed = 0
for r in rows:
    raw, _is, _ = TenantLLMService._decode_api_key_config(r.api_key or "")
    new_key = TenantLLMService._encode_api_key_config(raw, True)  # 保留真实 key，仅置 is_tools=True
    TenantLLM.update(api_key=new_key).where(TenantLLM.id == r.id).execute()
    fixed += 1
print(f"[fix] {fixed} row(s) re-encoded with is_tools=True")

print("[after]")
for r in TenantLLM.select().where(TenantLLM.llm_name == NAME):
    raw, is_tools, _ = TenantLLMService._decode_api_key_config(r.api_key or "")
    print(f"   id={r.id} factory={r.llm_factory} decoded_is_tools={is_tools} key={_mask(raw)}")

print("done. 重启 ragflow_server，然后开新会话测试。")
