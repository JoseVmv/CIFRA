# CIFRA — Controle financeiro pessoal

Aplicativo local para acompanhar quanto dinheiro você tem, quanto entra, quanto sai
e como isso evolui ao longo do tempo. Roda inteiramente na sua máquina: os dados
ficam num arquivo SQLite dentro da própria pasta do projeto e nada é enviado para
a internet.

```
Saldo atual = saldo inicial + total de entradas − total de saídas
```

O saldo nunca é um número digitado à mão — ele é sempre derivado do histórico.
Transferências entre suas contas não aparecem nessa conta: elas não criam nem
destroem dinheiro, só o mudam de lugar.
O saldo inicial, por sua vez, vem do campo em **Usuário** ou, se você ativar
múltiplas contas, da soma das contas cadastradas.

---

## O que o app faz

- **Dashboard** com saldo atual, entradas, saídas e resultado do período.
- **Seletor de período por mês de calendário**: este mês, últimos 3 meses,
  últimos 6 meses, este ano ou tudo, com **setas para navegar** entre meses
  passados. Cards e gráficos respondem juntos.
- **Nova transação** em um diálogo rápido (entrada, saída ou transferência),
  com confirmação visual e sem recarregar a página.
- **Transferência entre contas**: mover dinheiro do banco para a poupança não é
  receita nem despesa. Ela fica fora de todo total, comparativo e limite de
  gasto — só muda o saldo de cada conta.
- **Compras parceladas**: "câmera em 10x" vira dez lançamentos mensais
  numerados, que aparecem cada um no seu mês. Dá para apagar só uma parcela ou
  a compra inteira.
- **Histórico** agrupado por dia, com busca por descrição (ignora acentos e
  maiúsculas), filtros de tipo, categoria e período, além de edição e exclusão.
- **Exportar** o que está na tela em CSV (para Excel ou padrão), JSON ou um
  extrato para imprimir/salvar em PDF, com filtros próprios de período, tipo,
  categoria, conta e busca.
- **Lançamentos recorrentes**: cadastre o salário, o aluguel ou uma assinatura
  uma vez e o app registra sozinho quando a data chega. Semanal, mensal ou
  anual, com data de início, fim opcional e pausa. O que ainda não aconteceu
  aparece **só** como barra pontilhada no gráfico de entradas e saídas, nas
  janelas de mais de um mês — é ilustração, não entra em nenhuma conta.
- **Análises**: entradas × saídas por dia, evolução do saldo acumulado,
  distribuição por categoria e **comparativo com o período anterior**. Todo
  gráfico tem uma visão em tabela equivalente.
- **Limites de gastos** por categoria, cada um com sua janela em meses. Ao passar
  de 90% do limite, o painel principal mostra um aviso que pode ser fechado.
- **Aba Usuário** com as configurações pessoais: seu nome e o saldo inicial,
  alterável a qualquer momento sem tocar no histórico.
- **Múltiplas contas** (opcional): cadastre seus bancos e carteiras e o saldo
  inicial passa a ser a soma deles. Com a opção ligada, cada transação é
  vinculada a uma conta, o histórico pode ser filtrado por ela e cada conta
  mostra o **saldo de hoje**, derivado do que passou por ali.
- **Resetar tudo** direto pela interface, em Ajustes, com confirmação por digitação.
- **Tema claro e escuro**, responsivo de celular a desktop.

---

## Tecnologias

| Camada  | Escolha |
|---------|---------|
| Backend | Node.js 24 · TypeScript · Express 5 · Zod |
| Banco   | SQLite via [`node:sqlite`](https://nodejs.org/api/sqlite.html) — módulo nativo do Node, sem dependência para compilar |
| Frontend| React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Recharts |
| Testes  | Vitest (+ Testing Library no frontend) |

Duas decisões que valem explicação:

- **`node:sqlite` em vez de `better-sqlite3`/Prisma.** O Node 24 já traz um driver
  SQLite embutido. Isso elimina compilação de módulo nativo (o ponto que mais
  quebra instalação no Windows) e um ORM inteiro, sem abrir mão de SQL
  parametrizado e migrations versionadas.
- **Dinheiro em centavos inteiros.** Nada de `float`: `R$ 10,50` é armazenado,
  trafegado e somado como `1050`. A interface converte só na hora de exibir.

---

## Pré-requisitos

- **Node.js 22.5 ou superior** (recomendado 24+) — é o que fornece o `node:sqlite`.
  Verifique com `node --version`.
- npm 9+ (vem com o Node).

---

## Instalação

```bash
npm install
```

Um único comando na raiz: o projeto usa workspaces do npm e instala backend e
frontend de uma vez.

---

## Como executar

### Desenvolvimento (dois servidores, com hot reload)

```bash
npm run dev
```

- API: <http://127.0.0.1:4000/api>
- Interface: <http://localhost:5173>

O Vite faz proxy de `/api` para o backend, então não há CORS no caminho e o
frontend usa sempre caminhos relativos.

Para rodar separadamente:

```bash
npm run dev:api    # só o backend
npm run dev:web    # só o frontend
```

### Produção local (um servidor só)

```bash
npm run build
npm start
```

Abra <http://127.0.0.1:4000>. Nesse modo o backend serve o build do frontend na
mesma porta — é a forma mais simples de usar o app no dia a dia.

### Atalho de um clique (Windows)

Para o uso do dia a dia não é preciso abrir terminal nenhum. Rode **uma vez**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
```

Isso cria um atalho **CIFRA** na área de trabalho e no menu Iniciar. A partir daí,
um clique faz tudo:

1. se o app já está rodando e o build está em dia, abre a aba na hora;
2. se você mexeu no código depois do último build, recompila sozinho e reinicia;
3. sobe o backend em segundo plano, sem janela de terminal;
4. espera a porta responder e abre <http://127.0.0.1:4000> no navegador padrão.

Enquanto compila (só quando é necessário), aparece um cartão discreto no centro
da tela. Se algo falhar, uma caixa de mensagem diz o quê e aponta o log.

| Arquivo | Para que serve |
|---------|----------------|
| `Iniciar CIFRA.vbs` | O que o atalho executa. Também funciona com duplo clique |
| `Parar CIFRA.vbs` | Encerra o servidor em segundo plano (os dados ficam intactos) |
| `scripts\criar-atalho.ps1` | Cria os atalhos e gera o ícone. Rode de novo se mover a pasta |
| `scripts\iniciar-cifra.ps1` | A lógica de subir o app; aceita `-Janela app` e `-SemNavegador` |
| `logs\` | Saída do servidor e do build, para quando algo dá errado |

Duas opções que valem conhecer:

```powershell
# Atalho que abre uma janela limpa, sem barra de endereço (cara de app de verdade)
powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1 -Janela app

# Só no menu Iniciar, sem sujar a área de trabalho
powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1 -SomenteMenu
```

O servidor iniciado pelo atalho continua rodando em segundo plano até você usar
`Parar CIFRA.vbs` ou desligar o computador — abrir o app de novo depois disso é
instantâneo. Para desenvolver com hot reload, `npm run dev` continua sendo o
caminho.

---

## Comandos disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe backend e frontend juntos |
| `npm run dev:api` / `npm run dev:web` | Sobe apenas um dos dois |
| `npm run build` | Compila backend (`tsc`) e frontend (`vite build`) |
| `npm start` | Roda o backend compilado servindo o frontend |
| `npm test` | Roda todos os testes |
| `npm run test:api` / `npm run test:web` | Testes de um lado só |
| `npm run typecheck` | Checagem de tipos nos dois workspaces |
| `npm run seed` | Preenche o banco com dados de demonstração |
| `npm run db:reset` | Apaga o banco e recria vazio |
| `npm run atalho` | Cria o atalho do Windows na área de trabalho e no menu Iniciar |

---

## Onde os dados ficam

```
data/finance.sqlite
```

Um único arquivo na raiz do projeto (criado no primeiro uso, junto com os
arquivos `-wal`/`-shm` do SQLite). **Para fazer backup, basta copiar essa pasta.**

O schema tem cinco tabelas:

```text
transactions                         accounts               budgets
├── id (uuid)                        ├── id (uuid)          ├── id (uuid)
├── type (income|expense|transfer)   ├── name               ├── category (única)
├── amount_cents (inteiro > 0)       ├── balance_cents      ├── limit_cents
├── description                      ├── position           ├── months (1–24)
├── category                         ├── created_at         ├── created_at
├── date (YYYY-MM-DD)                └── updated_at         └── updated_at
├── account_id          → conta vinculada (origem, nas transferências)
├── transfer_account_id → conta de destino (só nas transferências)
├── recurrence_id       → regra que gerou o lançamento
├── installment_group   → parcelas da mesma compra
├── installment_number / installment_total → "3 de 10"      settings
├── search_text → texto normalizado (busca sem acento)      ├── key
├── created_at                                              ├── value
└── updated_at                                              └── updated_at
recurrences
├── id (uuid)                   ├── start_date / end_date (fim opcional)
├── type, amount_cents          ├── active (pausada ou não)
├── description, category       └── last_run_date → marca d'água: até que dia
├── account_id                     a regra já foi considerada
└── frequency + day_of_month | weekday | month_of_year
```

Apagar uma conta **não apaga** as transações dela: o vínculo vira nulo
(`ON DELETE SET NULL`), então o histórico e o saldo permanecem intactos. O mesmo
vale para uma recorrência: apagar a regra não mexe no que ela já lançou.

O saldo inicial vive em `settings`, não como transação — assim ele pode ser
alterado quantas vezes for preciso sem inventar lançamentos no histórico. Com
`use_multiple_accounts` ligado, o valor efetivo passa a ser `SUM(accounts.balance_cents)`,
e o número digitado continua guardado para voltar a valer se a opção for desmarcada.

O schema evolui por migrations incrementais controladas por `PRAGMA user_version`
— bancos criados em versões anteriores são atualizados sozinhos ao subir o app,
sem perder dados.

### Resetar o banco

Há duas formas, e elas fazem coisas ligeiramente diferentes:

| Como | O que faz |
|------|-----------|
| **Ajustes → Resetar tudo** (na interface) | Apaga transações, contas, limites, recorrências e configurações, mantendo o arquivo. Pede que você digite `RESETAR` para confirmar |
| `npm run db:reset` (terminal) | Apaga o arquivo do banco inteiro e recria o schema vazio |

Qualquer uma das duas remove também os dados de demonstração.

---

## Transferências e compras parceladas

### Transferir entre contas

Com duas ou mais contas cadastradas, o diálogo de nova transação ganha um
terceiro tipo: **Transferência**. Em vez de categoria, ele pede origem e destino.

A regra que vale a pena guardar: **transferência não é receita nem despesa**. Ela
não entra em entradas, saídas, resultado, comparativo, distribuição por categoria
nem limites de gasto — e o saldo total do app não se mexe. O que muda é só o
saldo de cada conta: sai de uma, chega na outra.

É por isso que ela também é tratada à parte na exportação: nos CSV a coluna
`Valor` fica **vazia** nas transferências e o montante vai para a coluna
`Transferido`. Assim a promessa da coluna se mantém — somá-la dá o resultado do
período, sem contar duas vezes um dinheiro que só mudou de lugar.

### Saldo de hoje por conta

Cada conta mostra dois números em **Usuário**: o **saldo inicial** (o que você
digita) e o **saldo de hoje**, que o app deriva de tudo que passou por ali —
entradas, saídas e transferências nos dois sentidos. O segundo nunca é digitado.

Transações antigas, de antes de você ligar o modo de múltiplas contas, não
pertencem a conta nenhuma. É por isso que a soma das contas pode diferir do saldo
do app: a API devolve esse resto em `unlinkedNetCents`.

### Parcelar uma compra

Marque **Compra parcelada** numa saída nova, escolha em quantas vezes e diga se o
valor digitado é o total da compra ou o de cada parcela. O app cria todas as
parcelas de uma vez, uma por mês a partir da data escolhida, numeradas ("3/10").

Duas decisões:

- **Todas as parcelas nascem juntas**, em vez de aparecerem uma por mês. O
  compromisso inteiro fica visível no histórico e nos meses seguintes — que é o
  ponto de registrar um parcelamento.
- **A sobra da divisão vai para a primeira parcela.** R$ 100,00 em 3x vira
  33,34 + 33,33 + 33,33, então a soma das parcelas é exatamente o preço da compra.

Cada parcela é uma transação normal: dá para editar ou apagar uma sozinha. Ao
excluir, o diálogo oferece apagar **a compra inteira**, se você desistiu dela.

---

## Lançamentos recorrentes

Uma recorrência é um **molde**: quando a data chega, ela vira uma transação
normal, que dali em diante vive por conta própria — pode ser editada ou apagada
sem afetar a regra.

Não existe processo em segundo plano nem agendador. Quem "roda" a recorrência é o
próprio uso do app: **ao entrar**, antes de qualquer resposta da API, tudo que
venceu desde a última vez é lançado de uma vez. Ficar uma semana sem abrir não
perde nada.

Três decisões que valem explicação:

- **Marca d'água (`last_run_date`).** Cada regra guarda até que dia já foi
  considerada. É o que garante que um lançamento apagado à mão **não volte
  sozinho** — e que uma regra pausada por três meses, ao ser retomada, lance dali
  para a frente em vez de inventar o passado.
- **Dias que não existem.** Dia 31 numa regra mensal cai em 28 (ou 29) em
  fevereiro, e em 30 nos meses de 30 dias. Nunca escorrega para o mês seguinte.
- **Começar no passado é opção sua.** A data de início vem preenchida com hoje;
  se você escolher uma data anterior, os lançamentos daquele intervalo são
  criados na hora — foi o que você pediu.

### O previsto no gráfico

O que ainda não aconteceu aparece **só** no gráfico de entradas e saídas, como
barra cinza vazada de contorno pontilhado, empilhada no lugar da barra real:

- só nas janelas que mostram **mais de um mês** (3 meses, 6 meses, ano, tudo) —
  em "Este mês" não aparece;
- só **depois de hoje**: o que já venceu é transação de verdade, com a cor de
  sempre;
- **nunca** entra em saldo, totais, comparativo, distribuição por categoria,
  limites de gasto, histórico nem na visão em tabela do gráfico. É ilustração.

Vale saber que os períodos são meses de calendário fechados: "Últimos 6 meses"
termina no último dia do mês corrente, então ali o previsto é só o que falta
deste mês. É em **"Este ano"** que a projeção aparece por inteiro, mês a mês até
dezembro.

---

## Exportar transações

O botão **Exportar**, na aba Transações, abre um diálogo que já vem preenchido
com os filtros da tela. Dá para ajustar período (as mesmas janelas do app, ou
datas específicas), tipo, categoria, conta, busca e ordem, e a prévia diz quantas
transações o recorte alcança antes de gerar qualquer coisa.

| Formato | Quando usar |
|---------|-------------|
| **CSV para Excel (`;`)** | Abre com um duplo clique no Excel em português: separador ponto e vírgula, vírgula decimal, data `DD/MM/AAAA` e marca de bytes (BOM) para os acentos saírem certos |
| **CSV padrão (`,`)** | Planilhas Google, Numbers, pandas — separador vírgula, ponto decimal e data `AAAA-MM-DD` |
| **JSON** | Backup ou uso em outro programa: filtros, resumo e todos os campos, com valores em centavos inteiros |
| **PDF / imprimir** | Abre a janela de impressão com o extrato formatado (cabeçalho, resumo e tabela). Escolha "Salvar como PDF" por lá |

Nos dois CSV a coluna **Valor** já vem com sinal — saídas negativas — então um
`=SOMA()` na planilha devolve o resultado do período direto. Há ainda uma opção
de acrescentar uma linha de totais no fim do arquivo.

Tudo é gerado no navegador, a partir da mesma API que a tela usa: nada é enviado
para lugar nenhum e o servidor não guarda arquivo algum.

---

## Dados de demonstração

```bash
npm run seed            # substitui o conteúdo atual pela demonstração
npm run seed -- --keep  # acrescenta sem apagar o que já existe
```

Gera cerca de 95 transações espalhadas pelos últimos 100 dias (salário, aluguel,
mercado, transporte, faculdade…) e define um saldo inicial de R$ 4.500,00, o
suficiente para exercitar gráficos, filtros e paginação.

Esses dados vivem apenas em `backend/src/scripts/demo-data.ts` e **não são
carregados automaticamente em momento algum** — o app sobe vazio, com estados
vazios explicativos, se você nunca rodar o `seed`. Para voltar ao zero:
`npm run db:reset`.

---

## Variáveis de ambiente

Todas são opcionais. Se existir um arquivo `.env` na raiz, ele é carregado
automaticamente (recurso nativo do Node, sem dependências).

| Variável | Padrão | Para que serve |
|----------|--------|----------------|
| `PORT` | `4000` | Porta do backend |
| `HOST` | `127.0.0.1` | Interface de rede do backend |
| `DATABASE_PATH` | `data/finance.sqlite` | Caminho do arquivo do banco |
| `NODE_ENV` | `development` | Ambiente de execução |
| `CORS_ORIGIN` | *(vazio)* | Lista separada por vírgula de origens extras. Sem ela, só origens locais são aceitas |
| `VITE_API_TARGET` | `http://127.0.0.1:4000` | Destino do proxy do Vite em desenvolvimento |

---

## API

Base: `/api`

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Verificação de saúde |
| `GET` | `/transactions` | Lista com filtros `search`, `type`, `category`, `accountId`, `period`, `reference`, `from`, `to`, `limit`, `offset` |
| `GET` | `/transactions/:id` | Uma transação |
| `POST` | `/transactions` | Cria. Com `type: "transfer"`, exige `accountId` e `transferAccountId` diferentes entre si |
| `POST` | `/transactions/installments` | Cria uma compra parcelada inteira (`installments`, `amountIs`) |
| `PUT` | `/transactions/:id` | Atualiza |
| `DELETE` | `/transactions/:id` | Exclui. Com `?scope=installments`, apaga a compra parcelada inteira |
| `GET` | `/summary?period=month` | Saldo atual, entradas, saídas, resultado e saldo de abertura |
| `GET` | `/statistics?period=month` | Série temporal, distribuição por categoria e comparativo com o período anterior |
| `GET` `POST` | `/budgets` | Limites de gasto, já com o consumo calculado |
| `PUT` `DELETE` | `/budgets/:id` | Edita e remove um limite |
| `GET` `POST` | `/recurrences` | Lançamentos recorrentes, já com a próxima data prevista |
| `PUT` `DELETE` | `/recurrences/:id` | Edita, pausa (`active`) e remove uma recorrência |
| `GET` | `/settings` · `PUT` `/settings` | Nome, saldo inicial, múltiplas contas |
| `GET` `POST` | `/accounts` | Lista e cria contas |
| `PUT` `DELETE` | `/accounts/:id` | Edita e remove uma conta |
| `GET` | `/categories` | Categorias padrão + as já usadas |
| `DELETE` | `/data` | Apaga tudo. Exige `{ "confirm": "RESETAR" }` no corpo |

`period` aceita `month`, `3m`, `6m`, `year` ou `all` — todos são **meses de
calendário fechados**, do dia 1 ao último dia do mês, e não janelas móveis de N
dias. Em `all` os dois limites ficam abertos.

`reference` (`YYYY-MM-DD`) desloca a janela: `?period=month&reference=2026-05-17`
devolve maio inteiro. É o que faz as setas de navegação funcionarem, sem estado
no servidor.

Valores monetários entram e saem sempre em **centavos inteiros**.

<details>
<summary>Exemplo de criação</summary>

```bash
curl -X POST http://127.0.0.1:4000/api/transactions \
  -H "content-type: application/json" \
  -d '{
        "type": "expense",
        "amountCents": 8000,
        "description": "Combustível",
        "category": "Transporte",
        "date": "2026-08-09"
      }'
```

</details>

Erros seguem sempre o mesmo formato, com mensagem pronta para exibir e sem stack
trace:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Informe um valor maior que zero.",
    "details": [{ "field": "amountCents", "code": "too_small" }]
  }
}
```

---

## Estrutura do projeto

```text
CIFRA/
├── backend/
│   └── src/
│       ├── db/            conexão e migrations (PRAGMA user_version)
│       ├── domain/        tipos, datas, períodos, categorias
│       ├── services/      regras de negócio + SQL (transações, saldo, estatísticas)
│       ├── http/          rotas, validação (Zod) e tratamento de erros
│       ├── scripts/       seed e reset do banco
│       ├── app.ts         montagem do Express
│       └── server.ts      inicialização
│
├── frontend/
│   └── src/
│       ├── components/    ui/, layout/, charts/, transactions/, recurrences/,
│       │                  budgets/, dashboard/, profile/
│       ├── context/       período, atualização de dados, toasts, diálogo
│       ├── hooks/         busca de dados e tema
│       ├── lib/           cliente da API e formatação
│       ├── pages/         Dashboard, Transações, Análises, Usuário, Ajustes
│       └── types/         contratos da API
│
├── scripts/               atalho do Windows (iniciar, parar, criar atalho)
├── data/                  banco SQLite (criado em tempo de execução)
└── package.json           workspaces + scripts
```

Os serviços recebem a conexão do banco por parâmetro em vez de usarem um
singleton global. É o que permite aos testes rodarem contra um banco `:memory:`
descartável, sem mocks.

---

## Testes

```bash
npm test
```

**Backend (141 testes)** — a lógica financeira é o foco:

- saldo inicial + entradas − saídas, incluindo alteração do saldo inicial sem
  perder histórico;
- criação, edição (inclusive troca de tipo) e exclusão recalculando o saldo;
- períodos como meses fechados: virada de ano, mês de 28/29/30/31 dias e
  referência caindo no dia 31;
- mês corrente: totais, saldo de abertura, série diária sem buracos e saldo
  acumulado; granularidade diária até 92 dias e mensal acima disso;
- múltiplas contas: soma como saldo inicial, preservação do valor digitado ao
  alternar a opção, reflexo imediato de inclusões e remoções, saldo de hoje por
  conta e resultado do que não está vinculado a nenhuma;
- transferências: movem saldo entre contas sem mexer em entradas, saídas,
  resultado, categorias, limites nem no saldo total; recusa de destino igual à
  origem ou ausente; e o lançamento sobrevive à exclusão da conta;
- compras parceladas: divisão do total com a sobra na primeira parcela, valor
  informado por parcela, numeração, uma parcela por mês, e exclusão de uma só
  ou da compra inteira;
- transações vinculadas a contas: nome resolvido por junção, filtro por conta,
  recusa de conta inexistente e preservação do lançamento ao apagar a conta;
- navegação entre períodos: janela em torno da referência, período anterior de
  mesmo tamanho e virada de ano;
- limites de gasto: janela de N meses, soma só das saídas da categoria, aviso a
  partir de 90%, estouro acima de 100% e recusa de limite duplicado;
- recorrências: datas semanais, mensais e anuais (inclusive dia 31 em fevereiro),
  recorte por início e fim, lançamento de tudo que venceu, sem duplicar ao abrir
  de novo, sem recriar o que foi apagado à mão, regra pausada que não retroage ao
  voltar, e histórico preservado ao apagar a regra;
- previsão do gráfico: só em janelas de mais de um mês, só depois de hoje, e
  fora de saldo, totais e distribuição por categoria;
- comparativo: totais do período anterior e variação percentual, inclusive
  quando a base é zero;
- distribuição por categoria e percentuais;
- validação de valores (zero, negativo, fracionado, absurdo), descrições e datas;
- filtros, busca sem acento e paginação;
- reset total: apaga tudo, recusa sem confirmação e deixa o app utilizável depois;
- API completa por HTTP: códigos de status, mensagens amigáveis, JSON inválido,
  rota inexistente e ausência de stack trace nas respostas.

**Frontend (56 testes)** — formatação monetária, aritmética de meses e rótulos de
janela, o fluxo do diálogo de transação (digitação convertida em centavos,
bloqueio com mensagens de erro, seleção de conta obrigatória quando o modo está
ligado, erro do servidor e edição pré-preenchida), transferência (só aparece com
duas contas, troca categoria por origem/destino e não oferece a origem como
destino), parcelamento (prévia da divisão e criação em lote), o diálogo de recorrência
(calendário que muda com a frequência, data final anterior ao início e envio em
centavos), a geração dos arquivos de exportação (dialetos de CSV, escape de
separador e aspas, sinal do valor, linha de totais, JSON com resumo e nome do
arquivo) e o painel de contas (listagem com soma, inclusão, edição ao sair do
campo e remoção).

---

## Decisões de segurança e robustez

- Toda entrada é validada **duas vezes**: no formulário e novamente no backend
  com Zod. O banco ainda aplica `CHECK` em valor, tamanho de texto e formato de
  data como última linha de defesa.
- Todo SQL usa **prepared statements com parâmetros** — nenhuma string de
  consulta é concatenada com dados do usuário; curingas de `LIKE` digitados na
  busca são escapados.
- Erros inesperados viram um `500` genérico; a mensagem técnica e o stack trace
  ficam apenas no log do servidor.
- O backend escuta em `127.0.0.1` e, por padrão, só aceita requisições de origens
  locais.
- Ações destrutivas exigem intenção explícita: apagar tudo só acontece com a
  palavra de confirmação no corpo da requisição, e a interface pede que ela seja
  digitada.
- As cores de entrada e saída foram validadas para daltonismo contra as
  superfícies real de cada tema, e cor nunca é o único canal de informação:
  há sempre legenda, rótulo, sinal (+/−) e uma visão em tabela.
