# Auto Matcher prematch: recovery review

Дата аудита: 2026-08-10 (UTC)  
Production target: `serverforvovka:/srv/big_value`  
Staging only: `/Users/vladimirdoronin/VovkaNowEngineer/work_fold/new/auto_matcher_recovery_patch`

## Статус и границы

- Ничего не развёрнуто и не перезапущено.
- Production-файлы, контейнеры и БД в рамках этой подзадачи не изменялись.
- Pinnacle provider API не вызывался. Использовались только внутренние Analyzer/feed endpoints и разрешённый Cerebras endpoint.
- `bash /srv/big_value/scripts/check_no_pinnacle_api.sh` проходит на текущем production tree.

## Подтверждённая причина 404

В конфиге указан `qwen-3-235b-a22b-instruct-2507`. Cerebras снял эту модель 27 мая 2026 года. Production-замена — `gpt-oss-120b`:

- [официальный список моделей](https://inference-docs.cerebras.ai/models/overview);
- [официальный журнал deprecation](https://inference-docs.cerebras.ai/support/deprecation);
- [официальные параметры public model](https://inference-docs.cerebras.ai/api-reference/models/public-models).

Короткий authenticated probe с уже настроенной учётной записью вернул HTTP 200, `model=gpt-oss-120b`, один choice и `finish_reason=stop`. Содержимое ключа и ответа не выводилось.

Текущий retry ошибочно считает `model_not_found` проблемой credential: за один измеренный десятиминутный интервал было 312 записей `model_not_found` и 49 смен ключа, при этом `/health` продолжал отвечать `ok`.

## Что делает staging patch

### Модель и retry

- меняет модель на `gpt-oss-120b`;
- отправляет лимит в правильном поле `max_completion_tokens`, а не legacy `max_tokens`;
- типизирует Cerebras `model_not_found` как provider-wide configuration error;
- после первой такой ошибки latch до restart подавляет все последующие provider calls во всех sport/bookmaker combinations, не меняет ключ и не включает Gemini/Vertex fallback;
- немедленно выставляет `configuration_error=true` и unhealthy LLM status;
- даже уже запущенный параллельный успешный запрос не снимает latch.

### Fail-closed mapping contract

LLM-ответ сам по себе больше не является разрешением записи mapping.

Автоматический league mapping допускается только если одновременно выполнены все условия:

1. ID существуют в точном candidate set исходного запроса.
2. Вид спорта и оба букмекера совпадают точно.
3. Названия лиг равны после нормализации только регистра и пробелов.
4. Confidence конечный, в диапазоне `[0.95, 1]`.
5. Analyzer содержит однозначное one-to-one соответствие реальных fixtures.
6. Home и away совпадают точно после нормализации только регистра и пробелов; перестановка home/away запрещена.
7. `matchDate` есть у обеих сторон; разница стартов не больше 30 минут.
8. В prematch start не старше `now-5m`.
9. Любая неоднозначность или singles/doubles mismatch приводит к отказу.

Автоматический team mapping допускается только для точного имени (регистр/пробелы игнорируются), причём дополнительно должны совпасть соперник, home/away orientation, sport, bookmaker, обе league context и `matchDate`. Должна существовать ровно одна подтверждающая fixture pair.

Semantic aliases от LLM (например, `Fuerza Regia de Monterrey` ↔ `Fuerza Regia`) никогда не записываются автоматически. JSONL pending review/approval по умолчанию отключён (`pending_review_enabled: false`), поэтому все LLM-only aliases fail closed. Они попадут в очередь только при явном operator opt-in `LLM_MATCHER_PENDING_REVIEW_ENABLED=true`; до появления persistent deduplicated storage и защищённого approval API этот opt-in в production включать нельзя. Невалидный/нулевой/NaN/низкий confidence отклоняется.

### Scheduled start DTO

`GameData.MatchDate` уже есть в Analyzer, но `/online-match-data` его выбрасывает. Overlay добавляет одно backward-compatible поле `matchDate` в DTO и копирует существующее значение. На снимке до патча полное `/match-data` содержало ненулевой `matchDate` у 20/20 live и 761/761 prematch записей.

Единственный найденный потребитель `/online-match-data` — `auto_matcher`. Go JSON decoder игнорирует неизвестные поля, поэтому старые потребители не ломаются. Если поле когда-либо нулевое, новый matcher отказывает в auto-write. До одновременного выката Analyzer DTO matcher также безопасно откажет во всех auto-write из-за отсутствия evidence.

## Аудит уже записанных mappings 02:41–02:44 UTC

Точная runtime-трасса:

1. Cerebras перебрал все ключи на одинаковом 404.
2. В 02:40:51 старый код включил Gemini fallback.
3. В 02:41:02 Gemini предложил три league pairs с confidence 0.95.
4. Отключённая stage-2 validation была заменена в коде на безусловное `isValid=true`, поэтому league rows появились в 02:41:05/08/11.
5. Только после создания league pairs старый exact-name branch записал семь team pairs.
6. В 02:44:17 Gemini записал ещё семь alias team pairs.

Следовательно, это не автономный exact path «несмотря на 404»: первопричиной записи league mappings был fallback после 404; exact branch стал доступен уже после него.

### Фактическое расписание

Все нижеуказанные пары имеют точное совпадение sport, home/away и start между центральным Pinnacle browser feed и Volcano Analyzer data.

| League mapping | Pinnacle fixture | Volcano fixture | Start UTC | Оценка |
|---|---|---|---|---|
| `uruguay metro league` ↔ `uruguay liga metro` | Club Atletico Olimpia — Urupan de Pando | Club Atletico Olimpia — Urupan de Pando | 2026-08-10 23:15 | корректно |
| то же | Club Trouville — Verdirrojo | Club Trouville — Verdirrojo | 2026-08-10 23:15 | корректно |
| то же | Colon FC — Albatros | Colon — Club Deportivo Albatros | 2026-08-10 23:15 | aliases подтверждены fixture |
| `mexico liga nacional de baloncesto profesional` ↔ `mexico lnbp` | El Calor de Cancun — Mineros Zacatecas | El Calor de Cancun — Mineros de Zacatecas | 2026-08-11 01:15 | корректно |
| то же | Dorados de Chihuahua — Gambusinos de Fresnillo | Dorados de Chihuahua — Gambusinos de Fresnillo | 2026-08-11 02:00 | корректно |
| то же | Diablos Rojos — Fuerza Regia de Monterrey | Diablos Rojos Del Mexico — Fuerza Regia | 2026-08-11 02:15 | aliases подтверждены fixture |
| `wnba` ↔ `united states usa wnba` | Atlanta Dream — Toronto Tempo | w/Atlanta Dream — w/Toronto Tempo | 2026-08-11 00:00 | корректно |

DB integrity audit:

- 3/3 новых league pairs существуют ровно в одном экземпляре;
- 14/14 новых team pairs существуют ровно в одном экземпляре;
- ни у одного из 28 затронутых team IDs нет второго conflicting edge;
- удалять эти Uruguay/Mexico/WNBA rows не требуется: они подтверждены независимым расписанием, хотя старый путь их записи был небезопасен.

## Exact staging files and SHA-256

Auto Matcher files:

```text
2d2e4593634fc1feaaa01bc4e48813a1158ad474741405f200093070ba790898  configs/common.yml
22d72cc1712bc41c475ce52f557e7f060041b14605f7ad173d67a00236472708  cmd/config/config.go
e5affbf0d8f1d5db51586f48137792a31efedbfa6f9c380949cf663b9693fc48  cmd/config/pending_review_env_test.go
c42ea90be3c2fe5cca72a3f685837b2d78ace32a1ddf75ce04999110bda53042  internal/entity/match-data.go
9a9109e9acc7938e41bc469114e7a92dcc940f53008789789fb2f9746936caf6  internal/entity/match_data_test.go
ea47a541e780766b7168a34dc590d1e9d351429f5105effe311c38f3786cd978  internal/service/llm-matcher.go
13bd365059c5c9f17dc4ce5d52222035635e64aec9f2ddc1d545cca165c2ba94  internal/service/llm-matcher-improved.go
a068826a6beddfd13567f0e4994b34cc4062da9ddb118f040bc9970bb01e925d  internal/service/llm-matcher-online.go
b80fc73fb0a04e0b78067c1bbd878935471f3e3c2359e43635288abcfb0593d6  internal/service/llm_retry_test.go
e3ab42508f24391298dda0a472161b174d4d3cc9216b612b6bdf91f4c522e2c6  internal/service/mapping-safety.go
3e3c50a1f09e8a5bc86192ec3e1d4a4458045549bb81673f04b75e8fdac4eab0  internal/service/mapping_safety_test.go
ae8a64a1fbeabe34e1dd49566d23825153267df47813866d401eb231e0d76c86  internal/service/online-matcher.go
bb36defe6d2a6e81622d66f3fa1086670841513e149417899734083704df1c88  internal/service/pending-pair-manager.go
92d3e1c1bbcb32592419d98b1b324a77f56cd9d79ec7a502fe25bc0f2d9b0a1f  internal/service/pending_pair_manager_opt_in_test.go
a2b857f06e53a61359bd0476d5c082c9034b0db570e14a72c0350774df03be68  internal/service/providers/cerebras.go
344824513d038f791843740dc7e705cc199939bdc3f06eed731264fb0e0ffbd3  internal/service/providers/cerebras_test.go
575db3faa94e243a3c995f3dacccccdcb6bfbfe51c26589547a3a72b12290adf  internal/service/providers/provider.go
```

Analyzer overlay files:

```text
c42ea90be3c2fe5cca72a3f685837b2d78ace32a1ddf75ce04999110bda53042  analyzer_overlay/internal/entity/match-data.go
16fb86d986bc64d2c379cab52c7ece40ffaedf05e82a31dcffa21149604d3d2a  analyzer_overlay/internal/entity/match_data_test.go
6cc545b164d5408aabe734503665a91837fc0fbf13ddc8347666af918f11c8ed  analyzer_overlay/internal/service/pairs-matching.go
```

Auto Matcher diff against current remote baseline: 17 files, 889 insertions, 273 deletions. Analyzer overlay: два однострочных production изменения и новый 19-line DTO contract test.

Важно: `analyzer_overlay/internal/service/pairs-matching.go` нельзя слепо заменять после параллельных Analyzer изменений. Нужно перенести только hunk `MatchDate: match.MatchDate` в актуальный canonical file и повторить тесты.

## Remote baseline hashes (precondition for review/deploy)

```text
9bfba5975cc4c7230ca6fbd6534b34ee80f1c599335312fcaeaab8cd0872ec62  backend/auto_matcher/configs/common.yml
aad07cd2540b48ab03c917d6499b08bd7704d829135fd4537f445e4ff28d9269  backend/auto_matcher/cmd/config/config.go
165996646a7f352b16d5a642141882be0d3f7b8f44e07c094f0a7fec320341cc  backend/auto_matcher/internal/entity/match-data.go
1f8256baf386270d0669897f3b4f8d111ef2f0e4e8b99f82166f5c747998c4a2  backend/auto_matcher/internal/service/llm-matcher.go
40e632b8d792b76d729ed700b0862ea7213e4d84aab56c2194132eaae7cac265  backend/auto_matcher/internal/service/llm-matcher-improved.go
d20cf32768f1387c5b10095228bd97f89e4df8336722f665368886c621df9ab8  backend/auto_matcher/internal/service/llm-matcher-online.go
3a882d140eaaff34bd64032005eec1c279f575669b093eca66429f0448965d43  backend/auto_matcher/internal/service/online-matcher.go
53f4e42deb9e70dd6b1af9432d6730ac591f56fb960727d5d02f0d7e024af612  backend/auto_matcher/internal/service/pending-pair-manager.go
caf2848f7be4dfd7a88a95095dfc772698045e20ba82f6cbbc2539b93ccb9d9a  backend/auto_matcher/internal/service/providers/cerebras.go
fe67cf7cb9e40a63ec0776002a6acf475a18c5941d1695584171773ee311cde7  backend/auto_matcher/internal/service/providers/provider.go
165996646a7f352b16d5a642141882be0d3f7b8f44e07c094f0a7fec320341cc  backend/analyzer/internal/entity/match-data.go
3e0bcd51ce5fada0f90f9cce5421abc6a7fecb8c28ca63f8c572904e1fea2845  backend/analyzer/internal/service/pairs-matching.go
```

Если любой baseline hash изменился, deployment нужно остановить и rebase hunk-by-hunk; нельзя перезаписывать dirty tree.

## Выполненные тесты

```text
go test ./...
PASS: all auto_matcher packages

go test -race ./internal/service ./internal/service/providers ./internal/entity ./cmd/config
PASS

go test -mod=mod ./internal/entity ./internal/service
PASS: isolated Analyzer tree with DTO overlay

bash /srv/big_value/scripts/check_no_pinnacle_api.sh
PASS
```

Regression coverage включает:

- root и nested Cerebras `model_not_found` payload;
- typed `APIError` и unrelated 404;
- `MaxCompletionTokens` вместо `MaxTokens`;
- ровно один provider call и ноль key updates на model error даже при двух последовательных matcher calls;
- immediate unhealthy configuration status;
- pending review default-off, explicit env opt-in и отсутствие JSONL files при default-off;
- exact sport/league/bookmaker/team/opponent/orientation;
- missing, past и >30m scheduled start;
- alias rejection;
- ambiguous duplicate fixture rejection;
- scheduled-start JSON contract.

## Рекомендуемый deploy после review

1. Снова проверить baseline SHA-256 и `git status`; не reset/clean.
2. Снять timestamped copies только перечисленных файлов.
3. Перенести Analyzer overlay hunk-by-hunk в актуальные файлы.
4. Перенести Auto Matcher files.
5. Запустить оба набора Go tests и no-Pinnacle-API guard.
6. До cutover зафиксировать максимальные `created_at`/IDs в `leagues_merge` и `teams_merge`.
7. Остановить оба старых auto matcher containers, чтобы прекратить текущий 404/fallback write path.
8. Собрать Analyzer и Auto Matcher images без запуска.
9. Пересоздать Analyzer live+prematch, затем проверить, что `/online-match-data` содержит ненулевой `matchDate`.
10. Только после DTO-проверки пересоздать `auto_matcher` и `auto_matcher_prematch`.
11. Наблюдать первый полный цикл: `gpt-oss-120b`, отсутствие Qwen 404/key rotation, только strictly evidenced auto-write; semantic pairs должны fail closed, pending API недоступен.
12. Сравнить DB IDs с pre-cutover watermark и вручную проверить каждую новую строку по fixture/start evidence.

Compose services: `analyzer`, `analyzer_prematch`, `auto_matcher`, `auto_matcher_prematch` из `/srv/big_value/docker-compose.master.yml`.

## Rollback

1. Сначала остановить оба auto matcher containers, чтобы rollback не создавал mapping rows.
2. Для code rollback восстановить timestamped copies и пересобрать соответствующие images. Не запускать старый retired-Qwen конфиг: либо оставить `gpt-oss-120b`, либо держать matcher остановленным.
3. Analyzer DTO можно откатить после остановки нового matcher; без DTO новый matcher всё равно fail-closed и не пишет mappings.
4. DB не откатывать по временному диапазону вслепую. Сравнить explicit IDs с pre-cutover watermark и удалить только конкретные доказанно ошибочные rows в транзакции после review.
5. Уже существующие Uruguay/Mexico/WNBA rows 02:41–02:44 сохранить: audit подтвердил их и не обнаружил duplicates/conflicting edges.
6. После rollback снова выполнить tests, no-Pinnacle-API guard и проверить health/logs.

## Credential note

Во время первого read-only вывода redaction не закрыл YAML list values, и LLM provider keys попали во внутренний tool transcript этой задачи. Они не записывались в staging и не использовались вне одного разрешённого model probe. Это не связано с `model_not_found`, поэтому patch не вращает ключи. После стабилизации ключи следует перевыпустить отдельной операцией безопасности.
