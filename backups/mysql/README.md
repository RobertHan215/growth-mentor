# MySQL dumps（本地离线）

- `university-latest.sql` — 远端 `university` 库全量备份（最新）
- `university-YYYYMMDD.sql` — 带日期的快照

## 已迁入本地的数据（导入后）

本地库：`growth_mentor_local` @ `127.0.0.1:3307`

典型表行数（导入当时）：users / stages / scenes / 角色模板等均已包含。

## 导入

```bash
pnpm db:up
./scripts/db-import-local.sh backups/mysql/university-latest.sql
```

## 重新从远端导出

`.env.local` 中配置 `REMOTE_DATABASE_URL` 后：

```bash
./scripts/db-dump-remote.sh backups/mysql/university-latest.sql
```

> **安全：** `*.sql` 可能含 API Key / 用户哈希，已在 `.gitignore` 中忽略，**不要**强制 add 进 git。
> 文件仍在本机 `backups/mysql/`，用 import 脚本即可恢复。
