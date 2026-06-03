# RAGFlow 启动

## 安装 Task Buttons 扩展（一次性）

`Ctrl+Shift+X` → 搜索 `Task Buttons` → 安装 **spencerwmiles.vscode-task-buttons**

安装后**重载窗口**（`Ctrl+Shift+P` → `Reload Window`），底部状态栏会出现 6 个按钮：

```
[🔄 重启]  [🖥 API]  [⚙ Task]  [🛡 Admin]  [🌐 Web]  [⏹ 停止]
```

点击即跑，对应任务定义在 [.vscode/tasks.json](.vscode/tasks.json)，按钮配置在 [.vscode/settings.json](.vscode/settings.json)。

## 访问

- 前端：http://localhost:9222
- 后端 API：http://localhost:9380
- Admin Server：http://localhost:9381（处理 `/api/v1/admin/*`，登录必需）

> 三个后端服务必须**全部启动**，缺 Admin Server 会导致登录报 `404 Not Found: /api/v1/admin/login`。nginx 已按 `/api/v1/admin → 9381`、其余 `/api|/v1 → 9380` 分流，详见 nginx 配置。

## OIDC 配置（[conf/service_conf.yaml](conf/service_conf.yaml)）

```yaml
oauth:
  oidc:
    client_id: yhj
    issuer: http://172.27.1.57:8080/realms/JDEC
    redirect_uri: http://172.27.202.192:9380/api/v1/auth/oauth/oidc/callback
```

## 部门管理（OIDC → 部门树）

管理后台「部门管理」的数据来自 Keycloak 用户的 LDAP `LDAP_ENTRY_DN`，按 **DN 中第一个 OU** 判定用户所属部门，并用完整 OU 链构建部门树。两条数据来源：

1. **用户 OIDC 登录时**自动写入/刷新该用户的部门。
2. 管理后台「部门管理 → Sync departments」按钮，调 Keycloak Admin API **全量同步**所有用户（含从未登录过的）。

### 一、Protocol Mapper（让 OIDC 登录能拿到 DN）

Keycloak → Realm **JDEC** → **Clients** → `yhj` → **Client scopes** → `yhj-dedicated` → **Add mapper → By configuration → User Attribute**：

| 字段 | 值 |
|------|----|
| Name | `ldap-entry-dn` |
| User Attribute | `LDAP_ENTRY_DN` |
| Token Claim Name | `ldap_entry_dn` |
| Claim JSON Type | `String` |
| Add to ID token | ON |
| Add to userinfo | ON |

> 后端代码读取的 claim 名固定为 `ldap_entry_dn`。验证：Client `yhj` → **Client scopes → Evaluate**，选一个用户看 Generated ID Token 是否含 `ldap_entry_dn`。

### 二、Service Account（让「全量同步」能调 Admin API）

「Sync departments」用 client `yhj` 的 `client_credentials` 拿管理员 token 读用户列表，需启用服务账号并授权：

1. **Clients → `yhj` → Settings**：`Client authentication` = ON，勾选 **Service accounts roles**，Save
2. **Clients → `yhj` → Service account roles → Assign role**：切到 **Filter by clients**，分配 `realm-management` 的 **`view-users`**（建议加 `query-users`）

> 同步按**邮箱**匹配本地用户与 Keycloak 用户，二者 email 必须一致。返回统计：`updated`（已更新）/`unchanged`（无变化）/`no_dn`（Keycloak 无该邮箱或无 DN）/`no_ou`（DN 无 OU）。

## 常见问题

- **按钮没出现** —— `Reload Window` 一次；或确认扩展已启用
- **datrie 缺失** —— `copy D:\work\canda\envs\python312\Lib\site-packages\datrie.cp312-win_amd64.pyd .venv\Lib\site-packages\`
- **NLTK wordnet** —— `.venv\Scripts\python.exe -c "import nltk; nltk.download('wordnet')"`
