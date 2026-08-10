# 时间景观 · Docker 部署（腾讯云 + nginx 子路径 /timeview）

访问地址：**https://124.223.178.244/timeview/** ｜ SSH 端口：**2048**

> 最省事：直接双击 `一键部署.bat`（已内置 IP/端口2048/用户，自动 构建→上传→载入运行）。
> 下面是等价的手动命令（注意 SSH 端口是 2048，scp 用 `-P 2048`、ssh 用 `-p 2048`）。

## 方式 A（你选的）：本机构建镜像 → 上传镜像 → 服务器载入运行
前提：本机装了 Docker Desktop（构建只是 COPY 文件，不跑 npm，很快）。

1. 本机：双击 `本地构建镜像.bat`
   - 它会 `docker build`（linux/amd64）→ `docker save` 出 `timeview-image.tar`。
2. 上传（PowerShell）：
   ```
   scp -P 2048 "D:\workspace\time-view\server\timeview-image.tar" root@124.223.178.244:/root/timeview/
   scp -P 2048 "D:\workspace\time-view\server\服务器载入运行.sh"  root@124.223.178.244:/root/timeview/
   ```
3. 服务器：
   ```
   ssh -p 2048 root@124.223.178.244
   cd /root/timeview
   bash 服务器载入运行.sh
   ```
   它会 `docker load` 镜像并 `docker run`（127.0.0.1:8766，BASE_PATH=/timeview）。
4. 访问 https://124.223.178.244/timeview/ ，自检 /timeview/api/health 应 {"ok":true,...}

> 之后更新：本机重跑 `本地构建镜像.bat` 出新 tar → 上传 → 再 `bash 服务器载入运行.sh`。

---

# 时间景观 · Docker 部署（腾讯云 + nginx 子路径 /timeview）

访问地址：**https://124.223.178.244/timeview/**
nginx 已配置：`/timeview/ → http://127.0.0.1:8766/`（去前缀）。
应用已做子路径适配：服务端注入 `<base href="/timeview/">`，前端全用相对路径，
因此 `进入体验`、`/api/*`、AI 对话在子路径下都能正常工作。

## 一、上传到服务器（Windows PowerShell）
```
scp -P 2048 -r "D:\workspace\time-view\server" root@124.223.178.244:/root/timeview
```
（或用 WinSCP 把 server 文件夹拖到 /root/timeview，端口填 2048）

## 二、构建并启动容器（SSH 登录服务器）
```
ssh -p 2048 root@124.223.178.244
cd /root/timeview
bash build-and-run.sh
```
- 没装 Docker 先装：`curl -fsSL https://get.docker.com | sh`
- 脚本做：复制 timeview.env 模板 → `docker compose up -d --build`
- 容器监听 **127.0.0.1:8766**（仅本机，由 nginx 反代），并设置了 `BASE_PATH=/timeview`

等价手动命令：
```
cp timeview.env.example timeview.env
docker compose up -d --build
```

## 三、验证
- 浏览器打开 **https://124.223.178.244/timeview/** → 介绍首页，点「进入体验」进沙盘。
- 自检 **https://124.223.178.244/timeview/api/health** → 应返回 {"ok":true,...}
- 看日志：`docker logs -f timeview`

## 四、开启 AI 对话（可选，需大模型 Key）
编辑 `/root/timeview/timeview.env` 填 `LLM_API_KEY`（OpenAI 兼容接口）：
- DeepSeek：`LLM_BASE_URL=https://api.deepseek.com/v1`  `LLM_MODEL=deepseek-chat`
- 通义(兼容)：`LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`  `LLM_MODEL=qwen-plus`
- OpenAI：`LLM_BASE_URL=https://api.openai.com/v1`  `LLM_MODEL=gpt-4o-mini`
改完重启：`docker compose up -d`（在 /root/timeview 下）。不填 Key 时 💬 只返回知识库匹配文本。

## 常用
- 更新页面：覆盖 index.html / landing.html 后 `docker compose up -d --build`
- 重启：`docker compose restart`
- 存档持久化在 `/root/timeview/data/archives.json`

## 改回根路径部署（非 /timeview）
把 docker-compose.yml 里 `BASE_PATH` 改空、端口随意，nginx 直接反代到容器根即可。

## 安全
- 你曾在对话里贴过 root 密码：请尽快改密码、改用 SSH 密钥登录。
- 防火墙只放行 2048(SSH)/80/443；容器端口已绑 127.0.0.1，不直接暴露。
