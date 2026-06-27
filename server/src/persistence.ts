/**
 * PHASE 4 SCAFFOLD — persistent identity + chip balances.
 *
 * Today balances live in-memory per session (see CasinoRoom). This module
 * defines the seam where durable accounts plug in. The in-memory store keeps
 * the build green; swap it for a DB-backed implementation in Phase 4.
 */

export interface Account {
  /** Stable identity id (Phase 4: from an auth provider, not a session id). */
  id: string;
  displayName: string;
  /** Play-money balance. PLAY MONEY ONLY — never real currency. */
  balance: number;
}

export interface AccountStore {
  load(id: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
}

/**
 * In-memory store used for now. Data is lost on restart.
 *
 * TODO(phase4): replace with a durable store (SQLite/Postgres/Redis). Persist
 * balance on stand-up and disconnect; load on (re)join keyed by a real auth id
 * rather than the Colyseus sessionId so identity + chips survive sessions.
 */
export class InMemoryAccountStore implements AccountStore {
  private accounts = new Map<string, Account>();

  async load(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }
}

// TODO(phase4): a single shared store instance wired into CasinoRoom, plus
// migration of the room's in-memory `balances` map onto this interface.
export const accountStore: AccountStore = new InMemoryAccountStore();
