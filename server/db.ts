import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {assertProductionConfig} from './config';

export type QueryResult<T = any> = { rows: T[]; rowCount?: number | null };
export interface SqlClient { query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> }
type Database = SqlClient & { transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>; close(): Promise<void>; kind: string };
const globals = globalThis as unknown as { ryuuDatabase?: Promise<Database> };
export const dataDirectory = () => path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || '.data');

const schema = `
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin','resident','guardian')),
 name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, password_hash TEXT,
 resident_id TEXT UNIQUE, email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 phone_verified BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
 profile JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique ON accounts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_phone_unique ON accounts (phone);
CREATE SEQUENCE IF NOT EXISTS resident_number_seq START 1;
CREATE TABLE IF NOT EXISTS guardian_links (
 resident_user_id TEXT PRIMARY KEY REFERENCES accounts(id), guardian_user_id TEXT NOT NULL REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id),
 expires_at TIMESTAMPTZ NOT NULL, reauthenticated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auth_challenges (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), purpose TEXT NOT NULL,
 channel TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS destination_hash TEXT;
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id), purpose TEXT NOT NULL,
 name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, digest TEXT NOT NULL,
 scan_status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS security_audit (
 id BIGSERIAL PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS system_status (
 key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id),
 session_hash TEXT NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
 endpoint_hash TEXT UNIQUE NOT NULL, subscription JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS push_deliveries (
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES accounts(id),
 subscription_id TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ, lease_token TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 error TEXT, UNIQUE(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_queue ON push_deliveries(status,next_attempt_at);
`;

async function connect(): Promise<Database> {
  assertProductionConfig();
  let result: Database;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis:10000, idleTimeoutMillis:30000, statement_timeout:15000, idle_in_transaction_session_timeout:30000 });
    result = {
      kind: 'PostgreSQL', query: async <T = any>(sql: string, params?: any[]) => await pool.query(sql, params) as unknown as QueryResult<T>,
      async transaction(fn) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
        catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      }, close: () => pool.end()
    };
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_DATABASE !== 'true') throw new Error('DATABASE_URL is required in production.');
    const { PGlite } = await import('@electric-sql/pglite');
    await mkdir(dataDirectory(), { recursive: true });
    const pg = new PGlite(process.env.TEST_DATABASE === 'memory' ? undefined : path.join(dataDirectory(), 'postgres'));
    await pg.waitReady;
    let tail = Promise.resolve();
    async function serial<T>(fn: () => Promise<T>) { const previous = tail; let release!: () => void; tail = new Promise<void>(r => { release = r; }); await previous; try { return await fn(); } finally { release(); } }
    result = { kind: 'Embedded PostgreSQL (local development)',
      query: (sql, params) => serial(() => pg.query(sql, params)),
      transaction: fn => serial(() => pg.transaction(tx => fn(tx))),
      close: () => pg.close()
    };
  }
  try { await result.transaction(async tx=>{if(result.kind==='PostgreSQL')await tx.query('SELECT pg_advisory_xact_lock(74128691)');for(const statement of schema.split(';').filter(s=>s.trim()))await tx.query(statement);}); }catch(error){await result.close();throw error;}
  return result;
}
export async function database() { return globals.ryuuDatabase ??= connect().catch(error=>{globals.ryuuDatabase=undefined;throw error;}); }
export const db = {
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> { return (await database()).query<T>(sql, params); },
  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> { return (await database()).transaction(fn); },
  async close() { if (globals.ryuuDatabase) await (await globals.ryuuDatabase).close(); globals.ryuuDatabase = undefined; }
};
