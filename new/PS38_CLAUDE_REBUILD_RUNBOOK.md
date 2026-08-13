# PS38 Claude: перенос рабочей системы и запасное восстановление

Статус документа: основной runbook точного переноса плюс clean-room fallback. Рабочий снимок сделан 2026-08-13 перед полной переустановкой `dev`.

## Решение при миграции

На новую Ubuntu переносится подтверждённо рабочая система, а не только Markdown:

- точный active release Claude Code `2.1.226` и custom gateway/bridge source;
- wrapper `/usr/local/bin/claude`, managed policy и exact systemd units;
- OAuth token, согласованная копия `ai-queue.db`, user state и нужные SSH credentials — только внутри age-архива;
- active user tunnel `pin888-tcp-unix-proxy.service`;
- этот runbook как карта восстановления и clean-room fallback.

Проверенный supplement: `dev-20260813T191053Z-ps38-supplement.tar.age`, SHA256 `aff448386074f0877ac010d4758afab443cc394e4ab5bff0738cb7cb6b608edd`. Hash совпал на старом `dev`, Mac и `serverforvovka`; на Mac архив полностью расшифрован, `zstd -t` и чтение всех tar-members прошли.

Не переносить логи, старые debug/cache, семь неактивных release-копий и сломанный five-minute autoupdate enable-state.

## Важное ограничение

Кастомные компоненты не находились в Git-репозитории и существовали только внутри локальных release-каталогов:

- `ai-queue-oauth-proxy`;
- `ps38-http-socks-bridge.py`;
- `claude-ps38`;
- `ps38-claude-capture-token.py`;
- workspace/reconcile modules.

Теперь эти компоненты сохранены в проверенном encrypted supplement вместе с hash manifest, поэтому точное восстановление возможно. После cutover их нужно вынести в private Git repository с тестами: внешний архив не должен навсегда оставаться единственной копией source.

Если нужен просто обычный Claude Code без выделенного PS38-профиля и SOCKS-маршрутизации, не восстанавливать эту систему вообще: установить актуальный официальный Claude Code и пройти его штатную авторизацию.

## Что решала система

PS38 Claude позволял запускать Claude Code под подписочным OAuth-профилем `subscription@ps38-dev`, причём Anthropic-трафик обязан был выходить через назначенный SOCKS5-прокси.

```text
Claude Code wrapper
        |
        | ANTHROPIC_BASE_URL / local API request
        v
127.0.0.1:19012  OAuth gateway
        |
        | HTTPS via HTTP CONNECT
        v
127.0.0.1:19011  HTTP-to-SOCKS bridge
        |
        | authenticated SOCKS5, remote DNS
        v
allowed Anthropic/Claude hosts:443
```

Отдельный SSH tunnel с историческим именем `pin888-tcp-unix-proxy.service` подключается к центральному серверу `secret` и создаёт:

- `127.0.0.1:19100 -> secret:19100`;
- `127.0.0.1:19013 -> secret:9013`.

Проверка active runtime подтвердила живой SSH-сеанс и loopback listeners. Для безболезненного cutover tunnel возвращается до запуска bridge/gateway. После стабилизации его назначение можно документировать точнее и переименовать отдельно, но не одновременно с миграцией.

## Состояние на момент снимка

- OAuth gateway: `ps38-claude-oauth-proxy.service`, active, `127.0.0.1:19012`.
- Egress bridge: `ps38-claude-egress-bridge.service`, active, `127.0.0.1:19011`.
- Bridge `/health` отвечает `200 {"status":"ok"}`.
- Gateway health с обязательными headers `X-AI-Provider: subscription@ps38-dev` и `anthropic-api-key: oauth-proxy` отвечает `200 {"status":"ok","proxy":"ai-queue-oauth","machine":"ps38-dev"}`. Простой GET без provider identity ожидаемо возвращает fail-closed `503` и не означает поломку.
- Реальный Opus-запрос 13 августа прошёл от `ubuntu`; проверенный путь `teamlead → sudo -u ubuntu` также прошёл.
- Autoupdate каждые 5 минут падал с `activated Claude release failed validation`.
- Активный официальный native runtime в manifest: Claude Code `2.1.226`, `linux-x64`.
- Размер native runtime: `297831432` bytes.
- SHA256 native runtime из manifest: `4e9bec1177ce9690e8bd988b710ac24105e70da428dd094c5adcbbe786a55555`.
- Единственная Python-зависимость отдельного venv: `PySocks 1.7.1`.

Версия `2.1.226` — канонический известный working release для cutover. Сначала восстановить и проверить именно её; обновлять до актуальной версии только отдельным staged change после приёмки.

## Security contract, который нельзя ослаблять

1. Оба proxy-компонента слушают только `127.0.0.1`.
2. Gateway работает fail-closed: нет правильной provider identity, OAuth token или здорового proxy binding — запрос отклоняется, прямой выход запрещён.
3. Bridge разрешает только TCP `443` и allowlist:
   - `anthropic.com`, `.anthropic.com`;
   - `claude.ai`, `.claude.ai`;
   - `claude.com`, `.claude.com`.
4. SOCKS5 использует remote DNS.
5. OAuth token — отдельный файл `0600`, owner `ubuntu:ubuntu`, каталог `0700`.
6. Proxy DB — `0600`, owner `ubuntu:ubuntu`; proxy username/password нельзя писать в логи или этот документ.
7. Unit-файлы запускаются с `NoNewPrivileges`, без capabilities и с filesystem hardening.
8. Wrapper очищает унаследованные proxy/provider/token переменные, запрещает runtime overrides, login/logout/plugins/MCP/remote-control и выключает telemetry/auto-update.
9. Managed Claude policy принадлежит `root:root`, mode `0644`, не допускает дополнительных unmanaged drop-ins.
10. До end-to-end проверки real requests PS38 не включается по умолчанию и не объявляется здоровым.

## Layout при cutover и последующая нормализация

Во время cutover сохранить проверенные пути, чтобы не менять сразу и ОС, и внутреннюю архитектуру:

```text
/srv/ps38-claude/releases/auto-2.1.226-4e9bec1177ce/
/srv/ps38-claude/current -> releases/auto-2.1.226-4e9bec1177ce
/opt/ps38-claude -> /srv/ps38-claude
/var/lib/ps38-claude/ai-queue.db
/home/ubuntu/.config/ps38-claude/oauth-token
/etc/claude-code/managed-settings.json
```

После успешной приёмки можно отдельным изменением перейти к нормализованному layout:

```text
/opt/ps38-claude/current/                 # versioned, immutable application release
/opt/ps38-claude/releases/<version>/      # максимум current + один rollback
/etc/ps38-claude/gateway.env              # non-secret runtime configuration, root-owned
/etc/claude-code/managed-settings.json    # root-owned deny policy
/var/lib/ps38-claude/ai-queue.db          # proxy binding, 0600 ubuntu:ubuntu
/home/ubuntu/.config/ps38-claude/oauth-token  # new token, 0600
/var/log/ps38-claude/                     # capped/rotated logs
```

Кастомный source должен жить в отдельном private Git repository с тестами, release tags и documented build procedure. До этого verified age-архив остаётся обязательной внешней recovery-копией.

## Нужные компоненты

### 1. Официальный Claude Code runtime

- Для первого cutover восстановить verified runtime `2.1.226` из supplement и сверить SHA256; при clean-room fallback получить актуальный runtime только официальным способом.
- Зафиксировать version, platform, size и SHA256 в release manifest.
- Release directory: `root:root`, без group/world write.
- Symlink `current` должен вести строго внутрь `releases/`.
- Wrapper перед запуском повторно проверяет owner/mode/manifest/hash.

### 2. OAuth gateway (`127.0.0.1:19012`)

Обязательное поведение:

- принимать локальные Anthropic-compatible запросы;
- читать новый OAuth token из отдельного файла;
- требовать provider `subscription@ps38-dev`;
- находить его proxy binding в DB;
- отправлять запрос только через bridge/SOCKS;
- сохранять streaming semantics и необходимые Anthropic headers;
- иметь body/concurrency/time limits;
- не логировать headers, token, request body или proxy credentials;
- отдавать `503` при отсутствующем/невалидном provider, token или proxy route;
- предоставлять health endpoint, который проверяет всю необходимую конфигурацию.

Исторические non-secret параметры:

```dotenv
ANTHROPIC_PROXY_HOST=127.0.0.1
ANTHROPIC_PROXY_PORT=19012
ANTHROPIC_PROXY_LOG=/var/log/ps38-claude/oauth-proxy.log
AI_QUEUE_DB=/var/lib/ps38-claude/ai-queue.db
AI_QUEUE_MACHINE=ps38-dev
AI_QUEUE_CLAUDE_OAUTH_TOKEN_FILE=/home/ubuntu/.config/ps38-claude/oauth-token
AI_QUEUE_CLAUDE_EGRESS_REQUIRED=1
AI_QUEUE_CLAUDE_REQUIRED_PROVIDER=subscription@ps38-dev
AI_QUEUE_OAUTH_PROXY_CLIENT_TIMEOUT_SEC=120
AI_QUEUE_OAUTH_PROXY_UPSTREAM_TIMEOUT_SEC=180
AI_QUEUE_OAUTH_PROXY_MAX_BODY_BYTES=33554432
AI_QUEUE_OAUTH_PROXY_MAX_CONNECTIONS=32
AI_QUEUE_OAUTH_PROXY_MAX_INFLIGHT_BODY_BYTES=134217728
AI_QUEUE_OAUTH_PROXY_LOG_MAX_BYTES=5242880
AI_QUEUE_OAUTH_PROXY_LOG_BACKUPS=5
```

Параметры нужно пересмотреть под новую реализацию, а не копировать механически.

### 3. HTTP-to-SOCKS bridge (`127.0.0.1:19011`)

Обязательное поведение:

- принимать только HTTP `CONNECT` на loopback;
- разрешать только allowlisted host и port `443`;
- получать ровно один active/healthy/non-expired SOCKS5 binding из DB;
- запрещать direct fallback;
- использовать authenticated SOCKS5 и remote DNS;
- ограничивать headers, timeout, connections и relay buffers;
- предоставлять `/health`, который доказывает, что binding читается и SOCKS может соединиться с каноническим Anthropic endpoint;
- безопасно переживать disconnect клиента без restart-loop.

Исторические non-secret параметры:

```dotenv
PS38_CLAUDE_BRIDGE_HOST=127.0.0.1
PS38_CLAUDE_BRIDGE_PORT=19011
PS38_CLAUDE_PROXY_DB=/var/lib/ps38-claude/ai-queue.db
PS38_CLAUDE_PROVIDER=subscription@ps38-dev
PS38_CLAUDE_ALLOWED_CONNECT_PORTS=443
PS38_CLAUDE_ALLOWED_CONNECT_HOSTS=anthropic.com,.anthropic.com,claude.ai,.claude.ai,claude.com,.claude.com
```

### 4. Proxy binding DB

Старая schema без данных:

```sql
CREATE TABLE proxy_pool (
    id INTEGER PRIMARY KEY,
    label TEXT,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT,
    password TEXT,
    protocol TEXT NOT NULL,
    status TEXT NOT NULL,
    health_status TEXT NOT NULL,
    expires_at TEXT
);

CREATE TABLE account_proxy (
    login TEXT NOT NULL,
    backend TEXT NOT NULL,
    proxy_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(login, backend)
);
```

При cutover:

- восстановить согласованную SQLite-копию из supplement, а не live-файл старого сервера;
- выставить `0600 ubuntu:ubuntu` и выполнить `PRAGMA integrity_check` до запуска сервисов;
- не печатать endpoint/username/password в terminal, journal или manifest;
- убедиться, что binding однозначно связывает `subscription@ps38-dev` с одним active/healthy SOCKS5 proxy;
- текущая запись имеет expiry `2026-09-05T00:34:26Z`: переезд 14 августа выполняется с существующей записью, затем credential/binding нужно контролируемо обновить до этой даты;
- при clean-room fallback создать новую DB и ввести новые credentials интерактивно, не через shell history;
- позже предпочтительно заменить plaintext password в SQLite на secret store/credentials mechanism systemd.

### 5. OAuth token и владелец профиля

Для первого cutover восстановить существующий working token из supplement строго в `/home/ubuntu/.config/ps38-claude/oauth-token`: каталог `0700`, файл `0600`, owner `ubuntu:ubuntu`, не symlink и один hardlink. Не выводить его содержимое, не класть в Git, shell history или обычный manifest.

Канонический пользователь всей PS38 Claude-схемы — `ubuntu`. Прямой запуск wrapper от `teamlead` ожидаемо отклоняется как `OAuth token is unavailable`, потому что wrapper проверяет владельца token. Рабочий контракт для `teamlead`:

```bash
sudo -n -u ubuntu -H /usr/local/bin/claude ...
```

Не создавать `/home/teamlead/.config/ps38-claude/oauth-token` и не ослаблять owner check. Если перенесённый token окажется отозван, только тогда пройти официальный интерактивный flow под `ubuntu`, атомарно заменить token и повторить fail-closed/real-request tests.

### 6. Managed Claude policy

Историческая deny-policy:

```json
{
  "allowedMcpServers": [],
  "allowManagedHooksOnly": true,
  "allowManagedMcpServersOnly": true,
  "agentPushNotifEnabled": false,
  "autoInstallIdeExtension": false,
  "autoUploadSessions": false,
  "claudeInChromeDefaultEnabled": false,
  "deniedMcpServers": [
    {"serverName": "ide"},
    {"serverName": "claude-in-chrome"},
    {"serverName": "computer-use"}
  ],
  "disableAllHooks": true,
  "disableClaudeAiConnectors": true,
  "disableRemoteControl": true,
  "disableSideloadFlags": true,
  "inputNeededNotifEnabled": false,
  "remoteControlAtStartup": false,
  "strictKnownMarketplaces": []
}
```

Положить как `/etc/claude-code/managed-settings.json`, `root:root`, `0644`. Не создавать `managed-mcp.json` и `managed-settings.d` без отдельного review.

## Systemd units и шаблоны

Для первого cutover authoritative copies — exact unit-файлы внутри supplement. Приведённые ниже hardening-шаблоны предназначены для review/будущей нормализации и не должны молча заменить working units до smoke-test.

### `/etc/systemd/system/ps38-claude-egress-bridge.service`

```ini
[Unit]
Description=PS38 Claude loopback HTTP-to-SOCKS bridge
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=ubuntu
Group=ubuntu
UMask=0077
EnvironmentFile=/etc/ps38-claude/bridge.env
ExecStartPre=/usr/bin/test -r /var/lib/ps38-claude/ai-queue.db
ExecStart=/opt/ps38-claude/current/venv/bin/python /opt/ps38-claude/current/bin/ps38-http-socks-bridge.py
Restart=on-failure
RestartSec=10
TimeoutStartSec=45
TimeoutStopSec=15
NoNewPrivileges=true
PrivateDevices=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=128M
TasksMax=64

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/ps38-claude-oauth-proxy.service`

```ini
[Unit]
Description=PS38 Claude loopback OAuth gateway
Wants=network-online.target
After=network-online.target ps38-claude-egress-bridge.service
Requires=ps38-claude-egress-bridge.service
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User=ubuntu
Group=ubuntu
UMask=0077
LogsDirectory=ps38-claude
LogsDirectoryMode=0700
EnvironmentFile=/etc/ps38-claude/gateway.env
ExecStartPre=/usr/bin/test -r /var/lib/ps38-claude/ai-queue.db
ExecStartPre=/usr/bin/test -r /home/ubuntu/.config/ps38-claude/oauth-token
ExecStart=/opt/ps38-claude/current/venv/bin/python /opt/ps38-claude/current/bin/ai-queue-oauth-proxy
Restart=on-failure
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=20
NoNewPrivileges=true
PrivateDevices=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=/var/lib/ps38-claude /home/ubuntu/.config/ps38-claude/oauth-token
ReadWritePaths=/var/log/ps38-claude
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=512M
TasksMax=128

[Install]
WantedBy=multi-user.target
```

## Порядок точного восстановления

1. Расшифровать verified supplement только на новом `dev`; проверить SHA256 encrypted archive до расшифровки.
2. Создать `ubuntu` с прежним UID/GID и строгими home/SSH permissions. `teamlead` восстановить отдельно; Linux-пользователи `evguslev` и `win20ps38` PS38 не нужны.
3. Восстановить exact release, `/srv/ps38-claude/bin`, symlinks, wrapper и managed policy с numeric owners/modes. Сверить native SHA256 `4e9bec1177ce9690e8bd988b710ac24105e70da428dd094c5adcbbe786a55555`.
4. Восстановить OAuth token/user state и согласованную `ai-queue.db`; проверить owner/mode и `PRAGMA integrity_check`, не выводя secret values.
5. Восстановить только нужную SSH identity/config/known-host для центрального `secret` и exact user-unit `pin888-tcp-unix-proxy.service`.
6. Установить units gateway/bridge, но оставить gateway, bridge и autoupdate disabled до ручной проверки.
7. Запустить user tunnel; убедиться, что `19013/19100` слушают только `127.0.0.1` и SSH connection стабилен.
8. Запустить bridge; проверить `curl -fsS http://127.0.0.1:19011/health`.
9. Запустить gateway; проверить health с обязательными headers:

   ```bash
   curl -fsS \
     -H 'X-AI-Provider: subscription@ps38-dev' \
     -H 'anthropic-api-key: oauth-proxy' \
     http://127.0.0.1:19012/health
   ```

10. Проверить `sudo -u ubuntu -H /usr/local/bin/claude --version`, затем один реальный Opus smoke-test от `ubuntu`.
11. Проверить такой же real request через фактический путь `teamlead → sudo -u ubuntu`; прямой запуск от `teamlead` без sudo должен продолжать fail-closed.
12. Только после успешных tests включить gateway/bridge/tunnel. `ps38-claude-autoupdate.timer` оставить disabled.
13. До `2026-09-05` планово обновить proxy binding и повторить health/real-request/exit-route checks.
14. После стабилизации создать private Git repository для custom source, тесты и tagged release; clean-room rebuild использовать только если exact restore не проходит.

## Acceptance tests

### Network boundary

- `19011` и `19012` слушают только `127.0.0.1`.
- На публичных интерфейсах и IPv6 этих портов нет.
- Bridge отклоняет любой port кроме `443`.
- Bridge отклоняет host вне allowlist.
- При остановленном SOCKS gateway не выходит напрямую и возвращает controlled `503`.

### Secrets

- Token и DB имеют `0600`, правильного owner и не являются symlink.
- В journal/logs нет token, proxy password, Authorization headers или request body.
- Managed settings root-owned и совпадают с reviewed policy.

### Health

- Bridge `/health` возвращает `200` только при usable binding.
- Gateway health возвращает `200` только при валидном provider/token/egress.
- Тестовый `/v1/messages` проходит через proxy и получает `200`.
- `ubuntu` выполняет real Opus request; `teamlead` выполняет его только через разрешённый `sudo -u ubuntu -H`, не через собственный token.
- Проверен exit IP через тот же binding без вывода proxy credentials.
- При трёх искусственных отказах нет быстрого restart-loop/log storm.

### Claude wrapper

- Запрещены login/logout, runtime proxy override, plugins/MCP, remote control и unreviewed settings.
- Telemetry и native auto-update выключены, если обновления контролирует внешний процесс.
- Wrapper проверяет release root, owner/mode, manifest, size и SHA256 перед запуском.

## Autoupdate: не восстанавливать по старой схеме

Старый timer запускался каждые 5 минут и стабильно падал. Новый механизм, если вообще нужен:

- проверяет обновления максимум ежедневно;
- скачивает в staging;
- проверяет официальный manifest/hash/size/owner/mode;
- запускает isolated smoke probe;
- атомарно переключает `current`;
- при ошибке оставляет previous release;
- хранит current + один rollback;
- отправляет одно уведомление, а не создаёт бесконечный журнал;
- имеет start-rate limit и не потребляет сотни мегабайт каждые пять минут.

До реализации и тестов этого процесса native Claude auto-update также держать выключенным.

## Monitoring и логирование

- Journal/file logs без body/headers/secrets.
- Ротация: максимум 5 файлов по 5 МБ либо эквивалентный общий cap.
- Alert на gateway `503`, bridge unhealthy, expired proxy binding и token expiry.
- Alert на restart count и failed units.
- Ежемесячный manual end-to-end test.
- Не считать живой процесс здоровым только потому, что systemd показывает `active`.

## Что намеренно не напечатано в этом документе

- OAuth token и его значение;
- proxy host/port/username/password;
- SSH private keys;
- содержимое `ai-queue.db` и OAuth-файла, хотя они сохранены внутри encrypted supplement;
- private application payload, хотя current source/binaries сохранены внутри encrypted supplement;
- request logs и пользовательские prompts;
- любые действующие secrets.

## Короткий итог для будущего администратора

Если задача звучит «вернуть обычный Claude Code», этот runbook не нужен — используйте официальный install/login.

Если задача звучит «вернуть Claude Code профиля `ps38-dev`, жёстко привязанный к конкретному SOCKS и работающий fail-closed», сначала восстановите verified supplement и пройдите acceptance tests. Не берите runtime/token/DB из неизвестных случайных копий. Clean-room реализация с новым token/binding — запасной путь, если проверенный exact restore больше не совместим или credentials отозваны.
