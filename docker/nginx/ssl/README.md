# HTTPS 证书目录

**证书只放一次，跟发版无关。** 生产部署（`docker-compose-deploy.yml`）挂的是宿主机
`${NGINX_SSL_DIR}`（当前 `/data/ssh_pem/ragflow_jd`），在 Jenkins 工作区
`/data/project/ragflow_jd` 之外，所以重新构建镜像、`git checkout`、`docker compose up -d`
都不会碰到它 —— 和 `.env` 一样。本目录（`docker/nginx/ssl/`）只是本地开发用的默认位置。

容器内挂载点：`/etc/nginx/ssl`（只读）。需要两个文件：

| 作用 | 当前文件名 | 说明 |
| --- | --- | --- |
| 证书 | `cert.pem` | 服务器证书 **+ 中间 CA 链**（服务器证书在前，中间证书在后） |
| 私钥 | `key.pem` | 与证书配对的私钥，**不带口令** |

路径由 `docker/.env` 的 `NGINX_SSL_CERT` / `NGINX_SSL_KEY` 指定（写容器内路径）。
留空时 entrypoint 会按 `fullchain.pem → cert.pem → server.crt → server.pem → tls.crt`
（私钥 `privkey.pem → key.pem → server.key → tls.key`）的顺序自动识别。
本目录下的 `*.pem` / `*.key` / `*.crt` / `*.pfx` 已在 `.gitignore` 中排除，不会被提交。

## 工作方式（为什么重启不会乱）

`docker/entrypoint.sh` 每次启动都会：

1. 按 `API_PROXY_SCHEME` 把 `ragflow.conf.<scheme>` 复制成 `conf.d/ragflow.conf`
   —— 所以**不要**手改容器内的 `ragflow.conf`，也不要把它挂载出来，改动会被覆盖；
2. 重新生成 `conf.d/ssl_enable/ssl.conf`（`listen 443 ssl` + 证书路径 + TLS 参数），
   该片段被 `ragflow.conf.*` 里的 `include /etc/nginx/conf.d/ssl_enable/*.conf;` 引入；
3. 用 `nginx -t` 验证；证书缺失或不合法就**自动退回纯 HTTP**，不会让容器起不来。

证书本体在宿主机，配置由脚本每次重算，所以重启、换镜像、`docker compose down/up`
都不会丢失或错乱。

## 常用命令

```bash
# 1. 上线前自检：私钥与证书是否配对（两行 hash 必须一致）
cd /data/ssh_pem/ragflow_jd
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa  -noout -modulus -in key.pem  | openssl md5
# 证书链是否完整（只有 1 张且不是自签，就要把中间 CA 追加到 cert.pem 末尾）
openssl crl2pkcs7 -nocrl -certfile cert.pem | openssl pkcs7 -print_certs -noout
# 有效期与 SAN（用 IP 访问就必须含 IP:172.27.1.91）
openssl x509 -noout -dates -subject -ext subjectAltName -in cert.pem
chmod 600 key.pem

# 2. 首次生效：加了新 volume，必须 recreate（跑一次 Jenkins 发版也等效）
cd /data/project/ragflow_jd/docker
docker compose -f docker-compose-deploy.yml up -d --force-recreate
docker logs ragflow_jd 2>&1 | grep '\[nginx\]'
curl -kIv https://172.27.1.91/ 2>&1 | grep -E 'HTTP/|subject:|issuer:'

# 3. 续期：只换文件 + reload，不用重启容器、不用发版
sudo cp new-cert.pem /data/ssh_pem/ragflow_jd/cert.pem
sudo cp new-key.pem  /data/ssh_pem/ragflow_jd/key.pem
docker exec ragflow_jd nginx -t && docker exec ragflow_jd nginx -s reload

# 4. 自签测试证书（内网 IP 用，浏览器会告警）
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/C=CN/O=CTCI/CN=172.27.1.91" \
  -addext "subjectAltName=IP:172.27.1.91,DNS:localhost"
```

本地开发（`docker-compose.yml`）把证书丢进 `docker/nginx/ssl/` 即可，容器名是 `ragflow-server`。

## 相关环境变量（`docker/.env`）

- `NGINX_SSL_DIR` —— 宿主机证书目录，整体只读挂载到 `/etc/nginx/ssl`。
- `NGINX_SSL_CERT` / `NGINX_SSL_KEY` —— 容器内证书/私钥路径，留空则自动识别常见文件名。
- `ENABLE_HTTPS=auto|true|false` —— `auto`（默认）有证书就开；`true` 时缺证书会在日志里报警告；`false` 强制关闭。
- `FORCE_HTTPS=true` —— 80 端口 301 跳到 443。开之前先把 `OIDC_REDIRECT_URI` 改成 `https://...`
  并同步 Keycloak client 的 Valid redirect URIs，否则单点登录会失败。
- `SVR_WEB_HTTPS_PORT` —— 宿主机暴露的 HTTPS 端口，默认 443（`docker-compose-deploy.yml` 里写死 443）。
