import 'dotenv/config';
import mysql from 'mysql2/promise';

// A senha vem só do .env: nunca fica no código, que vai para o repositório.
if (!process.env.MYSQL_PASSWORD) {
  console.warn(
    'MYSQL_PASSWORD não está definida. Copie o .env.example para .env e preencha a senha do banco.',
  );
}

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST || '45.224.130.145',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'bmsoftadm',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'myplanner',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Datas chegam como texto ("2026-09-19"), sem o deslocamento de fuso que o
  // driver aplicaria ao converter para Date. O sistema trabalha no horário de
  // Brasília e nunca em UTC.
  dateStrings: true,
};

export const pool = mysql.createPool(dbConfig);

/** Tabelas conferidas no diagnóstico de conexão */
export const DB_TABLES = [
  'empresas',
  'usuarios',
  'categorias',
  'categorias_sub',
  'bancos',
  'centroscustos',
  'limites',
  'limites_mensais',
  'metas',
  'metas_valores',
  'moedas',
  'moedas_cotacao',
  'patrimonio',
  'lancamentos',
  'tipos_doc',
  'config',
  'consultas',
  'consultas_parametros',
  'versoes',
  'versoes_detalhes',
];

export async function checkDbHealth() {
  const startTime = Date.now();
  try {
    const conn = await pool.getConnection();
    const [verResult] = await conn.query<any[]>('SELECT VERSION() as version, DATABASE() as db');
    const latency = Date.now() - startTime;

    const counts: Record<string, number> = {};
    for (const t of DB_TABLES) {
      try {
        const [res] = await conn.query<any[]>(`SELECT COUNT(*) as cnt FROM ${t}`);
        counts[t] = res[0]?.cnt ?? 0;
      } catch {
        counts[t] = 0;
      }
    }

    conn.release();

    return {
      connected: true,
      latencyMs: latency,
      version: verResult[0]?.version || 'MySQL',
      database: verResult[0]?.db || dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      tableCounts: counts,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message || 'Falha de conexão com MySQL',
      code: err.code || 'UNKNOWN',
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      tableCounts: {},
    };
  }
}

/**
 * Data de hoje no horário de Brasília (UTC-3), em "aaaa-mm-dd".
 * Nunca usar toISOString(): ela devolve UTC e vira o dia seguinte à noite.
 */
export function hojeBrasilia(): string {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().slice(0, 10);
}

/** Data e hora de agora em Brasília, em "aaaa-mm-dd hh:mm:ss" */
export function agoraBrasilia(): string {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().slice(0, 19).replace('T', ' ');
}
