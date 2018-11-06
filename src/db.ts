import { Pool, PoolClient, QueryResult } from 'pg';
import { getEnvVal, bool, string } from './util';
import { Responder, RegExpResponder } from './Responder';

const pool = new Pool({
    connectionString: getEnvVal('DATABASE_URL'),
    ssl: getEnvVal('DATABASE_SSL', bool, true)
});

// ensure our schema exists
const ensureSchemaExists = (() => {
    let called = false;

    return async (client: PoolClient) => {
        if (called) {
            return;
        }

        try {
            // begin transaction
            await client.query('BEGIN');

            // execute create if not exists
            await client.query(`
                CREATE TABLE IF NOT EXISTS responder(
                    id serial PRIMARY KEY,
                    pattern text NOT NULL,
                    flags text,
                    response text NOT NULL,
                    priority integer NOT NULL,
                    created_on timestamp NOT NULL,
                    edited_on timestamp NOT NULL
                );

                CREATE TABLE IF NOT EXISTS responder_history(
                    id serial PRIMARY KEY,
                    responder_id integer NOT NULL,
                    pattern text NOT NULL,
                    flags text,
                    response text NOT NULL,
                    priority integer NOT NULL,
                    edited_by text NOT NULL,
                    edited_on timestamp NOT NULL
                );
                `);

            // commit transaction
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            client.release();
            throw e;
        }

        called = true;
    };
})();

export interface ResponderEntry {
    id: number
    pattern: string
    flags: string
    response: string
    priority: number
    created_on: Date
    edited_by: string
    edited_on: Date
}

export interface CreateOrEditResponderParams {
    id?: number
    pattern?: string
    flags?: string
    response?: string
    priority?: number
}

const p = (str: number) => `${str}`.padStart(2, '0');

async function connect<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
        await ensureSchemaExists(client);
        const result = await fn(client);
        return result;
    } finally {
        // release the client
        client.release();
    }
}

async function query<T>(command: string) {
    let result = await connect(async client => await client.query(command));

    // doesn't support multiple result sets
    if (Array.isArray(result)) {
        result = result[0];
    }

    const rows: T[] = result.rows;
    return rows;
}

async function querySingle<T>(command: string) {
    const rows: T[] = await query<T>(command);
    return rows && rows[0];
}

export async function get(id: number | string): Promise<ResponderEntry> {
    if (typeof id === 'string') {
        id = Number.parseInt(id, 10);
    }

    const responderEntry = await querySingle<ResponderEntry>(`SELECT * FROM responder WHERE id = ${id};`)
    return responderEntry;
}

export async function getAll(orderBy?: keyof ResponderEntry, orderDir?: 'ASC' | 'DESC'): Promise<ResponderEntry[]> {
    let sql = `SELECT * FROM responder`;

    if (orderBy) {
        sql = `${sql} ORDER BY ${orderBy} ${orderDir || ''}`
    }

    sql = `${sql};`;

    const responderEntries = await query<ResponderEntry>(sql);
    return responderEntries;
}

export async function getResponders(orderBy?: keyof ResponderEntry, orderDir?: 'ASC' | 'DESC'): Promise<Responder[]> {
    const responderEntries = await getAll(orderBy, orderDir);

    return responderEntries.map(r => new RegExpResponder(
        new RegExp(r.pattern, r.flags),
        r.response
    ));
}

export async function createOrUpdate(params: CreateOrEditResponderParams, user: string): Promise<number> {
    const { flags, id, pattern, response, priority } = params;
    let command: string;

    if (typeof id !== 'undefined') {
        // update
        let sqlParams: Map<string, string> = new Map(<[(keyof CreateOrEditResponderParams), string][]>[
            ['pattern', pattern],
            ['flags', flags],
            ['response', response],
            ['priority', priority]
        ]
            .filter(p => typeof p[1] !== 'undefined')
            .map(p => [p[0], `'${p[1]}'`])
        );

        // id all fields were undefined, bail
        if (sqlParams.size < 1) {
            console.log('did not receive any fields to update.');
            return id;
        }

        sqlParams.set('edited_on', 'now()');

        command = `
        INSERT INTO responder_history (
            responder_id,
            pattern,
            flags,
            response,
            priority,
            edited_by,
            edited_on
        )
        (
            SELECT
                id,
                pattern,
                flags,
                response,
                priority,
                '${user}',
                now()
            FROM responder
                WHERE id = ${id}
        );

        UPDATE responder SET (
            ${Array.from(sqlParams.keys()).join(',')}
        )
        =
        (
            ${Array.from(sqlParams.values()).join(',')}
        )
        WHERE id = ${id}
        RETURNING id;
        `;
    } else {
        // create
        command = `
        INSERT INTO responder (
            pattern,
            flags,
            response,
            priority,
            created_on,
            edited_on
        )
        VALUES
        (
            '${pattern}',
            '${flags}',
            '${response}',
            '${priority}',
            now(),
            now()
        )
        RETURNING id;
        `;
    }

    return await connect(async client => {
        try {
            // begin transaction
            await client.query('BEGIN');

            // execute query
            const results = await client.query(command);

            // commit transaction
            await client.query('COMMIT');

            if (Array.isArray(results)) {
                // return [1].id
                return results[1].rows[0].id;
            } else {
                // return id
                return results.rows[0].id;
            }
        } catch (e) {
            // rollback transaction
            await client.query('ROLLBACK');
            throw e;
        }
    });
}

export async function del(id: number | string): Promise<boolean> {
    try {
        await query(`DELETE FROM responder WHERE id = ${id};`);
        return true;
    } catch (e) {
        return false;
    }
}