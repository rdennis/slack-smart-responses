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
                    created_on timestamp NOT NULL,
                    edited_on timestamp NOT NULL
                );

                CREATE TABLE IF NOT EXISTS responder_history(
                    id serial PRIMARY KEY,
                    responder_id integer NOT NULL,
                    pattern text NOT NULL,
                    flags text,
                    response text NOT NULL,
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
    created_on: Date
    edited_by: string
    edited_on: Date
}

export interface CreateOrEditResponderParams {
    id?: number
    pattern?: string
    flags?: string
    response?: string
}

const p = (str: number) => `${str}`.padStart(2, '0');

/**
 * Format a date as a postgresql timestamp.
 * @param date 
 */
const timestamp = (date: Date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;

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

export async function get(): Promise<ResponderEntry[]> {
    const responderEntries = await query<ResponderEntry>('SELECT * FROM responder;');
    return responderEntries;
}

export async function getResponders(): Promise<Responder[]> {
    const responderEntries = await get();

    return responderEntries.map(r => new RegExpResponder(
        new RegExp(r.pattern, r.flags),
        r.response
    ));
}

export async function createOrUpdateResponder(params: CreateOrEditResponderParams, user: string): Promise<number> {
    const { flags, id, pattern, response } = params;
    let command: string;

    if (typeof id !== 'undefined') {
        // update
        let sqlParams: Map<string, string> = new Map(<[(keyof CreateOrEditResponderParams), string][]>[
            ['pattern', pattern],
            ['flags', flags],
            ['response', response]
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
            edited_by,
            edited_on
        )
        (
            SELECT
                id,
                pattern,
                flags,
                response,
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
            created_on,
            edited_on
        )
        VALUES
        (
            '${pattern}',
            '${flags}',
            '${response}',
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