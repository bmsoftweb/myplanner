/**
 * Conferência das regras que não são só "grava e lê": a data em que a compra no
 * cartão vira saída de caixa, a geração das datas de um recorrente, a leitura do
 * OFX e o preparo das consultas parametrizadas.
 *
 * Roda sem framework:  npx tsx server/regras.test.ts
 */
import assert from 'node:assert/strict';
import { vencimentoDaFatura, gerarDatasRecorrentes } from './lancamentos';
import { lerOfx } from './bancos';
import { prepararConsulta } from './consultas';
import { vencimentoDaJanela } from './limites';
import {
  paraDigitos,
  paraCanonico,
  paraExibicao,
  aplicarDigitacao,
  aplicarColagem,
} from '../src/utils/numeroBancario';

// ------------------------------------------------------------
// Fatura do cartão
// ------------------------------------------------------------
// Compra antes do fechamento (dia 20): entra na fatura do mês seguinte
assert.equal(vencimentoDaFatura('2026-03-10', 20, 5), '2026-04-05');
// Compra depois do fechamento: pula uma fatura
assert.equal(vencimentoDaFatura('2026-03-25', 20, 5), '2026-05-05');
// Exatamente no dia do fechamento ainda entra na fatura seguinte
assert.equal(vencimentoDaFatura('2026-03-20', 20, 5), '2026-04-05');
// 99 significa "último dia do mês", tanto no fechamento quanto no vencimento
assert.equal(vencimentoDaFatura('2026-01-15', 99, 99), '2026-02-28');
// Vencimento dia 31 num mês de 30 cai no dia 30, e não no mês seguinte
assert.equal(vencimentoDaFatura('2026-03-01', 20, 31), '2026-04-30');
// Virada de ano
assert.equal(vencimentoDaFatura('2026-12-28', 20, 10), '2027-02-10');

// A janela da tela de fatura anda de mês em mês a partir do mês corrente
const hoje = new Date();
const mesQueVem = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
assert.equal(
  vencimentoDaJanela(10, 0).slice(0, 7),
  `${mesQueVem.getFullYear()}-${String(mesQueVem.getMonth() + 1).padStart(2, '0')}`,
);

// ------------------------------------------------------------
// Lançamentos recorrentes
// ------------------------------------------------------------
// Mensal: dia 31 se ajusta ao último dia dos meses mais curtos, sem transbordar
assert.deepEqual(gerarDatasRecorrentes('mensal', '2026-01-31', 4, [], 1), [
  '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
]);
// A cada 2 meses
assert.deepEqual(gerarDatasRecorrentes('mensal', '2026-01-15', 3, [], 2), [
  '2026-01-15', '2026-03-15', '2026-05-15',
]);
// Bimestral, trimestral, semestral e anual têm passo fixo
assert.deepEqual(gerarDatasRecorrentes('bimestral', '2026-01-10', 3, [], 1), ['2026-01-10', '2026-03-10', '2026-05-10']);
assert.deepEqual(gerarDatasRecorrentes('trimestral', '2026-01-10', 2, [], 1), ['2026-01-10', '2026-04-10']);
assert.deepEqual(gerarDatasRecorrentes('semestral', '2026-01-10', 2, [], 1), ['2026-01-10', '2026-07-10']);
assert.deepEqual(gerarDatasRecorrentes('anual', '2026-02-29', 2, [], 1), ['2026-02-28', '2027-02-28']);
// Quinzenal soma 15 dias corridos
assert.deepEqual(gerarDatasRecorrentes('quinzenal', '2026-01-01', 3, [], 1), ['2026-01-01', '2026-01-16', '2026-01-31']);
// Diário só nos dias marcados: 19/09/2026 é sábado, então começa na segunda
assert.deepEqual(gerarDatasRecorrentes('diario', '2026-09-19', 5, [1, 2, 3, 4, 5], 1), [
  '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
]);
// Diário sem nenhum dia marcado repete todos os dias
assert.deepEqual(gerarDatasRecorrentes('diario', '2026-09-19', 3, [], 1), ['2026-09-19', '2026-09-20', '2026-09-21']);
// Semanal num único dia da semana anda de 7 em 7
assert.deepEqual(gerarDatasRecorrentes('semanal', '2026-09-21', 3, [1], 1), ['2026-09-21', '2026-09-28', '2026-10-05']);
// Data inválida não gera nada
assert.deepEqual(gerarDatasRecorrentes('mensal', '', 3, [], 1), []);

// ------------------------------------------------------------
// Leitura do OFX
// ------------------------------------------------------------
// OFX é SGML: as tags podem vir sem fechamento
const OFX = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260315120000[-3:BRT]
<TRNAMT>-150.75
<FITID>2026031501
<CHECKNUM>000123
<MEMO>PAGAMENTO CONTA LUZ
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260316
<TRNAMT>2500.00
<FITID>2026031602
<MEMO>SALARIO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const transacoes = lerOfx(OFX);
assert.equal(transacoes.length, 2);
assert.deepEqual(transacoes[0], {
  fitid: '2026031501',
  data: '2026-03-15',
  valor: -150.75,
  memo: 'PAGAMENTO CONTA LUZ',
  chknum: '000123',
});
assert.equal(transacoes[1].valor, 2500);
assert.equal(transacoes[1].data, '2026-03-16');
// Arquivo sem lançamentos não quebra
assert.deepEqual(lerOfx('<OFX></OFX>'), []);

// ------------------------------------------------------------
// Consultas parametrizadas
// ------------------------------------------------------------
// :ID_EMP vira o número da conta; os demais viram "?" e vão como valores
const preparada = prepararConsulta(
  'SELECT * FROM lancamentos WHERE id_emp = :ID_EMP AND data_sort BETWEEN :D1 AND :D2',
  42,
  { D1: '2026-01-01', D2: '2026-12-31' },
);
assert.equal(
  preparada.texto,
  'SELECT * FROM lancamentos WHERE id_emp = 42 AND data_sort BETWEEN ? AND ?',
);
assert.deepEqual(preparada.params, ['2026-01-01', '2026-12-31']);

// O mesmo parâmetro usado duas vezes repete o valor, na ordem dos "?"
const repetida = prepararConsulta('SELECT :A, :B, :A', 1, { A: 'x', B: 'y' });
assert.equal(repetida.texto, 'SELECT ?, ?, ?');
assert.deepEqual(repetida.params, ['x', 'y', 'x']);

// Parâmetro não informado vira NULL, em vez de virar texto vazio colado no SQL
const semValor = prepararConsulta('SELECT :C', 1, {});
assert.deepEqual(semValor.params, [null]);

// ------------------------------------------------------------
// Digitação numérica no padrão dos aplicativos bancários
// ------------------------------------------------------------
/** Simula a digitação de uma sequência de dígitos, como o navegador faria */
function digitar(teclas: string, scale: number, allowNegative = false, semAgrupamento = false) {
  let estado = { negativo: false, digitos: '' };
  const exibicoes: string[] = [];
  for (const tecla of teclas) {
    const bruto = paraExibicao(estado, scale, semAgrupamento) + tecla;
    estado = aplicarDigitacao(bruto, estado, scale, allowNegative, semAgrupamento);
    exibicoes.push(paraExibicao(estado, scale, semAgrupamento));
  }
  return { exibicoes, canonico: paraCanonico(estado, scale), estado };
}

// O valor é preenchido da direita para a esquerda: 146745 vira 1.467,45
const valor = digitar('146745', 2);
assert.deepEqual(valor.exibicoes, ['0,01', '0,14', '1,46', '14,67', '146,74', '1.467,45']);
assert.equal(valor.canonico, '1467.45');

// Percentual e fator seguem a mesma regra, com a escala de cada um
assert.equal(digitar('1250', 2).canonico, '12.50');
assert.equal(digitar('10000', 4).canonico, '1.0000');

// Inteiro: cada tecla acrescenta um dígito
assert.deepEqual(digitar('31', 0).exibicoes, ['3', '31']);
assert.equal(digitar('31', 0).canonico, '31');

// Sem agrupamento, um ano aparece como 2026 — e não como 2.026
assert.deepEqual(digitar('2026', 0, false, true).exibicoes, ['2', '20', '202', '2026']);
assert.equal(paraExibicao({ negativo: false, digitos: '2026' }, 0), '2.026');
assert.equal(paraExibicao({ negativo: false, digitos: '2026' }, 0, true), '2026');

// Backspace sobre o separador apaga um dígito, e não o separador
const depoisDoBackspace = aplicarDigitacao('1.467,4', { negativo: false, digitos: '146745' }, 2, false);
assert.equal(paraExibicao(depoisDoBackspace, 2), '146,74');

// "-" alterna o sinal só onde o negativo é permitido
assert.equal(paraCanonico(aplicarDigitacao('-12,34', { negativo: false, digitos: '1234' }, 2, true), 2), '-12.34');
assert.equal(paraCanonico(aplicarDigitacao('-12,34', { negativo: false, digitos: '1234' }, 2, false), 2), '12.34');

// O valor que vem do banco volta para a tela já formatado
assert.equal(paraExibicao(paraDigitos('1467.45', 2), 2), '1.467,45');
assert.equal(paraExibicao(paraDigitos(430, 2), 2), '430,00');
assert.equal(paraExibicao(paraDigitos('', 2), 2), '');

// Colagem aceita tanto o formato brasileiro quanto o do banco de dados
assert.equal(paraCanonico(aplicarColagem('R$ 1.467,45', 2, false)!, 2), '1467.45');
assert.equal(paraCanonico(aplicarColagem('1467.45', 2, false)!, 2), '1467.45');
assert.equal(aplicarColagem('abc', 2, false), null);

console.log('Todas as regras conferidas.');
