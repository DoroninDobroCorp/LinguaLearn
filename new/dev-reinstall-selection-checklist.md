# Переустановка `dev`: лист отбора и план долгой гигиены

Снимок инвентаризации: 2026-08-13. Текущий сервер: `vps-600a189b.vps.ovh.net`, OVH Gravelines, SSH-алиас `dev`, IPv4 `54.38.65.155`.

Цель: полностью стереть системный диск, установить чистую Ubuntu 26.04 LTS и вернуть только выбранные сервисы и данные. До выполнения раздела «Стоп-кран» кнопку `Confirm` в OVH не нажимать.

## Как заполнить этот документ

- `[x]` означает: **выбрано — переносим, восстанавливаем или выполняем на новом `dev`**. Отдельный пункт **CHOSEN** может фиксировать уже принятое общее решение.
- `[ ]` означает: **не включать пункт в перенос/восстановление**.
- Строки **DROP** по принятому в этом документе соглашению оставляются пустыми: они объясняют, что именно не попадёт на новый сервер; отдельно удалять это перед стиранием диска не требуется.
- Сам крестик фиксирует выбор, а не факт выполнения. Реально завершённые заранее действия помечаются отдельно как **DONE**; остальные будут выполняться во время backup/reinstall/cutover.
- Возле спорного пункта можно написать комментарий после тире.
- Метки: **KEEP** — возвращаем рабочую функцию; **KEEP MINIMAL/INSTALL FRESH** — сохраняем минимум или ставим заново; **COLD BACKUP ONLY** — страховочная копия вне нового `dev`; **DROP** — не переносим.
- Выбор сервиса автоматически означает перенос его конфигурации и данных, но не кэшей, логов, `.venv`, `node_modules` и build-артефактов, если ниже не сказано обратное.

---

# 1. Приложения и сервисы: что должно жить на новом `dev`

## 1.1 RobinArb

- [x] **KEEP** RobinArb API (`robinarb.service`, loopback `8899`, Nginx `robinarb.com`).
- [x] **KEEP** RobinArb Betfair/Sportsbook worker (`robinarb-betfair-sportsbook.service`, Xvfb/browser automation).
- [x] Перенести рабочий код `/srv/robinarb/current` с сохранением всех незакоммиченных изменений.
- [x] Перенести конфигурацию `/srv/robinarb/current/backend/.env` и `/etc/robinarb/` как секреты.
- [x] Перенести нужные browser profiles/cookies RobinArb.
- [x] Перенести домашнюю dirty-копию `/home/ubuntu/robinarb-ui-v2` (194 tracked changes, 38 untracked).
- [ ] **DROP** Не переносить screenshots/reports из `robinarb-ui-v2`; сохранить только исходники и уникальные данные.
- [x] **KEEP MINIMAL** Сохранить группу `robinarb` с прежним GID для ownership рабочих файлов, но оставить в ней только реально нужного участника `ubuntu`. Отдельные login-пользователи `robinarb` и `evguslev` на новой машине не создавать: выбранные сервисы запускаются от `ubuntu`.
- [ ] **DROP** Не переносить старую личную установку Factory/Droid пользователя `robinarb` (~163 МБ; неактивна с мая).

Не переносить автоматически: `.venv`, `node_modules`, Playwright browser cache, старые release-копии. Их следует воспроизвести из lock-файлов после восстановления исходников.

## 1.2 Universal Projecter

- [x] **KEEP** Backend (`up-backend.service`, loopback `8001`).
- [x] **KEEP** Frontend (`up-frontend.service`, loopback `4999`).
- [x] Перенести production-код `/srv/universal-projecter/backend`.
- [x] Перенести production-код `/srv/universal-projecter/frontend`.
- [x] Перенести конфигурации/env и пользовательские uploads/static/data, если они находятся внутри проекта.
- [x] Перенести Canvas backup script/cron (`/srv/universal-projecter/backups_canvas.sh`).
- [ ] **DROP — рекомендуется** Не возвращать Telegram/auth bot (`up-bot.service`): он disabled/inactive, запусков в журнале нет; текущее пользовательское поведение от него не зависит.
- [x] **KEEP — рекомендуется** Вернуть `up-health-watchdog.timer`: он сейчас активен, успешно проверяет frontend/backend каждую минуту и после трёх подряд сбоев выполняет restart с 10-минутным backoff. Сам oneshot-service между проверками штатно выглядит `inactive`.
- [ ] **DROP — рекомендуется** Не переносить старые rollback-каталоги frontend/backend (~2,7 ГБ повторных `node_modules`, `.next` и исходников). Вместо этого точно сохранить текущий dirty production tree, Git bundle/patch/untracked manifest и один компактный аварийный архив текущего runtime до успешного smoke-test новой сборки.
- [ ] **DROP — рекомендуется** Не возвращать `/srv/universal-projecter-unified-staging` на новую production-машину: активных ссылок из systemd/Nginx/cron нет, Git clean; достаточно сохранить remote и commit `9df028f`, чтобы при необходимости клонировать заново.

## 1.3 Vesper / Ouroboros / iFriend

- [x] **KEEP** Ouroboros API (`ouroboros.service`, loopback `8765/8767`).
- [x] **KEEP** iFriend Telegram (`ifriend-telegram.service`).
- [x] **KEEP** Vesper Contact Relations (`vesper-contact-relations.service`).
- [x] Перенести текущий канонический код из `/srv/releases/vesper-platform-current`.
- [x] Перенести основной Ouroboros-код `/srv/ouroboros/repo`.
- [x] Перенести production staging-код, который сейчас реально исполняется: `/srv/staging/ouroboros-unified-v1` и `/srv/staging/ifriend-unified-v1`.
- [x] Перенести конфигурацию `/etc/ouroboros/`.
- [x] Перенести конфигурацию `/etc/ifriend-unified/`.
- [x] Перенести конфигурацию `/etc/vesper-contact-relations/`.
- [x] **KEEP DATA** Перенести реальный Ouroboros state `/srv/ouroboros/data` (~1,1 ГБ), указанный в live unit как `OUROBOROS_DATA_DIR`; перед финальным архивом остановить Ouroboros для согласованного snapshot.
- [x] **KEEP DATA** Перенести iFriend state `/srv/staging-data/ifriend-unified-v1` (~7 МБ), указанный в live unit как `DATA_DIR`.
- [x] Перенести persistent data `/var/lib/vesper-contact-relations`.
- [ ] **DROP/ERROR CORRECTED** Не искать `/home/ubuntu/Ouroboros`: такого пути на сервере нет; прежний пункт был ошибочным. Нужные данные перечислены двумя строками выше.
- [ ] **DROP — рекомендуется** Не переносить `/srv/vesper-platform`: checkout clean, ветка `platform-main` доступна в remote на commit `99cba7d`; на новой машине клонировать заново только при необходимости.
- [x] **KEEP MINIMAL** Сохранить текущий release `f13f45b` и один известный rollback `cb9519f` до успешной приёмки. Все остальные старые Vesper releases не переносить.
- [ ] **DROP** Переносить smoke/staging-каталоги `vesper-staging`, `vesper-fix-loop-smoke`, `vesper-execution-smoke`.

## 1.4 Forted

- [x] **KEEP** Forted Rust client (`forted-rust.service`, loopback `3055`).
- [x] **KEEP** Forted source feed/shim (`forted-source.service`, loopback `9015`).
- [x] Перенести исходники `/srv/forted-source` без `rust-client/target` и `.venv`.
- [x] Перенести `/srv/forted-source/.env` и production TOML-конфигурацию как секреты.
- [x] На всякий случай сохранить текущий рабочий release-бинарник Forted отдельно до успешной пересборки.
- [ ] **DROP — рекомендуется** Не переносить `/srv/forted-worktrees/forted-readiness-20260811`: worktree clean, ветка `codex/forted-readiness-20260811` полностью есть в `origin`, подтверждён commit `685b416`; живых ссылок нет. Из 2,6 ГБ практически всё — ignored Rust `target` (`debug` ~2,0 ГБ + `release` ~639 МБ), который пересобирается. `results` (~50 МБ) tracked и также находятся в Git. В manifest сохранить remote, branch и commit.
- [ ] **DROP** Старый `forted-https.service`.

## 1.5 RobinArb BIA Gateway (новая версия вместо PS3838)

13 августа старый browser-based PS3838 Betslip был заменён на чистый BIA-only gateway. Сейчас именно `robinarb-bia-gateway.service` слушает `127.0.0.1:8770` и обслуживает RobinArb. Старые PS3838 API/proxy/reverse-tunnel/logout-monitor замаскированы и не участвуют в работе. Новый gateway не использует Playwright, browser profiles, прямой Pinnacle transport или SOCKS-порт `1080`.

- [x] **KEEP — рекомендуется** RobinArb BIA Gateway (`robinarb-bia-gateway.service`, loopback `8770`): active/enabled, после cutover RobinArb health остаётся `ok`.
- [x] Перенести чистый Git-репозиторий `/srv/robinarb-bia-gateway` без `.venv`, `__pycache__`, `.pytest_cache` и локальных backup-копий. Текущий snapshot сохранён в `origin` как ветка `snapshot/bia-gateway-pre-migration-20260813`, commit `893a6ff`.
- [x] Дополнительно создать Git bundle/manifest commit `893a6ff`, чтобы восстановление не зависело только от GitHub.
- [x] Перенести активный unit `/etc/systemd/system/robinarb-bia-gateway.service` и versioned unit из `infra/systemd` как reference; на новой машине unit установить чисто.
- [x] Перенести активный `/etc/robinarb/robinarb-bia-gateway.env` и оставшийся `/srv/robinarb-bia-gateway/.env` только в зашифрованном secret archive; после восстановления определить один канонический env и сохранить mode `0600`.
- [x] Перенести RobinArb integration/drop-in `/etc/systemd/system/robinarb.service.d/95-bia-only.conf` и соответствующий versioned config из `/srv/robinarb/current/deploy/`.
- [x] После восстановления прогнать BIA gateway test suite, `/health`, quote/proof/place contract и end-to-end проверку из RobinArb до разрешения реальных ставок.
- [ ] **DROP — рекомендуется** Не переносить `/srv/robinarb-bia-gateway/backups` (~47 МБ), если commit `893a6ff`, Git bundle и внешний архив успешно проверены.
- [ ] **DROP — обязательно** Не возвращать старые masked units `ps3838-betslip`, `ps3838-betslip-proxy`, `ps3838-betslip-secret-tunnel`, `ps3838-logout-monitor`.
- [ ] **DROP — обязательно** Не переносить старые PS3838 browser profiles/session, Playwright cache и порт `1080` ради BIA Gateway: новая active-схема их не использует.

## 1.6 PS38 Claude — переносим рабочую систему

PS38 Claude — отдельная от RobinArb кастомная цепочка Claude Code с профилем `subscription@ps38-dev`, OAuth gateway и обязательным выходом через выделенный SOCKS5. Проверка 13 августа подтвердила: версия `2.1.226` работает, gateway `127.0.0.1:19012` и bridge `127.0.0.1:19011` здоровы, реальный Opus-запрос прошёл. Канонический владелец профиля — `ubuntu`; `teamlead` должен запускать Claude через разрешённый `sudo -u ubuntu -H`, а не иметь отдельную копию OAuth token.

- [x] **KEEP** Вернуть `ps38-claude-oauth-proxy.service` и `ps38-claude-egress-bridge.service` с теми же loopback-портами `19012/19011` и fail-closed правилами.
- [x] **KEEP EXACT CURRENT** Перенести активный release `/srv/ps38-claude/releases/auto-2.1.226-4e9bec1177ce`, symlink `current`, кастомные компоненты из `/srv/ps38-claude/bin`, wrapper `/usr/local/bin/claude` и managed policy `/etc/claude-code/managed-settings.json`.
- [x] **KEEP SECRETS** Перенести только внутри age-архива OAuth token `/home/ubuntu/.config/ps38-claude/oauth-token`, согласованную SQLite-копию `/var/lib/ps38-claude/ai-queue.db`, `/home/ubuntu/.config/ps38-claude`, нужную SSH identity/config и Claude user state `/home/ubuntu/.claude`; вернуть owner/mode без печати секретов.
- [x] **KEEP** Вернуть user-unit `pin888-tcp-unix-proxy.service`: его активный SSH-сеанс создаёт `127.0.0.1:19100` и `127.0.0.1:19013` к центральному `secret`, и он является частью текущей рабочей PS38-схемы.
- [x] **KEEP ACCESS CONTRACT** Claude и OAuth-файл принадлежат `ubuntu`. Для `teamlead` сохранить проверенный путь `sudo -n -u ubuntu -H /usr/local/bin/claude …`; не копировать OAuth token в `/home/teamlead` и не ослаблять проверку владельца wrapper.
- [x] **DONE 2026-08-13** Создан отдельный зашифрованный supplement `dev-20260813T191053Z-ps38-supplement.tar.age` (76 МБ): current release, custom source, wrapper, policy, token, согласованная proxy DB, user state, SSH tunnel и units. SHA256 на `dev`, Mac и `serverforvovka`: `aff448386074f0877ac010d4758afab443cc394e4ab5bff0738cb7cb6b608edd`; на Mac archive полностью расшифрован, `zstd -t` и `tar -tf` прошли.
- [x] **KEEP RUNBOOK** Перенести обновлённый `PS38_CLAUDE_REBUILD_RUNBOOK.md`: точное восстановление текущей системы — основной путь, clean-room rebuild — запасной.
- [x] После восстановления сначала запустить tunnel и bridge, затем gateway; gateway health проверять с обязательными headers `X-AI-Provider: subscription@ps38-dev` и `anthropic-api-key: oauth-proxy`, после чего выполнить реальный Opus smoke-test от `ubuntu` и через путь `teamlead → sudo ubuntu`.
- [x] До `2026-09-05` проверить/обновить proxy binding: текущая запись в DB помечена healthy, но имеет эту дату expiry. Ротацию делать после успешного cutover, не одновременно с переездом.
- [ ] **DROP** Не переносить `/var/log/ps38-claude`, старые session/debug logs и семь неактивных release-копий: current release и custom source уже защищены внешним архивом.
- [ ] **DROP — обязательно** Не включать `ps38-claude-autoupdate.timer` после восстановления: его 5-минутный запуск падает с `activated Claude release failed validation` и создаёт log storm. Сохранить код updater только как reference; новый daily/staged updater включать лишь после исправления и теста rollback.
- [ ] **DROP** Не возвращать старые сломанные `tunnel-19012-healthcheck/notifier`: они не являются `pin888-tcp-unix-proxy.service`, ссылаются на отсутствующие пути и засоряют journal.

## 1.7 RustDesk

**Критический канал управления.** `dev` является центральным RustDesk ID/relay server. В compose включено `ALWAYS_USE_RELAY=Y`, поэтому действующие сеансы идут через него, а не напрямую. На момент проверки текущая paired relay-сессия была активна. Переустановка `dev` немедленно оборвёт RustDesk и оставит клиентов без этого центра до восстановления.

- [x] **KEEP** RustDesk `hbbs`.
- [x] **KEEP** RustDesk `hbbr`.
- [x] Перенести `/srv/RustDesk/compose.yml`.
- [x] Перенести `/srv/RustDesk/data`: сделать согласованный SQLite backup `db_v2.sqlite3`, сохранить server identity `id_ed25519`/`.pub`, owner/mode/mtime. Private key после копирования должен иметь mode `0600` (на старом сервере он ошибочно `0644`).
- [x] Экспортировать кастомный Docker image `rustdesk-server:relayfix` через `docker save` (он локальный; одного compose недостаточно).
- [x] Перенести или воспроизвести `rustdesk-watchdog.service/.timer` и скрипт `/usr/local/bin/rustdesk-watchdog.sh`.
- [x] Проверить TCP `21115-21119` и UDP `21116` после восстановления.

### Обязательный временный RustDesk до переустановки

- [x] **STOP-GATE** Не нажимать OVH `Confirm`, пока временный RustDesk на `serverforvovka` не проверен реальным новым сеансом.
- [x] **DONE 2026-08-13** Экспортировать `rustdesk-server:relayfix` с `dev`, скопировать на `serverforvovka`, сверить image ID и выполнить `docker load`.
- [x] **DONE 2026-08-13** Скопировать на `serverforvovka` согласованный RustDesk DB backup и тот же server identity key; DB прошла `integrity_check`, private/public identity hashes после запуска не изменились.
- [x] **DONE 2026-08-13** Создать временный compose с relay address `145.239.82.124:21117`, отдельным каталогом и `restart: unless-stopped`; оба контейнера запущены без restart.
- [x] **DONE 2026-08-13** В firewall `serverforvovka` временно разрешить TCP `21115-21119` и UDP `21116` одновременно для IPv4/IPv6; внешние TCP probes со стороны Mac прошли.
- [x] На обоих RustDesk endpoints временно указать ID server/relay `145.239.82.124` и прежний public key.
- [x] Установить **новый** RustDesk-сеанс через `serverforvovka`; не считать успехом сохранение уже открытого старого соединения.
- [x] На несколько минут остановить RustDesk-контейнеры на `dev` и убедиться, что новый сеанс через `serverforvovka` продолжает работать; затем при необходимости вернуть их до maintenance window.
- [x] Иметь второй независимый канал управления Mac/OVH (локальный доступ, Tailscale Screen Sharing/SSH или другой заранее проверенный remote tool).
- [x] Только после этого переустанавливать `dev`.

### Возврат RustDesk на чистый `dev`

- [x] RustDesk восстанавливается одним из первых сервисов после SSH/firewall/Docker, до остальных приложений.
- [x] Загрузить проверенный custom image, восстановить identity/data, заменить relay address обратно на `54.38.65.155:21117`.
- [x] Открыть на новом `dev` только нужные RustDesk TCP/UDP-порты и проверить listeners/firewall для IPv4/IPv6.
- [x] Переключить оба клиента обратно на `54.38.65.155`, создать новый сеанс и проверить relay end-to-end.
- [x] Остановить временный RustDesk на `serverforvovka`, закрыть его firewall-порты и удалить временные data/image только после подтверждённого backup и стабильной работы нового `dev`.

## 1.8 SofaScore Results

- [x] **CHOSEN** Не переносить и не восстанавливать SofaScore Results на новой машине; публичный порт `7777` после reinstall не открывать.
- [x] **VERIFIED** Отслеживаемый код сохранён: локальный `main` clean и совпадает с `origin/main`, commit `93654b3c48d1800d1558764f0bb6a5d4e6b47ac6`; `package.json`, `package-lock.json`, source и tests находятся в Git.
- [ ] **DROP по вашему решению** Аккаунт Sansabet больше не актуален; ротацию не планировать. Семь файлов со старыми credentials не переносить и не коммитить.
- [ ] **DROP** Не переносить `.factory/settings.json` и семь разовых `sansa_*.js`: service/systemd/cron на них не ссылаются.
- [ ] **DROP по выбранному решению** Не переносить `.env` с PS38 credentials и `results_cache.db`/WAL/SHM. Это удалит локальный cache (на снимке: 76 670 results и 178 scrape-log записей), но не Git-код; при будущем развёртывании cache создаётся заново.
- [ ] **DROP** Не переносить `node_modules`, logs, Playwright cache, `page_structure.html` и сам `sofascore-results.service`.

## 1.9 Tunnels, proxy и вспомогательная сеть

- [x] **KEEP** Tailscale и сохранить для него прежнюю identity. После переустановки другие устройства не должны менять адрес, имя узла или настройки.
- [x] **CHOSEN** Не регистрировать новый node: восстановить существующий узел `dev` с теми же Tailscale IP `100.95.47.52` / `fd7a:115c:a1e0::5234:2f34` и MagicDNS-именем `dev.taila39165.ts.net`.
- [x] Перед финальным backup остановить `tailscaled` и скопировать `/var/lib/tailscale/tailscaled.state` в **зашифрованный** архив. Это секрет с private node keys: не класть в Git и не хранить открытым файлом на backup-сервере.
- [x] После чистой установки поставить Tailscale той же или более новой версии, остановить `tailscaled`, вернуть state как `/var/lib/tailscale/tailscaled.state` с владельцем `root:root` и mode `0600`, затем запустить daemon.
- [x] **STOP-GATE:** до успешного восстановления state не выполнять `tailscale up` с новым auth key — это создаст другой node, может дать другое имя/IP и нарушит требование «ничего не менять на устройствах».
- [x] После запуска проверить: узел называется `dev`, адреса остались прежними, MagicDNS работает, `tailscale ping` проходит в обе стороны; маршруты, exit node и Tailscale SSH по-прежнему не рекламируются.
- [x] **DONE 2026-08-13** В Tailscale Admin для серверного узла `dev` отключён key expiry. Панель показывает `Expiry disabled`; периодический re-auth этому узлу больше не требуется, на остальных устройствах ничего менять не нужно.
- [x] После проверки оставить state-backup только в зашифрованном аварийном архиве либо безопасно удалить лишние копии.

### Оставляем

- [x] **KEEP** Qwen/Ollama tunnel к `serverforvovka` (`qwen-ollama-tunnel.service`, только `127.0.0.1:11434`). Он активен, имеет живые соединения и используется Ouroboros для локального memory review; удаление изменит работу выбранного к переносу сервиса.
- [x] **KEEP** VibeProxy на `127.0.0.1:8318` для iFriend. Рабочий iFriend настроен на этот endpoint, и от Ouroboros/iFriend сейчас есть живые подключения.
- [x] **KEEP** Защиту `vibeproxy-local-only.service` + `/usr/local/lib/vibeproxy/lock-port-8318`: входящий SSH-forward фактически создаёт listener на всех интерфейсах, а это правило блокирует доступ к `8318` не через loopback.
- [x] **KEEP** `pin888-tcp-unix-proxy.service` для выбранного PS38 Claude: сохранить только его unit, SSH key/config и host-key; listeners `19013/19100` должны оставаться строго на `127.0.0.1`.
- [x] На новой ОС восстановить минимальные systemd units для Qwen и защиты VibeProxy из проверенного manifest/runbook, а не копировать случайные runtime-процессы или логи.
- [x] Перед включением iFriend проверить: Ollama отвечает через `127.0.0.1:11434`, VibeProxy отвечает через `127.0.0.1:8318`, а попытка подключиться к `PUBLIC_IP:8318` блокируется firewall.

### Не переносим и не запускаем

- [ ] **DROP** `qwen-ifriend-tunnel.service` и старый порт `11435`: сервис disabled/inactive, активная конфигурация использует `11434`, живых зависимостей от `11435` не найдено.
- [ ] **DROP** `tunnel-19012-healthcheck.service/.timer`, `tunnel-19012-notifier.service/.timer` и их drop-ins: они каждые 30/60 секунд запускаются из отсутствующих `/opt/pin888` / `~/pin888`, стабильно падают и засоряют journal.
- [ ] **DROP** `feed-bridge-sharpbook.service` (`19015 → 9015`) и его healthcheck: туннель остановлен с `2026-08-11`, remote listener отсутствует, текущий Forted работает без него. Не позволять старому `enabled`-состоянию случайно воскресить его после переустановки.
- [ ] **DROP** `feed-bridge-sharpbook-betslip.service`: он намеренно disabled/masked при BIA-only cutover `2026-08-13`; старый browser/Pinnacle betslip больше не является активным runtime.
- [ ] **DROP** Все `.bak`-копии feed-bridge units/healthcheck scripts и retired runtime. В migration manifest оставить только краткое описание старых назначений и портов — без исполняемых units, ключей и логов.

### SSH-материалы для оставшихся туннелей

- [x] **KEEP MINIMAL** Сохранить только SSH client config для alias `serverforvovka`, реально используемый private key и проверенную запись host key, необходимые Qwen/Ollama tunnel. Не переносить весь `~/.ssh` вслепую.
- [x] **KEEP MINIMAL** Для входящего VibeProxy сохранить только нужный `authorized_keys` fingerprint/ограничения и firewall/runbook; посторонние или неподписанные SSH-ключи не переносить автоматически.
- [x] Положить выбранные SSH private keys, `authorized_keys`, client config и host-key fingerprints только в зашифрованный backup с исходными owner/mode; не класть секреты в Git или обычный migration manifest.
- [x] После восстановления проверить оба направления SSH, host-key fingerprints и автоматический reconnect VibeProxy. Если новый SSH host key сервера не принят удалённой стороной, обновить её `known_hosts` контролируемо, не отключая проверку host keys.
- [x] Настроить для оставшихся туннелей разумный `Restart=on-failure`, `StartLimit*` и ограниченное логирование; не возвращать частые health timers, которые сами создают шум.

### Reverse-tunnels с этого Mac: результат повторной проверки

- [x] **KEEP TEMPORARILY** `dev:2222 → Mac:22`: это намеренный LaunchAgent `com.ealev.ssh-reverse-dev-ssh`, а не серверное приложение. На cutover сохранить, чтобы не оборвать возможный SSH-доступ к Mac; порт закрыть либо перевести на Tailscale после отдельного подтверждения. Сейчас его постоянно сканирует интернет, поэтому он не должен оставаться публичным бесконечно.
- [ ] **DROP** Не возвращать `dev:8100/8101`: на Mac нет listener `8100`, текущий tunnel отвечает reset; `8101` имеет локальный Python listener, но dev-tunnel к нему фактически не поднят. Выбранные серверные сервисы на эти порты не ссылаются.
- [x] **KEEP** `dev:8318 → Mac:8318` только loopback для VibeProxy. На старом сервере `GatewayPorts yes` ошибочно превратил даже явный `127.0.0.1` bind в wildcard; на новом использовать `GatewayPorts clientspecified`/отдельный tunnel-user и подтвердить, что public `8318` недоступен.
- [x] **DONE 2026-08-13** Отключить конфликтующие LaunchAgents `com.ealev.ssh-tunnel-dev` и `com.ealev.ssh-reverse-dev`: они публиковали мёртвые `8100/8101`, конфликтовали и создавали поток SSH-auth/log. После отключения listeners `8100/8101` исчезли; рабочие `2222` и `8318` остались.
- [x] После cutover оставить на Mac по одному LaunchAgent на каждую реальную функцию, добавить `ExitOnForwardFailure`, backoff и bounded logs; дубли `com.ealev.ssh-tunnel-*`/`ssh-reverse-*` не должны одновременно публиковать один порт.

## 1.10 Factory Droid и Codex

- [x] **KEEP** Factory Droid remote для пользователя `ubuntu`.
- [x] Перенести `.factory` config/session/state без старых ротированных логов.
- [x] Переустановить свежий Droid binary; не переносить исполняемый `(deleted)` inode.
- [x] Вернуть `factory-droid-remote.service` только после проверки relay и ограничений restart/loging.
- [x] **KEEP** Codex app-server и `/home/ubuntu/.codex`.
- [x] Перенести Codex config/sessions/DB/plugins; исключить пересоздаваемый cache и `.tmp`, где это безопасно.
- [x] Переустановить один Codex runtime; не переносить одновременно standalone и дублирующий global npm package.

## 1.11 Старые или спорные приложения

- [x] **CHOSEN** Не переносить и не восстанавливать Travel Assistant / Terra Incognita (`/srv/travel-assistent`): service disabled, текущий Nginx route возвращает 502, приложение не требуется на новом `dev`.
- [x] **VERIFIED** Код и roadmap сохранены в GitHub: `docs/IDEAS.md` добавлен отдельным commit `5c73004d06a41b235e4f46ef8c221b3251d4d75e`; локальный `main` точно совпадает с `origin/main` (`DoroninDobroCorp/TerraIncognita`).
- [ ] **DROP по выбранному решению** Не переносить untracked `.factory/settings.json`, старые `map/app.html.bak*`, ignored `backend/.env`, cache (~29 МБ) и `backend/data` (~100 КБ). Последний содержит старые journal/visits/community/gamification JSON от `2026-02-13`; в Git их нет, после переустановки они будут утрачены.
- [ ] **DROP** Не переносить `/home/ubuntu/backend`: это старая дублирующая browser-profile копия; действующие RobinArb profiles сохраняются из выбранных рабочих путей `/srv/robinarb/current`.
- [ ] **DROP** Не переносить `/home/ubuntu/travel-backend.tar.gz`: старый архив относится к уже исключённой Terra Incognita.
- [ ] **DROP** Не переносить Kiro CLI/config/sessions (~820 МБ): живого процесса или зависимости выбранных сервисов нет; установить заново по запросу.
- [ ] **DROP** Не переносить OpenCode binaries/config/cache: живого процесса или зависимости выбранных сервисов нет; установить заново по запросу.
- [x] **COLD BACKUP ONLY** Для Antigravity сохранить вне нового `dev` маленький зашифрованный rescue-набор: Git bundle, patch четырёх tracked-изменений и manifest/архив только уникальных исходников из untracked. Не восстанавливать его на новую production-машину; исключить `.env`, binaries, cache, старые tar/backup-копии и macOS metadata.
- [ ] **DROP** Не переносить сломанную установку GitHub Copilot CLI и семь старых runtime/cache (~864 МБ); при необходимости установить заново.
- [ ] **DROP** Не переносить Windsurf/Codeium (~416 МБ; неактивен с февраля); при необходимости установить заново.
- [ ] **DROP** Не переносить старые Remote VS Code builds. Если удалённый редактор понадобится, он сам установит один актуальный server build.
- [ ] **DROP** Не переносить Bun runtime/config/cache; установить по lock-файлу конкретного выбранного проекта, только если сборка его потребует.
- [ ] **DROP** Не переносить Forge state; живых зависимостей выбранных сервисов не найдено.
- [ ] **DROP** Не переносить Go toolchain/build cache; живых зависимостей выбранных сервисов не найдено, при необходимости установить заново.
- [x] **INSTALL FRESH** Установить Rust toolchain заново для Forted по `rust-toolchain`/lock-файлам; старые `rustup`, Cargo registry и build cache не переносить.
- [ ] **DROP** Lev (~1,1 ГБ старых логов, живого сервиса нет).
- [ ] **DROP** BMAD broken links/config для отсутствующего `/srv/bmadgram-lite`.
- [ ] **DROP** Пустой pyenv.
- [ ] **DROP** Не переносить `ealev_shared`: живых ссылок выбранных сервисов не найдено; как исторический runtime-архив он не нужен на чистом `dev`.
- [ ] **DROP** Старые test/check каталоги и screenshots (`betfair_check`, `betfair_sport_check`, `vbet_check`, `report`).

---

# 2. PostgreSQL: какие данные переносить

Переносить логическими dump (`pg_dump`/`pg_dumpall --globals-only`), а не копией `/var/lib/postgresql`.

- [x] **KEEP** Роль `up_admin`, права и ownership объектов.
- [x] **KEEP** БД `universal_projecter` (~18 МБ; extensions `ltree`, `uuid-ossp`, `plpgsql`).
- [ ] **DROP — рекомендуется** Не переносить БД `ai_orchestrator` (~7,6 МБ): это старое имя production-БД из ранней архитектуры Universal Projecter, не БД Ouroboros. Сейчас в ней 0 пользовательских таблиц/views/functions, только `plpgsql`, 0 подключений и нет записанных пользовательских данных. Рабочий Universal Projecter использует выбранную выше БД `universal_projecter`.
- [ ] **DROP** Не переносить `universal_projecter_test`: пустая test-БД без пользовательских данных.
- [ ] **DROP** Не переносить `ai_orchestrator_test`: пустая test-БД без пользовательских данных.
- [ ] **DROP** Не переносить `up_live_lock_test_20260806_b`: одноразовая пустая test-БД.
- [x] Сохранить globals dump, отдельный custom-format dump `universal_projecter`, schema-only dump и текстовый inventory.
- [x] Проверить каждый dump через `pg_restore --list`.
- [x] Сделать пробное восстановление хотя бы `universal_projecter` в отдельную временную БД до wipe.
- [x] Зафиксировать PostgreSQL major version 17 и необходимые extensions.

---

# 3. Docker: что переносить

- [x] **KEEP** RustDesk compose/data/custom image — см. раздел 1.7.
- [ ] **DROP** Не переносить остановленный `bmadgram-hub` (exited 5 недель назад, persistent mounts отсутствуют).
- [ ] **DROP** Остановленный `nostalgic_keller` (exited около 6 месяцев, код 127).
- [x] **COLD BACKUP ONLY** Один раз экспортировать неиспользуемый `big_value_postgres_data` (~178 МБ) в зашифрованный rescue-архив вне нового `dev`; на новую машину не восстанавливать. Это страховка от необратимой потери неизвестных старых данных, а не часть production backup.
- [ ] **DROP** Остальные крошечные unmounted volumes, если никакой сервис не выбран.
- [ ] **DROP** Старые Docker images (~10,8 ГБ) и build cache (~1,2 ГБ); на новой машине собирать/pull заново.
- [ ] **DROP** Старые Docker networks `livebets`, `ps3838_night_default`, если соответствующие стеки не возвращаются.
- [x] Сохранить `docker inspect`, image digests, compose config и список портов как manifest; сам runtime восстанавливать только для RustDesk.

Никогда не применять к старому или новому серверу слепой `docker system prune -a --volumes`.

---

# 4. Nginx, домены и TLS

- [x] **KEEP** `robinarb.com` и `www.robinarb.com`.
- [x] **KEEP** `projecter.54-38-65-155.sslip.io`.
- [x] **KEEP** `vesper.54-38-65-155.sslip.io`.
- [ ] **DROP** Не возвращать `54-38-65-155.sslip.io` / Terra route: приложение исключено, текущий upstream 502.
- [x] **KEEP** Вернуть рабочий RobinArb health/API listener `8088`, чтобы пользовательское поведение не изменилось; доступ ограничить утверждённым firewall allowlist, если он не должен быть публичным для всех.
- [ ] **DROP** Не возвращать listener `8090`: его upstream `8091` сейчас отсутствует и route возвращает 502.
- [x] Перенести Nginx-конфиги как референс и переписать чисто, не копировать всё вслепую.
- [x] Перенести `/etc/nginx/conf.d/20-robinarb-gzip.conf`, если RobinArb выбран.
- [x] Сохранить `/etc/letsencrypt` в зашифрованном аварийном архиве, но на новой машине чисто выпустить/подключить сертификаты только для `robinarb.com`, `projecter...` и `vesper...`; сертификат исключённой Terra не возвращать.
- [x] Сохранить список доменов, expiry и текущих upstream/портов.
- [x] После reinstall проверить, что публичный IPv4 прежний, прежде чем полагаться на `sslip.io`.

---

# 5. Пользователи, SSH и доступ

Цель cutover: сохранить рабочий доступ `ubuntu` и `teamlead`, не перенося лишний Linux-аккаунт. Усиление прав после миграции — только отдельным согласованным изменением, чтобы сейчас не сломать доступ.

- [x] **KEEP** Пользователь `ubuntu` с тем же UID/GID, где это необходимо для ownership.
- [x] **KEEP MINIMAL** Группу `robinarb` с прежним GID и членством `ubuntu`; отдельные login-пользователи/home `robinarb` и `evguslev` не возвращать.
- [x] **KEEP UNCHANGED** Пользователь `teamlead`, прежний UID/GID, SSH-ключи и действующий sudo. Широкий `NOPASSWD` сохранить на cutover, а пересматривать только после проверки и отдельного согласования.
- [ ] **DROP — подтверждено 2026-08-13** Не создавать на новой машине Linux-пользователя `evguslev`. Evg подтвердил, что заходит как `teamlead`, а `EvgusLev` — имя GitHub. На сервере у `evguslev` нет процессов, сессий, SSH-входов за доступный журнал, ownership в `/srv`, `/etc`, `/var/lib`, `/usr/local` или рабочих ссылок; home содержит около 5 КБ пользовательских файлов. Его отдельный SSH-ключ, членство `robinarb` и sudo-rule `evguslev → robinarb-push` не возвращать.
- [x] **COLD REFERENCE ONLY** Маленькие `.gitconfig`/SSH metadata `evguslev` уже сохранены внутри зашифрованного migration archive только на случай разбора истории. GitHub-аккаунт, авторство старых commit и remote repositories от удаления Linux-пользователя не меняются. Если Evg будет коммитить с `teamlead`, Git name/email настраивать в профиле `teamlead` отдельно.
- [ ] **DROP** Не возвращать исторического пользователя `win20ps38`: активные PS38 Claude units работают от `ubuntu`, ссылок на этот аккаунт в выбранном runtime нет.
- [x] Сохранить `authorized_keys` только выбранных пользователей `ubuntu` и `teamlead` с fingerprints и комментариями владельцев; mode `0600`, каталоги `.ssh` — `0700`.
- [x] На время cutover сохранить существующий дублирующийся ключ между `ubuntu` и `teamlead`, чтобы не изменить доступ. Выдать отдельные ключи можно отдельной задачей после приёмки.
- [x] Перенести только необходимые private keys для исходящих SSH/tunnels, только зашифрованно и с исходными строгими mode.
- [x] Перенести выбранные `~/.ssh/config`/known-host entries как референс, затем собрать минимальный config заново.
- [x] Сохранить прежние SSH host keys сервера в зашифрованном архиве и вернуть их на новом `dev`, чтобы hostname/IP не вызвали предупреждение `known_hosts`; перед запуском сверить fingerprints.
- [x] Пересобрать `/etc/sudoers.d` по inventory: поведение `ubuntu` и `teamlead` сохранить, правило `evguslev-robinarb` и невыбранные helpers не возвращать; проверить через `visudo -cf`.
- [x] В Docker group включить только `ubuntu`, потому что он управляет выбранным RustDesk; `teamlead` туда не добавлять.
- [x] Не переносить членство `ubuntu` в группе `lxd`: snap LXD уже отсутствует и выбранным сервисам не нужен.
- [x] Убрать глобальный `GatewayPorts yes`: проверка установила `2222 → SSH этого Mac`, `8100 → отсутствующий Mac-listener`, `8318 → VibeProxy этого Mac`. На cutover временно сохранить `2222`, исключить `8100/8101`, а `8318` сделать строго loopback; затем перевести `2222` на Tailscale или отдельный tunnel-user/key.

---

# 6. Системные конфигурации, которые нужны как backup/reference

Здесь переносится маленький read-only reference/manifest. Он не будет целиком скопирован обратно в `/etc`: на новой ОС из него устанавливаются только выбранные файлы.

- [x] `/etc/systemd/system` — только custom units и drop-ins, без слепого восстановления symlink enable-state.
- [x] `/home/ubuntu/.config/systemd/user` — только выбранные Factory/Codex user services; старые tunnel timers исключить.
- [x] `/etc/nginx` как reference; восстановить только выбранные routes.
- [x] `/etc/letsencrypt` зашифрованно как emergency copy плюс перечень выбранных сертификатов для чистого выпуска.
- [x] `/etc/ssh/sshd_config`, `sshd_config.d` и host-key fingerprints как reference.
- [x] `/etc/sudoers.d` как reference с последующим минимальным восстановлением выбранных правил.
- [x] `/etc/cron*` и user crontabs как reference; включить только идентифицированные выбранные jobs.
- [x] `/etc/docker/daemon.json`, если существует, как reference; на новом сервере применить log limits.
- [x] `/etc/logrotate.d` custom rules как reference; старые правила для исключённых сервисов не возвращать.
- [x] `/etc/systemd/journald.conf*` как reference, но применить новые лимиты.
- [x] `/etc/sysctl.d`, `/etc/security/limits.d` и firewall/nftables inventory как reference; firewall собрать default-deny заново.
- [x] `/etc/robinarb`, `/etc/ouroboros`, `/etc/ifriend-unified`, `/etc/vesper-contact-relations` — только выбранные конфиги, секреты отдельно зашифрованно.
- [x] `/usr/local/bin`, `/usr/local/sbin`, `/usr/local/libexec`, `/usr/local/lib` — inventory и только выбранные маленькие helpers; binaries переустановить/пересобрать.
- [x] Список manual APT packages, snaps, global npm packages, runtime versions и репозиториев; не использовать его как список для слепой установки.
- [x] Список enabled/failed systemd units, timers, listeners и Nginx routes до остановки и после финального delta.
- [x] `/etc/hosts`, hostname, timezone, locale и DNS — записать, но networking/cloud-init собрать средствами новой OVH image.
- [x] Tailscale ACL/name/routes inventory и выбранный `tailscaled.state`; state-файл хранить только как секрет.

---

# 7. Пользовательские настройки и данные `/home` - не переноси МАКСИМУМ, чтобы не копировать мусор

- [x] `.gitconfig`, `.config/gh`, shell/tmux конфиги — только конкретные используемые файлы; токены отдельно зашифрованно.
- [x] `.npmrc`, Python/package registry configs и другие token-bearing configs — только если нужны выбранной сборке, только зашифрованно.
- [x] `.codex` — config, sessions/archived sessions, DB и пользовательские plugins; исключить `packages`, `.tmp`, cache, app-server logs и runtime binaries.
- [x] `.factory` — config/auth/session/state и выбранные plugins; исключить ~782 МБ логов, cache, temp и старые backup-копии.
- [x] **KEEP MINIMAL** Для выбранного PS38 Claude перенести `/home/ubuntu/.claude` и `/home/ubuntu/.config/ps38-claude` из зашифрованного supplement; не переносить debug/cache/logs за пределами уже проверенного минимального снимка и не создавать отдельный профиль `teamlead`.
- [ ] **DROP** Не переносить сломанный `.copilot` state/cache; установить заново по запросу.
- [ ] **DROP** Не переносить `.kiro`/Kiro state; установить заново по запросу.
- [x] Browser profiles `paddy_real_profile`, `betfair_sport_profile` и реально используемые profiles внутри RobinArb — зашифрованно, после проверки путей и без browser binary cache.
- [x] Для iFriend установить `faster-whisper` заново и скачать модель `medium` после переустановки; старый Hugging Face cache ~1,53 ГБ не переносить.
- [ ] **DROP** Не переносить `.semantic_search` model: выбранные сервисы на неё не ссылаются.
- [x] Все выбранные dirty Git repos/worktrees и untracked source/data — через `git bundle` + patch + manifest + компактный архив, независимо от рабочих директорий.
- [x] Из `~/bin`/`~/.local/bin` сохранить inventory; переносить только идентифицированные маленькие scripts выбранных сервисов. Droid/Codex/Rust и другие binaries установить заново.

Не переносить: `.cache/pip`, `.npm/_cacache`, Go build cache, Cargo registry cache, editor server binaries, `node_modules`, `.venv`, Playwright browsers до унификации версий, старые логи и `/tmp`.

---

# 8. Стоп-кран перед нажатием OVH `Confirm`

Все пункты ниже обязательны независимо от выбора приложений.

Текущая dry-run оценка минимального выбранного payload — примерно 2,6 ГБ до служебных manifest/dumps и сжатия; с cold-rescue и запасом планируем менее 4 ГБ. На `serverforvovka` сейчас свободно ~50 ГБ, на Mac ~18,9 ГБ, поэтому места достаточно при условии, что мы не копируем старые `/srv/backups`, Docker cache/images и пользовательские caches целиком.

- [x] **DONE preliminary 2026-08-13** На `serverforvovka` создан каталог `/srv/dev-migration-backups/dev-20260813T191053Z` mode `0700`.
- [x] **DONE preliminary 2026-08-13** Полный зашифрованный preliminary archive ~1,5 ГБ оставил на `serverforvovka` ~48 ГБ свободно.
- [x] **DONE preliminary 2026-08-13** Секреты находятся внутри age-архива. Raw identity — только в защищённом Mac Library; отдельная recovery-копия identity зашифрована существующим SSH Ed25519 key и проверена.
- [x] **DONE preliminary 2026-08-13** Полный age-архив скачан на Mac; там же checklist, runbook, RESTORE_ORDER, recovery identity и checksum.
- [x] **DONE preliminary 2026-08-13** Выбранные Git repos сохранены bundle + binary worktree/index patch + untracked manifest независимо от рабочих директорий.
- [x] **DONE preliminary 2026-08-13** Custom RustDesk image экспортирован, zstd проверен, `docker load` на `serverforvovka` дал тот же image ID.
- [x] **DONE preliminary 2026-08-13** PostgreSQL custom dump прошёл `pg_restore --list` и реальное restore в отдельную временную БД: найдено 125 relations; тестовая БД затем удалена.
- [x] **DONE preliminary 2026-08-13** Все созданные zstd archives прошли `zstd -t`; полный age archive на Mac полностью расшифрован и прочитан через `tar -tf` без извлечения.
- [x] **DONE preliminary 2026-08-13** SHA256 полного архива совпал на `dev`, `serverforvovka` и Mac: `93e94824771e0ab284f8496b6c8fd1083652274b0934ffc9e978a4ba05fea6d1`.
- [x] **DONE supplement 2026-08-13** После решения сохранить PS38 Claude создан отдельный age-архив 76 МБ; checksum `aff448386074f0877ac010d4758afab443cc394e4ab5bff0738cb7cb6b608edd` совпал на трёх площадках, полная расшифровка и чтение 1117 tar-members на Mac прошли.
- [x] **DONE preliminary 2026-08-13** Зафиксирован metadata inventory владельцев/режимов/UID/GID выбранных деревьев.
- [x] **DONE preliminary 2026-08-13** Зафиксированы listeners, connections, units/timers, env paths через unit reference, packages, Docker/Nginx/TLS/Tailscale/health manifests.
- [x] Из OVH UI сверить выбранный публичный SSH key fingerprint.
- [x] Проверить доступ к OVH web/KVM console и 2FA на аккаунте.
- [x] Непосредственно перед `Confirm` ещё раз проверить, что операция относится к `vps-600a189b.vps.ovh.net`, а не к `serverforvovka`.
- [x] Подтвердить Ubuntu 26.04 LTS и режим полного стирания системного диска.
- [x] Перед финальным dump/delta остановить все пишущие сервисы в зафиксированном порядке; простой начинается только в этот момент.
- [x] **DONE preliminary 2026-08-13** Создан `RESTORE_ORDER.md`, скопирован на Mac и `serverforvovka`; перед wipe в него добавить final archive ID/checksum.
- [x] Выполнить отдельный pre-wipe probe: расшифровать один секрет, открыть один archive, проверить один dump, прочитать Tailscale state metadata без вывода секрета.
- [x] Только после всех проверок и реально проверенного временного RustDesk нажать OVH `Confirm`.

---

# 9. Порядок чистого восстановления

- [x] Войти опубликованным в OVH SSH-ключом, проверить OVH console и сразу сверить fingerprint сервера.
- [x] Обновить систему и установить security updates; distribution upgrade не запускать.
- [x] Создать 8 ГБ swap с низким `vm.swappiness` и проверить сохранение после reboot.
- [x] Настроить hostname `dev`, timezone UTC, NTP и locale.
- [x] Создать выбранных пользователей/группы с прежними UID/GID и согласованными sudo/access semantics.
- [x] Вернуть проверенные SSH host keys, настроить SSH и восстановить прежнюю Tailscale identity до закрытия публичного SSH firewall-ом.
- [x] Включить default-deny firewall одновременно для IPv4 и IPv6 по утверждённому списку портов.
- [x] Установить PostgreSQL 17 и extensions; восстановить globals и только `universal_projecter`.
- [x] Установить Docker из официального репозитория и настроить log limits.
- [x] Установить Nginx/Certbot и только выбранные virtual hosts.
- [x] Установить только нужные runtimes: Python, Node, Rust и выбранный browser stack; Go/Bun/Kiro/старые editor servers не ставить без зависимости.
- [x] Восстановить secrets с корректными owner/mode (`0600` для файлов, `0700` для каталогов).
- [x] Восстанавливать сервисы по одному: data → code/build → config → unit → health-check; следующий сервис включать после проверки предыдущего.
- [x] Восстановить RustDesk одним из первых и проверить новым внешним сеансом.
- [x] Восстановить PostgreSQL-зависимые приложения.
- [x] Восстановить Nginx и выпустить/проверить TLS для выбранных доменов.
- [x] Вернуть Qwen/VibeProxy и подтверждённые reverse tunnels только после ограничения `GatewayPorts`/`PermitListen` и firewall для обеих IP-семей.
- [x] Выполнить reboot и повторный полный smoke-test.
- [x] Убедиться, что Tailscale Admin показывает тот же узел `dev`, IP/MagicDNS не изменились; старый node не удалять и новый не создавать. Благодаря сохранённым SSH host keys штатного обновления `known_hosts` быть не должно.

---

# 10. Чтобы порядок держался: автоматическая гигиена

Все пункты этого раздела выбраны как policy нового сервера. Автоматике разрешена только очистка явно пересоздаваемого мусора; уникальные данные она лишь показывает в отчёте.

## 10.1 Логи

- [x] Ограничить journald: `SystemMaxUse=1G`, `SystemKeepFree=10G`, `MaxRetentionSec=14day`, compression enabled; после применения проверить фактические limits.
- [x] Не включать rsyslog по умолчанию: journald достаточно. Если конкретному сервису нужен текстовый log, писать только его и ротировать, не дублировать весь journal в `syslog`.
- [x] Для каждого выбранного приложения, пишущего файл, создать `logrotate`: daily/size-based, `rotate 7-14`, `compress`, `delaycompress`, `maxsize`.
- [x] Для Factory Droid/Codex направить stdout/stderr в journal либо задать строгий лимит размера/числа файлов, чтобы не повторить ~800 МБ rotations; старые app-server logs не хранить бессрочно.
- [x] Для Docker daemon задать `json-file` limits `max-size=10m`, `max-file=3` и проверить их на RustDesk containers.
- [x] Для шумных services включить systemd rate limiting, `Restart=on-failure`, разумные `RestartSec`/`StartLimit*`; постоянный restart loop должен переходить в failed и alert, а не бесконечно писать лог.
- [x] Ограничить systemd coredumps (`MaxUse`/`KeepFree`) и не сохранять core для обычных Python/Node worker без отдельной debug-задачи.
- [x] Не создавать health timers чаще одной минуты без необходимости; успешная проверка не должна писать отдельную строку в journal каждый раз.
- [x] Для Mac LaunchAgents, создающих reverse SSH tunnels, использовать один owner plist на порт, `ExitOnForwardFailure`, backoff и ограниченный unified log; не писать бесконечный stderr в `~/.lev/logs` или `/tmp`.

## 10.2 Временные файлы и кэши

- [x] Оставить `systemd-tmpfiles-clean.timer`; задать TTL `/tmp` 10 дней. Persistent runtime никогда не хранить в `/tmp`.
- [x] Scratch хранить в `/srv/scratch` или `/var/tmp`; каждый scratch-каталог обязан иметь owner/task/created/expiry manifest.
- [x] Автоматически удалять только каталоги, явно объявленные disposable scratch. Dirty repos/worktrees/untracked files — только отчёт и ручное решение.
- [x] Если snap остаётся, установить `refresh.retain=2` и еженедельно удалять только disabled revisions. LXD, CUPS и desktop snaps не устанавливать без реальной зависимости.
- [x] Ежемесячно запускать size/age report по npm/pip/Go/Cargo/editor caches; автоматически чистить только стандартные download/build caches старше 30 дней и лишь при превышении общего budget 5 ГБ.
- [x] Playwright browsers чистить только после построения списка project `.links`/lock references; сохранить все revisions, нужные выбранным сервисам, до унификации версий.
- [x] Hugging Face models не чистить по возрасту: модель имеет manifest владельца (`iFriend`) и удаляется только при удалении функции или подтверждённой повторной загрузке.
- [x] APT cache чистить штатным `apt autoclean`; `autoremove` выполнять только после предварительного отчёта и review.
- [x] Ввести общий soft budget: `/home/ubuntu/.cache` 5 ГБ, editor servers 1 актуальная версия каждого, package download caches 2 ГБ; превышение вызывает отчёт, а не удаление уникальных данных.

## 10.3 Docker

- [x] Все production-контейнеры описывать в compose, images фиксировать tag/digest; случайные `docker run` не оставлять production-сервисами.
- [x] Перед deploy сохранять один явно tagged проверенный rollback image; RustDesk custom image дополнительно хранить во внешнем backup.
- [x] Еженедельно чистить только неиспользуемый build cache старше 14 дней, после отчёта и без `--volumes`.
- [x] Ежемесячно удалять dangling images старше 30 дней; tagged images — только если не входят в current/rollback manifests.
- [x] Никогда не запускать automatic volume prune или общий `docker system prune -a --volumes`.
- [x] Alert при Docker disk usage >20 ГБ или росте >5 ГБ за неделю.
- [x] Раз в месяц сверять containers/volumes/networks с compose manifests; неизвестное сначала помещать в отчёт и cold-backup, не удалять молча.

## 10.4 Releases, staging и worktrees

- [x] Постепенно привести приложения к layout `/srv/apps/<app>/releases`, `current`, `shared`; persistent data — `/var/lib/<app>`, secrets — `/etc/<app>`. Не переписывать рабочие пути одновременно с cutover без необходимости.
- [x] Deploy-script хранит current + 1 проверенный rollback release и удаляет более старые только после успешного health-check и внешнего backup.
- [x] Staging имеет manifest владельца/задачи и срок review 14 дней. Просроченный staging не удаляется автоматически, если dirty/untracked; он попадает в отчёт.
- [x] Quarantine имеет причину, владельца и срок review 30 дней; просрочка попадает в отчёт и удаляется только после подтверждения.
- [x] Git worktrees удаляются штатно после закрытия задачи; еженедельный report показывает stale worktrees, ignored build outputs и размер.
- [x] Production checkout не должен оставаться dirty: deploy блокируется, пока изменения не закоммичены либо не сохранены bundle + patch + untracked archive.
- [x] Сборка выполняется в отдельном release/build workspace; `.venv`, `node_modules`, Rust `target` не размножаются внутри backup/rollback-копий.

## 10.5 Backup

- [x] Установить `restic` и настроить шифрованный incremental backup по SFTP на `serverforvovka`; recovery password/key хранить также на Mac вне обоих VPS.
- [x] PostgreSQL: daily logical dump `universal_projecter` + globals; retention 7 daily + 4 weekly + 6 monthly.
- [x] Файлы/config/secrets и выбранные persistent data: daily restic snapshot с тем же retention.
- [x] Локальный `/srv/backups` использовать только как короткий staging с лимитом 5 ГБ/72 часа, не как disaster recovery; удалять staging только после подтверждённого внешнего snapshot.
- [x] После каждого backup проверять exit code, возраст последнего snapshot и `restic check --read-data-subset`; полный `restic check --read-data` — ежемесячно.
- [x] Ежемесячно проверять выборочное восстановление; ежеквартально — полный restore drill в отдельный temp-каталог/БД.
- [x] Alert, если backup старше 26 часов, места на backup-сервере <20 ГБ или integrity check не прошёл.
- [x] Не включать в backup cache, logs, `node_modules`, `.venv`, Rust/Go build outputs, Docker image layers и `/tmp`.
- [x] На Mac хранить маленький disaster set: manifests/checksums, PostgreSQL dumps, SSH/Tailscale recovery material и ключ restic; не полагаться на один VPS.

## 10.6 Обновления и безопасность

- [x] Включить unattended security updates, но не автоматический distribution upgrade.
- [x] Не делать автоматический reboot production; создавать alert `reboot-required` и выполнять reboot в maintenance window.
- [x] Ежемесячно обновлять base images/runtimes и выполнять controlled reboot со smoke-test.
- [x] Firewall default-deny для IPv4 и IPv6. Базовый public allowlist: SSH `22` на время восстановления, HTTP/HTTPS `80/443`, RustDesk TCP `21115-21119` + UDP `21116`; `8088`, reverse ports и Tailscale UDP добавлять только после отдельной проверки назначения. Не открывать `631`, `7777`, `8090`, `8318` наружу или orphan `46439`.
- [x] Не устанавливать/удалить CUPS и Avahi: принтеры серверу не нужны.
- [x] LXD не устанавливать; старое случайное snap-установление уже отсутствует. На новой машине не создавать группу `lxd` и не включать в неё `ubuntu`.
- [x] SSH только keys; root/password login off; `X11Forwarding no`; forwarding только выбранным tunnel-users с `PermitListen`/`PermitOpen`.
- [x] Ежемесячный review пользователей, SSH keys, sudo, Docker group и активных SSH reverse-forwards.
- [x] Secrets с mode `0600`; автоматический audit world-readable/group-writable secret-like файлов выполняет только metadata-проверку без чтения/печати содержимого.
- [x] Certbot timer + weekly renewal dry-run/report + alert за 21 день до expiry.
- [x] Перед публикацией listener запускать автоматическую сверку `ss` с versioned IPv4/IPv6 allowlist; неожиданный public port делает deployment failed.

## 10.7 Ресурсы и мониторинг

- [x] Создать 8 ГБ swap. Для Ouroboros/browser/AI workers сначала задать `MemoryHigh`, `TasksMax` и restart backoff; `MemoryMax` включать после наблюдения реальных пиков, чтобы не убить нормальную задачу слишком низким лимитом.
- [x] Ограничить concurrency Ouroboros/browser workers: нынешние 12 процессов и прошлые OOM на машине без swap не должны повториться бесконтрольно.
- [x] Alert на OOM, swap >50%, RAM available <15%, load и необычный restart count.
- [x] Disk alerts на 75%, 85%, 90%; inode alert на 80%; при 85% автоматически останавливается только создание новых build/release, не production data.
- [x] Alert на failed systemd units, unhealthy Docker containers и выбранные health endpoints.
- [x] Еженедельный read-only report: `systemctl --failed`, public listeners, PPID=1 orphan candidates, broken symlinks, top disk growth, Docker/cache usage и stale timers.
- [x] Не останавливать PPID=1 автоматически: Codex/Factory и обычные daemons могут быть штатными; orphan process требует идентификации.
- [x] Ежемесячный capacity report по `/srv`, `/var`, `/home`, journal, Docker, PostgreSQL и backup repository.
- [x] PostgreSQL оставить с autovacuum; ежемесячно проверять размеры/блоат и long-running queries, не запускать blind `VACUUM FULL`.
- [x] Отдельно мониторить `/srv/ouroboros/data/observability`: сейчас около 957 МБ и эти blobs связаны с forensic replay/task history. Alert при 3 ГБ; старые blobs переносить/удалять только поддерживаемой referential-integrity процедурой после restic snapshot, никогда простым age-based `find -delete`.

## 10.8 Что запрещено автоочистке

- [x] PostgreSQL data и dumps без подтверждённого retention policy.
- [x] Docker volumes.
- [x] `.env`, SSH keys, auth/session/browser profiles.
- [x] Dirty Git repos, untracked files и worktrees.
- [x] Current release и один выбранный rollback release.
- [x] Playwright browser revisions без проверки зависимостей.
- [x] Hugging Face/model cache без владельца функции.
- [x] `/srv/quarantine` без manifest/TTL/уведомления владельца.
- [x] Любые backups до успешной проверки более нового внешнего backup.
- [x] Tailscale state, RustDesk identity/DB и SSH host keys без подтверждённой зашифрованной recovery-копии.

---

# 11. Приёмка нового `dev`

- [x] После reboot нет failed units; intentionally inactive/masked units перечислены в manifest.
- [x] Нет OOM, log storm и непрерывно рестартующих services; за 30 минут наблюдения restart counters стабильны.
- [x] RAM/swap/disk имеют безопасный запас; root disk <60%, journal <1 ГБ, swap не растёт без нагрузки.
- [x] Все выбранные health endpoints проходят локально и через нужные публичные routes.
- [x] PostgreSQL роли, БД, extensions и ownership проверены приложениями; лишних test/legacy БД нет.
- [x] Nginx routes не имеют неизвестных 502; исключённые Terra/8090 routes отсутствуют.
- [x] TLS renewal проходит dry-run для выбранных доменов.
- [x] Public listeners точно совпадают с утверждённым allowlist для IPv4 и IPv6; `631`, `7777`, `8090`, `8318`, `46439` закрыты.
- [x] Tailscale сохранил node `dev`, IP `100.95.47.52` и MagicDNS; другие устройства не перенастраивались.
- [x] SSH для `ubuntu` и `teamlead` и их нужные права работают как до миграции; host-key warning не появился. Linux-login `evguslev` отсутствует и его старый ключ не даёт доступ.
- [x] PS38 Claude: tunnel `19013/19100`, bridge `19011` и gateway `19012` слушают только loopback; оба health-check проходят; `claude --version` и реальный Opus smoke-test успешны от `ubuntu` и через разрешённый путь `teamlead → sudo ubuntu`; autoupdate timer выключен.
- [x] RustDesk проверен новым реальным клиентским сеансом после reboot.
- [x] Выбранные Telegram/bots, Qwen/VibeProxy и подтверждённые tunnels проверены end-to-end.
- [x] RobinArb real-bet функции остаются заблокированы до отдельной проверки BIA proof/place contract; затем разрешаются контролируемо.
- [x] Backup выполнен с новой машины, integrity check и тестовый restore прошли.
- [x] Manifest фактической системы, firewall allowlist, restore runbook и checksums сохранены на Mac и `serverforvovka`.
- [x] После 24 часов стабильной работы выполнен повторный health/capacity/log review; только затем удаляются временный RustDesk и migration archives согласно retention.
