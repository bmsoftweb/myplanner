import { Router, Request, Response } from 'express';
import { pool } from './db';
import { tenantId } from './auth';
import {
  RESOURCES,
  FieldDef,
  ResourceDef,
  getResource,
  writableFields,
  columnNames,
} from './schema';

/** Separador usado para chaves primárias compostas na URL: /api/crud/x/12~34 */
const PK_SEPARATOR = '~';

/**
 * Protege um nome de coluna já validado contra a whitelist do metadado.
 * Necessário porque há colunas com nome de palavra reservada (ex.: consultas.sql).
 */
function col(nome: string): string {
  return `\`${nome.replace(/`/g, '')}\``;
}

/** Converte o valor recebido do formulário para o tipo esperado pela coluna do MySQL */
function coerceValue(field: FieldDef, raw: any): any {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') {
    // Campos obrigatórios em branco viram string vazia; opcionais viram NULL
    return field.required && (field.type === 'text' || field.type === 'cnpj') ? '' : null;
  }

  switch (field.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      const ligado = raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'S';
      // Colunas char(1) do banco guardam 'S' / 'N' no lugar de 1 / 0
      return field.sn ? (ligado ? 'S' : 'N') : ligado ? 1 : 0;
    }
    case 'cnpj':
      return String(raw).replace(/\D/g, '').slice(0, 14);
    case 'json':
      if (typeof raw === 'string') {
        try {
          JSON.parse(raw);
          return raw;
        } catch {
          throw new Error(`O campo "${field.label}" não contém um JSON válido.`);
        }
      }
      return JSON.stringify(raw);
    case 'date':
      return String(raw).slice(0, 10);
    case 'datetime':
      return String(raw).replace('T', ' ').slice(0, 19);
    default:
      return String(raw);
  }
}

/** Monta o payload de gravação a partir do corpo da requisição, aplicando a whitelist de colunas */
async function buildWritePayload(
  resource: ResourceDef,
  body: Record<string, any>,
  isUpdate: boolean,
): Promise<Record<string, any>> {
  const payload: Record<string, any> = {};

  for (const field of writableFields(resource)) {
    if (!(field.name in body)) continue;

    // Senha em branco na alteração mantém a atual. A coluna senha é varchar(20)
    // no banco herdado do sistema Delphi, que guarda a senha em texto puro;
    // por isso ela não é convertida em hash aqui (não caberia na coluna).
    if (field.type === 'password') {
      const plain = String(body[field.name] ?? '');
      if (plain.trim() === '') {
        if (!isUpdate) payload[field.name] = '';
        continue;
      }
      payload[field.name] = plain.slice(0, field.maxLength ?? 20);
      continue;
    }

    payload[field.name] = coerceValue(field, body[field.name]);
  }

  return payload;
}

/** Diferença em meses entre duas datas "aaaa-mm-dd" */
function mesesEntre(inicio: string, fim: string): number {
  const [ai, mi] = inicio.split('-').map(Number);
  const [af, mf] = fim.split('-').map(Number);
  return Math.max(1, (af - ai) * 12 + (mf - mi));
}

/**
 * Regras de negócio aplicadas antes de gravar — o que o sistema Delphi
 * calculava no formulário passa a ser calculado aqui, uma vez só.
 */
function aplicarRegras(resource: ResourceDef, payload: Record<string, any>) {
  // Limite mensal: a coluna ano_mes é a concatenação de ano + mês, usada no índice
  if (resource.name === 'limites_mensais' && payload.ano && payload.mes) {
    payload.ano_mes = `${payload.ano}${String(payload.mes).padStart(2, '0')}`;
  }

  // Meta: número de meses e o depósito mensal necessário saem das datas e dos saldos
  if (resource.name === 'metas' && payload.data_inicial && payload.data_final) {
    const meses = mesesEntre(String(payload.data_inicial), String(payload.data_final));
    const falta = Number(payload.saldo_final || 0) - Number(payload.saldo_inicial || 0);
    payload.numero_meses = meses;
    payload.valor_mensal = Number((falta / meses).toFixed(2));
  }

  // Lançamento: a data de ordenação é a realizada quando existe; senão, a prevista
  if (resource.name === 'lancamentos') {
    if ('data_realizado' in payload || 'data_prevista' in payload) {
      payload.data_sort = payload.data_realizado || payload.data_prevista || null;
    }
  }
}

/** Valida os campos obrigatórios antes de tocar no banco, para devolver mensagem amigável */
function validateRequired(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const faltando: string[] = [];

  for (const field of writableFields(resource)) {
    if (!field.required) continue;
    if (field.type === 'password') continue;
    if (isUpdate && !(field.name in payload)) continue;

    const value = payload[field.name];
    if (value === null || value === undefined || value === '') {
      faltando.push(field.label);
    }
  }

  if (faltando.length) {
    throw new Error(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
  }
}

/** Traduz erros do MySQL para mensagens legíveis ao operador */
function friendlyDbError(err: any, resource: ResourceDef): string {
  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      return `Já existe um registro de ${resource.labelSingular} com esse valor único (${err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'chave duplicada'}).`;
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return `Este ${resource.labelSingular} não pode ser excluído porque existem registros vinculados a ele.`;
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return 'Um dos vínculos informados (chave estrangeira) não existe. Verifique os campos de seleção.';
    case 'ER_DATA_TOO_LONG':
      return `Um dos campos excedeu o tamanho permitido: ${err.sqlMessage || ''}`;
    case 'ER_BAD_NULL_ERROR':
      return `Um campo obrigatório ficou em branco: ${err.sqlMessage || ''}`;
    case 'WARN_DATA_TRUNCATED':
      return 'Um dos valores selecionados não é aceito por esta coluna. Verifique os campos de seleção.';
    default:
      return err?.sqlMessage || err?.message || 'Erro inesperado ao acessar o banco de dados.';
  }
}

/**
 * Tira do que vai para o navegador o conteúdo das colunas de senha.
 * A coluna senha deste banco guarda texto puro (varchar(20), herança do sistema
 * Delphi), então ela não pode sair daqui nem para quem tem direito de editá-la:
 * o formulário já trata senha em branco como "manter a atual".
 */
function semSenhas(resource: ResourceDef, linhas: any[]): any[] {
  const senhas = resource.fields.filter((f) => f.type === 'password').map((f) => f.name);
  if (!senhas.length) return linhas;
  return linhas.map((linha) => {
    const copia = { ...linha };
    for (const campo of senhas) if (campo in copia) copia[campo] = '';
    return copia;
  });
}

/** Decompõe o parâmetro :id em condição WHERE respeitando chaves compostas */
function pkCondition(resource: ResourceDef, idParam: string): { sql: string; params: any[] } {
  const parts = String(idParam).split(PK_SEPARATOR);
  if (parts.length !== resource.pk.length) {
    throw new Error(
      `Identificador inválido: ${resource.labelSingular} usa chave ${resource.pk.join(' + ')}.`,
    );
  }
  return {
    sql: resource.pk.map((c) => `t.${col(c)} = ?`).join(' AND '),
    params: parts,
  };
}

export function createCrudRouter() {
  const router = Router();

  function resolveResource(req: Request): ResourceDef {
    const resource = getResource(req.params.resource);
    if (!resource) {
      throw new Error(`Recurso "${req.params.resource}" não existe no módulo administrativo.`);
    }
    // Esconder o item no menu não basta: a rota também recusa. Só o dono da
    // conta (que não tem linha em usuarios, logo x-id-usuario = 0) passa aqui.
    if (resource.somentePrincipal && Number(req.header('x-id-usuario')) > 0) {
      throw new Error(`Somente o e-mail principal da conta tem acesso a ${resource.label}.`);
    }
    return resource;
  }

  // --------------------------------------------------------
  // Metadados: alimenta as telas genéricas de CRUD
  // --------------------------------------------------------
  router.get('/meta/resources', (_req: Request, res: Response) => {
    res.json(RESOURCES);
  });

  // --------------------------------------------------------
  // Opções de chave estrangeira (combos dos formulários)
  // --------------------------------------------------------
  router.get('/options/:resource', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);
      const labelField = String(req.query.label_field || resource.labelField);

      if (!columnNames(resource).includes(labelField)) {
        throw new Error(`Campo de rótulo "${labelField}" inválido.`);
      }

      const pkCol = resource.pk[0];
      const [rows] = await pool.query<any[]>(
        `SELECT t.${col(pkCol)} AS value, t.${col(labelField)} AS label
           FROM ${resource.table} t
          WHERE ${resource.scopeSql}
          ORDER BY t.${col(labelField)} ASC
          LIMIT 1000`,
        [idEmp],
      );

      res.json(rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) })));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Listagem paginada com busca e ordenação
  // --------------------------------------------------------
  router.get('/crud/:resource', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const sortField = columnNames(resource).includes(String(req.query.sort))
        ? String(req.query.sort)
        : resource.defaultSort.field;
      const sortDir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : String(req.query.dir).toLowerCase() === 'desc' ? 'DESC' : resource.defaultSort.dir.toUpperCase();

      const where: string[] = [resource.scopeSql];
      const params: any[] = [idEmp];

      // Busca textual nos campos marcados como searchable
      const search = String(req.query.search || '').trim();
      if (search) {
        const searchable = resource.fields.filter((f) => f.searchable);
        if (searchable.length) {
          where.push(`(${searchable.map((f) => `t.${col(f.name)} LIKE ?`).join(' OR ')})`);
          searchable.forEach(() => params.push(`%${search}%`));
        }
      }

      // Filtro exato por coluna: ?filter_field=status&filter_value=aberto
      // (usado pelo painel mestre-detalhe)
      const filterField = String(req.query.filter_field || '');
      const filterValue = req.query.filter_value;
      if (filterField && filterValue !== undefined && filterValue !== '' && columnNames(resource).includes(filterField)) {
        where.push(`t.${col(filterField)} = ?`);
        params.push(filterValue);
      }

      // Busca avançada: ?filters=[{"field":"categoria","op":"contains","value":"semente"}]
      // Coluna e operador passam por whitelist; o valor vai sempre como parâmetro.
      const filtersRaw = String(req.query.filters || '').trim();
      if (filtersRaw) {
        let parsed: any[];
        try {
          parsed = JSON.parse(filtersRaw);
        } catch {
          throw new Error('Parâmetro "filters" não contém um JSON válido.');
        }
        if (!Array.isArray(parsed)) {
          throw new Error('Parâmetro "filters" deve ser uma lista.');
        }
        if (parsed.length > 20) {
          throw new Error('São aceitos no máximo 20 filtros por consulta.');
        }

        const colunas = columnNames(resource);
        for (const f of parsed) {
          const campo = String(f?.field || '');
          const op = String(f?.op || '');
          const valor = f?.value;

          if (!colunas.includes(campo)) {
            throw new Error(`Filtro inválido: a coluna "${campo}" não existe em ${resource.label}.`);
          }
          // Filtrar por hash de senha (LIKE '%a%', '%ab%'...) permitiria reconstruí-lo aos poucos
          if (resource.fields.find((d) => d.name === campo)?.type === 'password') {
            throw new Error(`Filtro inválido: a coluna "${campo}" não pode ser pesquisada.`);
          }
          if (valor === undefined || valor === null || valor === '') continue;

          switch (op) {
            case 'contains':
              where.push(`t.${col(campo)} LIKE ?`);
              params.push(`%${valor}%`);
              break;
            case 'eq':
              where.push(`t.${col(campo)} = ?`);
              params.push(valor);
              break;
            case 'ne':
              where.push(`t.${col(campo)} <> ?`);
              params.push(valor);
              break;
            case 'gte':
              where.push(`t.${col(campo)} >= ?`);
              params.push(valor);
              break;
            case 'lte':
              where.push(`t.${col(campo)} <= ?`);
              params.push(valor);
              break;
            default:
              throw new Error(`Filtro inválido: operador "${op}" não é suportado.`);
          }
        }
      }

      const whereSql = where.join(' AND ');

      const [countRows] = await pool.query<any[]>(
        `SELECT COUNT(*) AS total FROM ${resource.table} t WHERE ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await pool.query<any[]>(
        `SELECT t.* FROM ${resource.table} t
          WHERE ${whereSql}
          ORDER BY t.${col(sortField)} ${sortDir}
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      res.json({
        data: semSenhas(resource, rows),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Leitura de um registro
  // --------------------------------------------------------
  router.get('/crud/:resource/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);
      const cond = pkCondition(resource, req.params.id);

      const [rows] = await pool.query<any[]>(
        `SELECT t.* FROM ${resource.table} t WHERE ${resource.scopeSql} AND ${cond.sql} LIMIT 1`,
        [idEmp, ...cond.params],
      );

      if (!rows.length) {
        return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      }
      res.json(semSenhas(resource, rows)[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Criação
  // --------------------------------------------------------
  router.post('/crud/:resource', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);

      if (!resource.canCreate) {
        return res.status(403).json({ error: `Não é permitido incluir registros em ${resource.label}.` });
      }

      const payload = await buildWritePayload(resource, req.body || {}, false);
      aplicarRegras(resource, payload);
      validateRequired(resource, payload, false);

      if (resource.tenantColumn) {
        payload[resource.tenantColumn] = idEmp;
      }

      const cols = Object.keys(payload);
      if (!cols.length) {
        return res.status(400).json({ error: 'Nenhum campo foi informado para gravação.' });
      }

      const [result] = await pool.query<any>(
        `INSERT INTO ${resource.table} (${cols.map(col).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => payload[c]),
      );

      const newId = resource.autoIncrement
        ? String(result.insertId)
        : resource.pk.map((c) => payload[c]).join(PK_SEPARATOR);

      res.json({ success: true, id: newId });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resolveResourceSafe(req)) });
    }
  });

  // --------------------------------------------------------
  // Alteração
  // --------------------------------------------------------
  router.put('/crud/:resource/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);

      if (!resource.canUpdate) {
        return res.status(403).json({ error: `Não é permitido alterar registros em ${resource.label}.` });
      }

      const payload = await buildWritePayload(resource, req.body || {}, true);
      aplicarRegras(resource, payload);
      validateRequired(resource, payload, true);

      const cols = Object.keys(payload);
      if (!cols.length) {
        return res.status(400).json({ error: 'Nenhuma alteração foi informada.' });
      }

      const cond = pkCondition(resource, req.params.id);
      const [result] = await pool.query<any>(
        `UPDATE ${resource.table} t
            SET ${cols.map((c) => `t.${col(c)} = ?`).join(', ')}
          WHERE ${resource.scopeSql} AND ${cond.sql}`,
        [...cols.map((c) => payload[c]), idEmp, ...cond.params],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `${resource.labelSingular} não encontrado nesta empresa.` });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resolveResourceSafe(req)) });
    }
  });

  // --------------------------------------------------------
  // Exclusão
  // --------------------------------------------------------
  router.delete('/crud/:resource/:id', async (req: Request, res: Response) => {
    try {
      const idEmp = tenantId(req);
      const resource = resolveResource(req);

      if (!resource.canDelete) {
        return res.status(403).json({ error: `Não é permitido excluir registros em ${resource.label}.` });
      }

      const cond = pkCondition(resource, req.params.id);
      const [result] = await pool.query<any>(
        `DELETE t FROM ${resource.table} t WHERE ${resource.scopeSql} AND ${cond.sql}`,
        [idEmp, ...cond.params],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `${resource.labelSingular} não encontrado nesta empresa.` });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resolveResourceSafe(req)) });
    }
  });

  /** Versão tolerante usada apenas na formatação de erros */
  function resolveResourceSafe(req: Request): ResourceDef {
    return (
      getResource(req.params.resource) ||
      ({ labelSingular: 'registro', label: 'recurso' } as ResourceDef)
    );
  }

  return router;
}
