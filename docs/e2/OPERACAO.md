# Operação do Abaulytics industrial

## Preparar a bancada

Use Node.js 24 para os testes TypeScript/SQLite e Python 3.11 ou superior com as dependências de `api/requirements.txt`. Execute na raiz do projeto.

```powershell
npm.cmd ci
python -m pip install -r api/requirements.txt
npm.cmd run typecheck
npm.cmd run test:security
npm.cmd run test:api
python -m api.validate_bench
```

O último comando inicia a API e o coletor em processos locais separados, simula 100 chapas, acompanha as atualizações HTTP e confere o PDF, o CSV e o webhook. O ensaio usa credenciais descartáveis e bancos temporários.

Na medição manual de bancada, o resultado é arredondado a 1 µm conforme RN01/RN02. A bancada exibe **Sucesso** abaixo de 11,800 mm, **Atenção** entre 11,800 e 12,000 mm inclusive e **Crítico** acima de 12,000 mm. A faixa de Atenção usa os 0,20 mm do RNF01 como margem de aviso. As classificações de produção seguem a regra Conforme até 12,000 mm e Não conforme acima desse limite.

### Usar o app com a linha simulada

1. Use `.env.example` como referência para `.env`. Em `EXPO_PUBLIC_API_URL`, informe o endereço da API acessível pelo aparelho. Fora do desenvolvimento, o app exige HTTPS. Configure responsável e contato antes de distribuir. `CORS_ORIGINS` vazio atende o app nativo.
2. Configure as variáveis de serviço no ambiente dos processos Python. Use caminhos separados dos bancos legados. Na bancada, os bancos podem ficar em `.expo/e2-bancada/`.

   | Processo | Variáveis |
   | --- | --- |
   | API e manutenção | `ABAULYTICS_INDUSTRIAL_MODE=bancada`, `ABAULYTICS_INDUSTRIAL_DB`, `ABAULYTICS_COLLECTOR_KEY`, `ABAULYTICS_CORPORATE_KEY`. |
   | Coletor | Mesmo modo da API, `ABAULYTICS_SPOOL`, `ABAULYTICS_COLLECTOR_API=http://127.0.0.1:8000`, o mesmo `ABAULYTICS_COLLECTOR_KEY` e `ABAULYTICS_SENSOR_KEY`. |
   | Worker corporativo opcional na bancada | Modo e banco da API, `ABAULYTICS_WEBHOOK_URL` e `ABAULYTICS_WEBHOOK_SECRET`. |

   Gere credenciais distintas de pelo menos 32 caracteres. Uma opção para gerar cada valor é `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Mantenha os segredos de serviço fora das variáveis públicas do Expo.

3. No ambiente da API, ative a calibração de teste e provisione contas. As senhas são solicitadas no terminal.

   ```powershell
   python -m api.industrial_cli bench-calibration
   python -m api.industrial_cli provision OP-01 "Operador de teste" operador
   python -m api.industrial_cli provision AN-01 "Analista de teste" analista
   ```

   A mesma operação provisiona os papéis `lider`, `tecnico` e `auditor`.

4. Inicie cada processo no seu terminal.

   ```powershell
   python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
   ```

   ```powershell
   python -m uvicorn api.collector:app --host 127.0.0.1 --port 8001
   ```

   ```powershell
   npm.cmd run start
   ```

5. Crie uma OP com `python -m api.industrial_cli order OP-TESTE "Chapa de teste" 500`. No app, acesse **Produção com crachá**, entre como operador, busque a OP e abra o lote. Aguarde a sincronização do coletor e execute `python -m api.industrial_cli simulate --count 100`.
6. Confira as chapas 50 e 100 no dashboard. Entre como Analista ou Líder para aplicar o filtro por OP em **Histórico**, verificar a tendência e compartilhar PDF e CSV. Os filtros usam dias UTC e incluem a data final inteira. A exportação inclui todas as páginas do recorte consultado.

## Contratos de integração

### Sensor e câmera

- O sensor envia `POST /v1/passage` ao coletor com Bearer próprio e os campos `line_id` (`linha-1`), `lot_id`, `sequence` (1 em diante) e `observed_at` (ISO 8601 com fuso). Depois de uma lacuna, reenvia os eventos em ordem a partir da sequência informada. `GET /v1/status` retorna o lote e o último número recebido.
- O coletor chama `POST {ABAULYTICS_CAMERA_URL}/captures` com Bearer da câmera. O pedido contém `sample_key` (`lote:sequência`), `observed_at`, `expires_at` e `calibration_id`. A ponte da câmera usa o identificador para preservar e devolver o par original em pedidos repetidos. Respeite a janela física da chapa. Uma janela vencida sem par retorna HTTP 410.
- A resposta contém `left` e `right`. Cada vista usa `mime` (`image/jpeg` ou `image/png`), `base64` e `captured_at`, com até 10 MiB de imagem. O timestamp representa a exposição real. Um par fora da tolerância de sincronia gera falha amostral.
- O spool persiste o par e envia `POST /v1/collector/samples`. O servidor reconhece a repetição pelo lote e sequência e rejeita conteúdo conflitante. Quando o servidor confirma a amostra, o coletor libera os BLOBs do spool e mantém o identificador para deduplicação.

### Ordens e webhook corporativo

- `PUT /v1/corporate/orders/{numero}` aceita `width_mm`, `product` e `status` (`disponivel` ou `encerrada`). Use o Bearer corporativo. Encerre o lote antes de alterar uma OP em operação. A repetição do mesmo conteúdo é idempotente.
- Execute um worker `python -m api.industrial_cli webhook` por instalação. Ele envia leituras classificadas com `event_id` no corpo e em `Idempotency-Key`. O destino registra uma vez por ID e retorna 2xx ao aceitar, inclusive se já havia recebido o evento.
- Valide `X-Abaulytics-Signature` em tempo constante comparando com `sha256=<hex>` do HMAC-SHA256 de `X-Abaulytics-Timestamp + "." + corpo HTTP bruto`. Confira a janela de tempo acordada. Uma falha de entrega mantém o evento na fila. A tentativa seguinte usa nova assinatura, mesmo ID e mesmo corpo.

## Calibração e troca de versão

1. Monte duas câmeras sincronizadas com base predominantemente vertical no plano da imagem, para que as epipolares retificadas cruzem a borda. Mantenha as extremidades visíveis, ilumine a estação e ajuste o contraste.
2. Fotografe um tabuleiro de dimensão física conhecida em pelo menos oito poses sincronizadas, com a resolução operacional. Alinhe o tabuleiro do primeiro par aos eixos horizontal e vertical da linha.
3. Prepare um manifesto JSON com `columns` e `rows` dos cantos internos, `square_mm`, `capture_skew_ms` e `pairs` como lista de caminhos relativos `["esquerda.png", "direita.png"]`. Execute `python -m api.industrial_cli calibrate manifesto.json calibracao.json`.
4. Com a conta técnica, registre o JSON e selecione a versão em **Produção → Configuração**. Encerre o lote antes de ativar outra combinação. A reversão reativa uma combinação anterior para novos lotes.

## Preparar produção e homologar

- Confirme os adaptadores de sensor, câmera e sistema corporativo com a Irani. Configure `ABAULYTICS_INDUSTRIAL_MODE=producao`, banco e spool próprios e a referência da política aprovada em `ABAULYTICS_APPROVED_POLICY`. Configure `ABAULYTICS_CAMERA_URL`, `ABAULYTICS_CAMERA_KEY` e `ABAULYTICS_CAPTURE_WINDOW_MS` no coletor. Defina a janela física e a tolerância de sincronia pela montagem real.
- Execute um coletor por estação e FastAPI atrás de TLS. Os clientes de serviço exigem HTTPS fora de loopback. Restrinja acesso aos volumes SQLite, faça cópias consistentes, teste restauração, dimensione as imagens e monitore espaço livre. Preserve o spool nas reinstalações da mesma instalação.
- Sincronize os relógios de sensor, câmera, coletor, servidor e aparelho. Mantenha o dashboard aberto no aparelho de referência e registre o crachá do observador. Colete flechas físicas rastreáveis, incluindo casos próximos de 12 mm, e variações reais de luz, poeira e velocidade. Anote as interrupções da cadeia durante o turno.
- Para calcular os indicadores, prepare um CSV `sample_id,reference_mm` com as referências físicas e um CSV `start,end` com as interrupções em ISO 8601.

  ```powershell
  python -m api.qualification --start 2026-11-18T08:00:00-03:00 --end 2026-11-18T16:00:00-03:00 --observer AN-01 --references referencias.csv --outages interrupcoes.csv
  ```

  O relatório inclui erro absoluto máximo, leituras sem renderização válida, tempo máximo da captura à tela e disponibilidade. Preserve também as evidências de resolução, velocidade e condições ambientais e a aprovação dos itens aplicáveis do RNF09. [Matriz de testes da E2](E2.md#7-plano-e-resultados-de-testes)

## Diagnóstico

| Sintoma | Verificação |
| --- | --- |
| Produção indisponível | Confira caminho do banco, modo da API e referência de política aprovada para produção. |
| OP ausente ou lote não abre | Confira OP disponível, papel de operador, calibração ativa e se existe lote aberto. |
| Lacuna na contagem | Reenvie em ordem a partir do número indicado. Se a recuperação for impossível, documente a interrupção e abra outro lote. |
| Par inválido | Confira a iluminação, enquadramento, sincronia, resolução e distância entre as chapas. |
| Amostra pendente | Restaure rede ou armazenamento e confira o spool. A fila repete o envio preservando a amostra. |
| Webhook pendente | Confira o worker, a assinatura e o retorno HTTP 2xx do destino. |
