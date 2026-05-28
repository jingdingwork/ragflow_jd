# RAGFlow 启动

## 安装 Task Buttons 扩展（一次性）

`Ctrl+Shift+X` → 搜索 `Task Buttons` → 安装 **spencerwmiles.vscode-task-buttons**

安装后**重载窗口**（`Ctrl+Shift+P` → `Reload Window`），底部状态栏会出现 5 个按钮：

```
[🔄 重启]  [🖥 API]  [⚙ Task]  [🌐 Web]  [⏹ 停止]
```

点击即跑，对应任务定义在 [.vscode/tasks.json](.vscode/tasks.json)，按钮配置在 [.vscode/settings.json](.vscode/settings.json)。

## 访问

- 前端：http://localhost:9222
- 后端：http://localhost:9380

## OIDC 配置（[conf/service_conf.yaml](conf/service_conf.yaml)）

```yaml
oauth:
  oidc:
    client_id: yhj
    issuer: http://172.27.1.57:8080/realms/JDEC
    redirect_uri: http://172.27.202.192:9380/api/v1/auth/oauth/oidc/callback
```

## 常见问题

- **按钮没出现** —— `Reload Window` 一次；或确认扩展已启用
- **datrie 缺失** —— `copy D:\work\canda\envs\python312\Lib\site-packages\datrie.cp312-win_amd64.pyd .venv\Lib\site-packages\`
- **NLTK wordnet** —— `.venv\Scripts\python.exe -c "import nltk; nltk.download('wordnet')"`
