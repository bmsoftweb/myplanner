# myPlanner — Meu Planejamento Financeiro

Conversão do sistema Delphi / uniGUI `MeuPlanejamentoFinanceiro`
(`D:\bmsoftweb\MeuPlanejamentoFinanceiro`) para o mesmo stack, modelo e layout do
painel administrativo do B2B (`D:\bmsoftx\b2bweb\admin\code`).

## Stack

| Camada | O quê |
|---|---|
| Front-end | React 19 + Vite 6 + Tailwind 4, TypeScript |
| Back-end | Express 4 servido pelo próprio Vite em desenvolvimento (`tsx server.ts`) |
| Banco | MySQL 8 (`mysql2`), base **myplanner** em **45.224.130.145** |
| E-mail | `nodemailer` (opcional — sem SMTP o sistema continua funcionando) |

## Rodar

```bash
npm install
npm run dev
```

Sobe em `http://localhost:3000`. Outros comandos: `npm run build` (produção),
`npm start` (roda o build), `npm run lint` (tipos), `npm test` (regras de negócio).

## Configuração

Copie `.env.example` para `.env` e preencha a conexão e o SMTP. O `.env` não vai
para o repositório, e a senha do banco **não tem valor padrão no código**: sem
`MYSQL_PASSWORD` o servidor avisa e as consultas falham na autenticação.

## Modelo de dados

O banco é o mesmo do sistema Delphi, sem alteração de estrutura.

- **`empresas`** é a *conta*: e-mail principal, senha, plano e chave de ativação.
  O `Id` dela é o **`id_emp`** que isola os dados em todas as tabelas.
- **`usuarios`** são acessos adicionais dentro de uma conta. Os dois entram pela
  mesma tela de login. Como no sistema Delphi, **Usuários**, **Meus Dados** e
  **Meu Plano** só aparecem para o e-mail principal — e o servidor recusa as
  rotas desses recursos para um usuário secundário, não só esconde o menu.
- **`lancamentos.id_categoria` aponta para `categorias_sub`**, não para
  `categorias`. O sinal (receita ou despesa) vem de `categorias.tipo` através de
  `categorias_sub.id_cat`.
- Colunas sim/não são `char(1)` com `'S'` / `'N'`. No metadado elas são
  `type: 'boolean'` com `sn: true`; a conversão acontece na gravação e na leitura.
- `config` liga e desliga módulos no menu (`usar_limites`, `usar_bancos`,
  `usar_cc`, `usar_metas`, `usar_patrimonio`, `usar_previsao`) e define a página
  inicial (`pagina_padrao`).
- `usuarios.config_listas` guarda o formato das listas de cada pessoa (veja as
  pendências no fim deste arquivo).

## Telas

| Menu | Arquivo | Origem no Delphi |
|---|---|---|
| Home | `src/components/Dashboard.tsx` | `ufrmDashBoard` + `Graf01..04` |
| Lançamentos | `src/components/LancamentosView.tsx` | `ufrmLanc` (inclui recorrentes) |
| Meu Planejamento | `src/components/PlanejamentoView.tsx` | `ufrmConsultasPla` |
| Consultas | `src/components/ConsultasView.tsx` | `ufrmConsultas` |
| Extrato Bancário | `src/components/ExtratoView.tsx` | `ufrmBancos` (extrato + OFX) |
| Transferência | `src/components/TransferenciaView.tsx` | `ufrmBancos` / `ufrmTransf` |
| Fatura do Cartão | `src/components/FaturaCartaoView.tsx` | `ufrmLimites` (fatura + gráfico) |
| Categorias, Bancos, Centros de Custo, Limites, Metas, Moedas, Patrimônio, Usuários, Tipos de Documento, Novidades | `src/components/CrudView.tsx` | `ufrmCategorias`, `ufrmBancos`, `ufrmCC`, `ufrmLimites`, `ufrmMetas`, `ufrmMoedas`, `ufrmPatrimonio`, `ufrmUsuarios`, `ufrmVersoes` |
| Configurações | `src/components/ConfigView.tsx` | `ufrmConfig` |
| Meus Dados / Meu Plano / Termos | `MeusDadosView`, `PlanosView`, `App.tsx` | telas 2, 6 e 7 do `Main` |
| Entrar / Cadastro / Ativar / Recuperar senha | `src/components/LoginView.tsx` | telas 1 a 4 do `Main` |

As telas de cadastro são desenhadas pelo registro de metadados em
`server/schema.ts` — a mesma ideia do painel B2B: o servidor usa o registro como
whitelist de colunas e o front consome via `GET /api/meta/resources`.

A mecânica das grades (coluna indicadora com o menu de contexto, coluna de
sobra, coluna de Ações fixa, redimensionar, reordenar, linhas de grade e o
"Salvar Configuração") mora em `src/components/GradeLista.tsx` e é usada por
**todas** as listas — cadastros, Lançamentos, Planejamento, Extrato e Fatura do
Cartão. Uma implementação só, para não divergirem.

As colunas são achadas pelo atributo `data-coluna`, e as fixas por `data-fixa`,
em vez de por posição: é o que permite a mesma mecânica servir tanto à grade
simples quanto ao Planejamento, que tem duas linhas de cabeçalho.

Particularidades de cada tela:

- **Lançamentos**: as colunas que dependem de um módulo (previsão, bancos,
  centros de custo, limites, metas) somem quando ele está desligado na
  configuração, como no `gridLanc` do Delphi.
- **Planejamento**: cada mês é uma coluna só da grade, embora ocupe três células
  (previsão, realizado e a marca) — redimensionar move as três juntas, e
  "Ajustar largura" reparte o espaço entre os meses, não entre 39 colunas.
  Reordenar fica desligado: os meses têm ordem própria.
- **Extrato**: é só leitura, então não tem coluna de Ações. Ordenar por uma
  coluna que não seja a data embaralha a sequência do saldo acumulado, que é
  calculado em ordem de data no servidor.
- **Fatura do Cartão**: também só leitura — o lançamento da compra é alterado ou
  excluído pela tela de Lançamentos. No sistema Delphi dava para excluir direto
  da fatura; aqui essa ação ainda não existe.

Em Lançamentos, Planejamento e Extrato a ordenação é feita no cliente, já que a
listagem do período vem inteira do servidor.

Ações que não cabem na barra padrão de lista ficam em
`src/components/AcoesExtras.tsx`: **Criar Padrões** (categorias) e **Enviar
e-mail com a senha** (usuários).

## Regras de negócio que saíram do formulário para o servidor

- **Compra no cartão de crédito** (`server/lancamentos.ts`): a `data_realizado`
  passa a ser o vencimento da fatura seguinte à compra; depois do dia de
  fechamento, cai uma fatura adiante. `99` em fechamento ou vencimento significa
  "último dia do mês". O lançamento nasce com `status = 'O'`.
- **`data_sort`** é sempre a data realizada quando existe; senão, a prevista.
- **Recorrentes**: diário e semanal percorrem dia a dia respeitando os dias da
  semana marcados; os demais intervalos avançam de período em período, com o dia
  limitado ao último dia do mês (31/01 → 28/02 → 31/03).
- **Metas**: `numero_meses` e `valor_mensal` são calculados na gravação.
- **Limites mensais**: `ano_mes` é derivado de ano + mês.
- **Planos**: o limite de lançamentos do mês é conferido antes de incluir.

Essas regras têm conferência executável em `server/regras.test.ts` (`npm test`).

## Entrada de dados

- **Números no padrão dos aplicativos bancários** (`src/components/NumberField.tsx`
  e `src/utils/numeroBancario.ts`): só se digitam dígitos, e o valor é preenchido
  da direita para a esquerda — para 1.467,45 digita-se `146745`. Vale para
  valores, percentuais, fatores e inteiros. O campo é `type="text"`, para o
  navegador não impor a própria formatação; o valor sai em formato canônico
  (`1467.45`) para o servidor.
  - `semAgrupamento` tira o ponto de milhar, para número que não é quantidade:
    o **Ano** de um limite mensal aparece como `2026`, e não como `2.026`.
- **Seleção ao focar**: `instalarSelecaoAoFocar()` (chamado uma vez em
  `src/main.tsx`) seleciona todo o conteúdo de qualquer campo de digitação ao
  receber o foco, inclusive nos campos criados depois. Ficam de fora as áreas de
  texto (`textarea`) e os controles que não são de digitação.
- **Datas** sempre `dd/mm/aaaa` com calendário próprio (`DateField`), nunca o
  seletor nativo do navegador.
- **Sim/não** sempre como interruptor (`Toggle`), nunca caixa de seleção.

A digitação numérica tem conferência executável em `server/regras.test.ts`.

## Segurança

- Toda consulta é montada com whitelist de colunas do metadado; valores vão
  sempre como parâmetro. Nomes de coluna são protegidos por crases (há coluna
  chamada `sql`, palavra reservada no MySQL 8).
- A busca avançada recusa filtro em campo de senha, e o conteúdo das colunas de
  senha nunca vai para o navegador (o formulário trata campo em branco como
  "manter a senha atual").
- A tela de Consultas só executa comandos de leitura, um por vez, e substitui
  `:ID_EMP` pelo id da conta da sessão.
- O upload de comprovante grava com nome próprio e só aceita a extensão do
  arquivo original; a remoção usa `basename` para não sair da pasta.

## Pendências conhecidas (do banco, não do código)

1. **Preferências de lista só para usuários secundários.** O formato das listas
   (larguras, ordem e colunas visíveis) fica em `usuarios.config_listas`, uma
   linha por pessoa. O **dono da conta** entra pela tabela `empresas` e não tem
   cadastro em `usuarios`, então para ele as listas sempre abrem no padrão — ao
   clicar em "Salvar Configuração" o aviso diz isso, em vez de fingir que gravou.
   Para cobrir o dono também seria preciso uma coluna `config_listas` em
   `empresas` ou criar a linha dele em `usuarios`.

2. **Senhas em texto puro.** As colunas `empresas.senha` e `usuarios.senha` são
   `varchar(20)` — não cabe um hash bcrypt (60 caracteres). A validação do login
   já aceita bcrypt, MD5, SHA-1 e SHA-256; basta ampliar as colunas para migrar:
   ```sql
   ALTER TABLE empresas MODIFY senha VARCHAR(255);
   ALTER TABLE usuarios MODIFY senha VARCHAR(255);
   ```

3. **Consulta "Balanço"** (`consultas.Id = 6`) chama a função `SaldoBanco()`, que
   não existe nem no banco novo nem no de origem — a consulta já estava quebrada
   no sistema Delphi. Ou se cria a função, ou se troca o trecho dos bancos por um
   subselect equivalente.

4. **Termos de uso**: o texto ficava no arquivo `Termos_de_uso.txt`, que não
   acompanha o código-fonte Delphi. `src/utils/termos.ts` traz uma versão
   equivalente, para substituir pelo texto oficial.

## O que ficou de fora

- **Relatórios FastReport (`.fr3`)**: as consultas continuam cadastradas com o
  nome do arquivo em `consultas.arquivo`, mas o resultado é exibido em grade e
  exportado em CSV, sem o motor de relatório do Delphi.
- **`lancamentos_rapidos`**: tabela usada pelo aplicativo móvel
  (`MeuPlanejamentoFinanceiroM`), fora do escopo desta conversão.
