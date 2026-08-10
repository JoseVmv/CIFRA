# CIFRA — Controle financeiro pessoal

Aplicativo local para acompanhar quanto dinheiro você tem, quanto entra, quanto sai
e como isso evolui ao longo do tempo. Roda inteiramente na sua máquina: os dados
ficam num arquivo SQLite dentro da própria pasta do projeto e nada é enviado para
a internet.

```
Saldo atual = saldo inicial + total de entradas − total de saídas
```

O saldo nunca é um número digitado à mão — ele é sempre derivado do histórico.
O saldo inicial, por sua vez, vem do campo em **Usuário** ou, se você ativar
múltiplas contas, da soma das contas cadastradas.

---

## O que o app faz

- **Dashboard** com saldo atual, entradas, saídas e resultado do período.
- **Seletor de período por mês de calendário**: este mês, últimos 3 meses,
  últimos 6 meses, este ano ou tudo, com **setas para navegar** entre meses
  passados. Cards e gráficos respondem juntos.
- **Nova transação** em um diálogo rápido (entrada ou saída, valor, descrição,
  categoria e data), com confirmação visual e sem recarregar a página.
- **Histórico** agrupado por dia, com busca por descrição (ignora acentos e
  maiúsculas), filtros de tipo, categoria e período, além de edição e exclusão.
- **Análises**: entradas × saídas por dia, evolução do saldo acumulado,
  distribuição por categoria e **comparativo com o período anterior**. Todo
  gráfico tem uma visão em tabela equivalente.
- **Limites de gastos** por categoria, cada um com sua janela em meses. Ao passar
  de 90% do limite, o painel principal mostra um aviso que pode ser fechado.
- **Aba Usuário** com as configurações pessoais: seu nome e o saldo inicial,
  alterável a qualquer momento sem tocar no histórico.
- **Múltiplas contas** (opcional): cadastre seus bancos e carteiras e o saldo
  inicial passa a ser a soma deles. Com a opção ligada, cada transação é
  vinculada a uma conta, e o histórico pode ser filtrado por ela.
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

---

## Onde os dados ficam

```
data/finance.sqlite
```

Um único arquivo na raiz do projeto (criado no primeiro uso, junto com os
arquivos `-wal`/`-shm` do SQLite). **Para fazer backup, basta copiar essa pasta.**

O schema tem quatro tabelas:

```text
transactions                    accounts               budgets
├── id (uuid)                   ├── id (uuid)          ├── id (uuid)
├── type (income | expense)     ├── name               ├── category (única)
├── amount_cents (inteiro > 0)  ├── balance_cents      ├── limit_cents
├── description                 ├── position           ├── months (1–24)
├── category                    ├── created_at         ├── created_at
├── date (YYYY-MM-DD)           └── updated_at         └── updated_at
├── account_id  → conta vinculada (nulo se não usa contas)
├── search_text → texto normalizado (busca sem acento)      settings
├── created_at                                              ├── key
└── updated_at                                              ├── value
                                                            └── updated_at
```

Apagar uma conta **não apaga** as transações dela: o vínculo vira nulo
(`ON DELETE SET NULL`), então o histórico e o saldo permanecem intactos.

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
| **Ajustes → Resetar tudo** (na interface) | Apaga transações e configurações, mantendo o arquivo. Pede que você digite `RESETAR` para confirmar |
| `npm run db:reset` (terminal) | Apaga o arquivo do banco inteiro e recria o schema vazio |

Qualquer uma das duas remove também os dados de demonstração.

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
| `POST` | `/transactions` | Cria |
| `PUT` | `/transactions/:id` | Atualiza |
| `DELETE` | `/transactions/:id` | Exclui |
| `GET` | `/summary?period=month` | Saldo atual, entradas, saídas, resultado e saldo de abertura |
| `GET` | `/statistics?period=month` | Série temporal, distribuição por categoria e comparativo com o período anterior |
| `GET` `POST` | `/budgets` | Limites de gasto, já com o consumo calculado |
| `PUT` `DELETE` | `/budgets/:id` | Edita e remove um limite |
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
│       ├── components/    ui/, layout/, charts/, transactions/, dashboard/, profile/
│       ├── context/       período, atualização de dados, toasts, diálogo
│       ├── hooks/         busca de dados e tema
│       ├── lib/           cliente da API e formatação
│       ├── pages/         Dashboard, Transações, Análises, Usuário, Ajustes
│       └── types/         contratos da API
│
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

**Backend (106 testes)** — a lógica financeira é o foco:

- saldo inicial + entradas − saídas, incluindo alteração do saldo inicial sem
  perder histórico;
- criação, edição (inclusive troca de tipo) e exclusão recalculando o saldo;
- períodos como meses fechados: virada de ano, mês de 28/29/30/31 dias e
  referência caindo no dia 31;
- mês corrente: totais, saldo de abertura, série diária sem buracos e saldo
  acumulado; granularidade diária até 92 dias e mensal acima disso;
- múltiplas contas: soma como saldo inicial, preservação do valor digitado ao
  alternar a opção e reflexo imediato de inclusões e remoções;
- transações vinculadas a contas: nome resolvido por junção, filtro por conta,
  recusa de conta inexistente e preservação do lançamento ao apagar a conta;
- navegação entre períodos: janela em torno da referência, período anterior de
  mesmo tamanho e virada de ano;
- limites de gasto: janela de N meses, soma só das saídas da categoria, aviso a
  partir de 90%, estouro acima de 100% e recusa de limite duplicado;
- comparativo: totais do período anterior e variação percentual, inclusive
  quando a base é zero;
- distribuição por categoria e percentuais;
- validação de valores (zero, negativo, fracionado, absurdo), descrições e datas;
- filtros, busca sem acento e paginação;
- reset total: apaga tudo, recusa sem confirmação e deixa o app utilizável depois;
- API completa por HTTP: códigos de status, mensagens amigáveis, JSON inválido,
  rota inexistente e ausência de stack trace nas respostas.

**Frontend (31 testes)** — formatação monetária, aritmética de meses e rótulos de
janela, o fluxo do diálogo de transação (digitação convertida em centavos,
bloqueio com mensagens de erro, seleção de conta obrigatória quando o modo está
ligado, erro do servidor e edição pré-preenchida) e o painel de contas (listagem
com soma, inclusão, edição ao sair do campo e remoção).

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
