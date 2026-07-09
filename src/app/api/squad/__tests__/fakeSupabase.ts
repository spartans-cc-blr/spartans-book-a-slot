// Minimal in-memory stand-in for the subset of the supabase-js query
// builder used by src/app/api/squad/route.ts and src/lib/squadValidation.ts.
// Not a general-purpose mock — just enough chainable surface (select/eq/in/
// limit/maybeSingle/insert/delete/update, and PromiseLike so `await` and a
// bare `.then()` both work) to exercise the real route handlers against a
// fake persistence layer instead of the live database.

type Row = Record<string, any>

export type FakeTables = Record<string, Row[]>

class FakeQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private filters: Array<(row: Row) => boolean> = []
  private mode: 'select' | 'insert' | 'delete' | 'update' = 'select'
  private payload: Row[] | Row | null = null
  private wantsSingle = false

  constructor(private rows: Row[]) {}

  select(_cols?: string) { this.mode = 'select'; return this }
  eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this }
  in(col: string, vals: any[]) { this.filters.push(r => vals.includes(r[col])); return this }
  limit(_n: number) { return this }
  maybeSingle() { this.wantsSingle = true; return this }
  single() { this.wantsSingle = true; return this }

  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }

  delete() { this.mode = 'delete'; return this }
  update(payload: Row) { this.mode = 'update'; this.payload = payload; return this }

  private execute(): { data: any; error: any } {
    if (this.mode === 'select') {
      const matched = this.rows.filter(r => this.filters.every(f => f(r)))
      return { data: this.wantsSingle ? (matched[0] ?? null) : matched, error: null }
    }
    if (this.mode === 'insert') {
      const inserted = (this.payload as Row[]).map(r => ({
        id: `fake-${Math.random().toString(36).slice(2)}`,
        created_at: new Date().toISOString(),
        ...r,
      }))
      this.rows.push(...inserted)
      return { data: inserted, error: null }
    }
    if (this.mode === 'delete') {
      const remaining = this.rows.filter(r => !this.filters.every(f => f(r)))
      const removed    = this.rows.filter(r => this.filters.every(f => f(r)))
      this.rows.length = 0
      this.rows.push(...remaining)
      return { data: removed, error: null }
    }
    if (this.mode === 'update') {
      const matched = this.rows.filter(r => this.filters.every(f => f(r)))
      matched.forEach(r => Object.assign(r, this.payload))
      return { data: matched, error: null }
    }
    return { data: null, error: null }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

export function createFakeSupabase(tables: FakeTables) {
  return {
    from(table: string) {
      if (!tables[table]) tables[table] = []
      return new FakeQueryBuilder(tables[table])
    },
  }
}
