# Spike 2 — Sessão viva do Claude Agent SDK (RESULTADO)

**Data:** 2026-07-09
**SDK:** `@anthropic-ai/claude-agent-sdk@0.3.206`
**Modelo:** `haiku` → resolvido para `claude-haiku-4-5-20251001`
**Auth:** login do Claude Code da máquina (SEM `ANTHROPIC_API_KEY`).
Confirmado via `system/init` `apiKeySource: "none"` e `query.accountInfo()`:
`apiProvider=firstParty`, subscriptionType de assinatura, email/org presentes (não registrados aqui).

## Como rodar

```bash
cd spikes/agent-session
pnpm install
npx tsx session1.ts        # sessão viva, 6 mensagens, persiste .session-id
npx tsx session2.ts        # NOVO processo: resume + 2 mensagens
npx tsx probe-maxturns.ts  # sondagem: semântica do maxTurns (1 mensagem)
```

## Critérios de sucesso

### ✅ 1. Cache quente (custo por turn ~O(mensagem nova), não O(prefixo))

A cada turn o `input_tokens` "frio" fica em ~10 tokens (só a mensagem nova),
enquanto o prefixo inteiro (system prompt + histórico) volta via
`cache_read_input_tokens`. `cache_creation` cai a quase zero depois dos
primeiros turns. Isso é exatamente cache quente.

**Sessão 1 (uma sessão viva, 6 mensagens) — usage real por turn:**

| # | prompt | input (frio) | cache_creation | cache_read | output | total_cost_usd (acum.) | num_turns |
|---|--------|------|------|------|------|------|------|
| s1.1 | "what component is selected? use tools" | 30 | 8738 | 67104 | 396 | 0.026788 | 3 |
| s1.2 | "show its source (tools)" | 28 | 1969 | 82509 | 310 | 0.040555 | 3 |
| s1.3 | "one sentence: what does it do?" | 10 | 65 | 28370 | 118 | 0.044122 | 1 |
| s1.4 | "what file/line was the selection?" | 10 | 140 | 28435 | 78 | 0.047646 | 1 |
| s1.5 | "reply only: ok" | 10 | 95 | 28575 | 27 | 0.050838 | 1 |
| s1.6 | "one word: button or card?" | 10 | 48 | 28670 | 49 | 0.054056 | 1 |

> `total_cost_usd` é **cumulativo** na sessão viva (não por-turn). Custo total da sessão 1 ≈ **$0.054**.
> `input` (frio) estabiliza em 10 tokens; `cache_read` carrega o prefixo. Cache quente confirmado.

**Sobre a "queda" de `cache_read` 82509 → 28370 entre s1.2 → s1.3:** não é perda de
cache — é artefato de agregação. O `usage` do `SDKResultMessage` é a **SOMA sobre
todas as chamadas de API do loop agêntico daquela mensagem** (`num_turns` chamadas).
s1.1 e s1.2 usaram tools (`num_turns=3` → 3 chamadas de API cada); s1.3+ responderam
direto (`num_turns=1`). Dividindo `cache_read / num_turns`, o prefixo **por chamada
de API** cresce monotonicamente, como esperado de cache quente com histórico:

| # | num_turns | cache_read (agregado) | cache_read / chamada de API |
|---|---|---|---|
| s1.1 | 3 | 67104 | **22368** (divisão exata) |
| s1.2 | 3 | 82509 | **27503** (divisão exata) |
| s1.3 | 1 | 28370 | 28370 |
| s1.4 | 1 | 28435 | 28435 |
| s1.5 | 1 | 28575 | 28575 |
| s1.6 | 1 | 28670 | 28670 |
| s2.1 | 1 | 17663 (+cc 11461) | 17663 + 11461 = **29124** |
| s2.2 | 1 | 29124 | 29124 (bate exato com s2.1 cr+cc) |

Três verificações fecham: (a) 67104 e 82509 dividem EXATAMENTE por 3;
(b) a série por-chamada é monotônica crescente (22368 → … → 29124);
(c) `cr+cc` de s2.1 = `cr` de s2.2 token a token. A hipótese alternativa
(tool-list gigante dos MCP herdados saindo do prefixo após o ToolSearch) é
refutada pelos dados: o prefixo por chamada nunca encolheu.

### ✅ 2. Tools MCP in-process foram chamadas pelo modelo

Dois fake tools registrados via `tool()` + `createSdkMcpServer({ name: 'fieldsdk' })`,
servidos in-process (`type: 'sdk'`, com `instance`), status `connected` no init.

Sequência real de tool_use capturada:
`["ToolSearch", "mcp__fieldsdk__get_selection", "ToolSearch", "mcp__fieldsdk__get_component_source"]`

- `mcp__fieldsdk__get_selection` → modelo respondeu `PrimaryButton (src/components/PrimaryButton.tsx, line 42)`.
- `mcp__fieldsdk__get_component_source` → modelo descreveu o código corretamente.

(O `ToolSearch` intercalado é o mecanismo de *deferred tool loading* do SDK — ver Achado 3.)

### ✅ 3. Resume manteve contexto após kill do processo

`session1.ts` persistiu `sessionId` em `.session-id` e o processo encerrou.
`session2.ts` (processo NOVO) resumiu com `resume: sessionId` — mesmo `session_id` retornado —
e respondeu perguntas que só o histórico anterior podia responder, **sem usar tools**:

| # | prompt | input | cache_creation | cache_read | output | cost (acum.) | resposta |
|---|--------|------|------|------|------|------|------|
| s2.1 | "qual componente discutimos? (sem tools)" | 10 | 11461 | 17663 | 48 | 0.024938 | **PrimaryButton** |
| s2.2 | "e o file path exato?" | 10 | 1137 | 29124 | 70 | 0.030485 | **src/components/PrimaryButton.tsx** |

> Contexto sobreviveu ao restart do processo. No resume o cache é reconstruído uma vez
> (`cache_creation=11461` no 1º turn) e volta a ficar quente no 2º.

**Custo total do spike (sessão 1 + resume + sondagem maxTurns) ≈ $0.113.**

---

## Achados / divergências da API (SDK 0.3.206)

O brief assumia a API das docs de julho/2026. Divergências e surpresas encontradas:

1. **DEADLOCK de streaming input (achado crítico p/ o daemon).**
   Com `prompt` = `AsyncIterable<SDKUserMessage>`, o CLI **não emite `system/init`
   enquanto não receber a primeira mensagem do usuário**. Esperar o `init` antes de
   dar `push` na 1ª mensagem trava o processo (0 bytes de saída, sem erro).
   Correção: dar push na 1ª mensagem **imediatamente após `query()`**, independente do init.
   A primeira execução do spike travou por exatamente isso.

2. **`accountInfo()` é método do objeto `Query`**, não um export top-level.
   `const q = query(...); const acc = await q.accountInfo();`
   Retorna `{ apiProvider, tokenSource, apiKeySource, email, organization, subscriptionType }`.

3. **MCP servers do usuário são herdados por padrão.**
   Sem `strictMcpConfig: true`, o SDK herda TODOS os MCP servers configurados no
   Claude Code do usuário (Gmail, Figma, Sentry, Metabase da empresa, etc. — muitos
   `needs-auth`). Isso incha a tool-list e disparou o *deferred tool loading*: o
   modelo teve que chamar `ToolSearch` antes de achar `mcp__fieldsdk__*`.
   **Recomendação p/ o daemon: `strictMcpConfig: true`** para isolar só os tools do Field SDK.

4. **`system/init` é re-emitido a cada turn** no modo streaming (mesmo `session_id`,
   cache continua quente). É UMA sessão viva de verdade — não é restart — mas quem
   consome `init` precisa tolerar múltiplos.

5. **`SDKResultMessage.usage`** usa nomes snake_case da API Anthropic
   (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`,
   `output_tokens`) — bate com o brief. Além disso há `modelUsage`
   (camelCase, por modelo) e `total_cost_usd`.

6. **`total_cost_usd` é cumulativo** na sessão viva, não por-turn — calcular deltas.

7. **`maxTurns` é orçamento POR `query()`, não vitalício da sessão** (sondado
   diretamente — ver seção "Sondagem: semântica do maxTurns" abaixo). O histórico
   de turns de uma sessão resumida NÃO conta contra o `maxTurns` da nova `query()`.
   Nuance honesta: a soma de `num_turns` da sessão 1 deu exatamente 10 (= o limite)
   e nós fechamos a fila por conta própria, então os dados NÃO distinguem
   "por-mensagem" de "cumulativo dentro de UM stream `query()`". O doc do SDK
   ("Maximum number of conversation turns before the query stops") sugere
   cumulativo por-stream — o daemon deve assumir isso e dimensionar `maxTurns`
   por conexão, sabendo que um `resume` zera o orçamento.

8. **peer `zod`**: o SDK 0.3.206 declara peer `zod@^4.0.0`, mas o spike rodou sem
   problemas com `zod@3.25.76` (schema de input via `tool(name, desc, { shape }, handler)`).
   Warning de peer é não-fatal.

9. **alias `model: 'haiku'`** resolveu para `claude-haiku-4-5-20251001`.

## Sondagem: semântica do `maxTurns` (follow-up do review)

**Ambiguidade apontada:** a soma de `num_turns` da sessão 1 deu exatamente 10
(= `maxTurns` configurado), então os dados originais não distinguiam
"por-mensagem" de "orçamento cumulativo".

**Sondagem (`probe-maxturns.ts`):** a sessão no disco já acumulava **12 turns**
(10 da sessão 1 + 2 do resume). Resumimos com `maxTurns: 10` e 1 mensagem
("Responda somente: ok"). Se `maxTurns` fosse cumulativo sobre a vida da sessão,
12 > 10 deveria dar `error_max_turns` imediato.

**Resultado real:**

| subtype | is_error | num_turns | input | cache_creation | cache_read | output | resposta |
|---|---|---|---|---|---|---|---|
| success | false | 1 | 10 | 12938 | 17663 | 53 | "ok" |

**Veredito: `maxTurns` é orçamento POR chamada de `query()`** — histórico resumido
não conta. Cada `query()` (inclusive resume) nasce com orçamento cheio. O que a
sondagem NÃO prova: se dentro de UM stream vivo o orçamento é por-mensagem ou
cumulativo entre mensagens (a sessão 1 fechou a fila voluntariamente ao chegar em
exatamente 10). O doc do SDK sugere cumulativo por-stream; assumir isso no daemon.

## Arquivos

- `shared.ts` — fake MCP server (`get_selection`, `get_component_source`) + fila push-driven `AsyncIterable`.
- `session1.ts` — sessão viva, 6 mensagens, mede usage, persiste `.session-id`.
- `session2.ts` — resume em processo novo + 2 mensagens.
- `probe-maxturns.ts` — sondagem da semântica do `maxTurns` (1 mensagem).
- `usage-log.json` / `usage-log-s2.json` / `usage-log-probe.json` — evidência bruta de usage capturada.
