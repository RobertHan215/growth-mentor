# MySQL dumps（本地离线）

本地库：`growth_mentor_local` @ `127.0.0.1:3307`（Docker Compose `mysql` 服务）

| 文件 | 说明 |
|------|------|
| `growth-mentor-latest.sql` | 本地库最新全量备份（推荐移交这个） |
| `growth-mentor-YYYYMMDD-HHMMSS.sql` | 带时间戳的快照 |

> **安全：** `*.sql` 含用户哈希 / 业务数据，已在 `.gitignore` 忽略，**不要**强制 add 进 git。  
> 交给评委时用 U 盘 / 压缩包单独带 dump 文件。

## 导出当前本地数据（换机 / 移交前必做）

```bash
pnpm db:up
pnpm db:dump
# -> backups/mysql/growth-mentor-<时间戳>.sql
# -> 同时更新 backups/mysql/growth-mentor-latest.sql
```

## 新电脑 / 评委机恢复

前置：Node ≥ 20、pnpm、Docker。

```bash
# 1. 拿到代码 + dump 文件
git clone <repo> && cd growth-mentor
# 把 growth-mentor-latest.sql 放到 backups/mysql/

# 2. 环境
cp .env.example .env.local
# 按需填 API Key；DATABASE_URL 默认已是本地 Docker

# 3. 依赖 + 库
pnpm install
pnpm db:up
pnpm db:import backups/mysql/growth-mentor-latest.sql

# 4. 启动
pnpm dev:local
# 浏览器 http://localhost:3000
```

默认账号（以 dump 里实际用户为准）：`admin` / `jason` / `robert`。
