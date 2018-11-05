import * as pg from "pg";

declare module 'pg' {
    export interface ClientBase {
        query(queryTextOrConfig: string | QueryConfig, values?: any[]): Promise<QueryResult | QueryResult[]>
    }
}