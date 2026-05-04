import { useCallback, useEffect, useState } from "react";
import type { RecentSession } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export type InsufficientBalanceError = {
  kind: "insufficient_balance";
  balancePaise: number;
  requiredPaise: number;
  shortfallPaise: number;
  sessionId: string;
};

/** Thrown by closeSession when the user can't cover the session cost.
 *  The caller is expected to catch this and route the user to the wallet. */
export class InsufficientBalance extends Error {
  detail: InsufficientBalanceError;
  constructor(detail: InsufficientBalanceError) {
    super("Insufficient balance to close this session");
    this.detail = detail;
  }
}

export function useSessions(getToken: () => Promise<string>) {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: RecentSession[] = await r.json();
      setSessions(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const closeSession = useCallback(
    async (id: string): Promise<void> => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/sessions/${id}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 402) {
        const body = await r.json().catch(() => ({}));
        const d = body?.detail ?? body;
        throw new InsufficientBalance({
          kind: "insufficient_balance",
          balancePaise: d?.balance_paise ?? 0,
          requiredPaise: d?.required_paise ?? 0,
          shortfallPaise: d?.shortfall_paise ?? 0,
          sessionId: d?.session_id ?? id,
        });
      }
      if (!r.ok) {
        const body = await r.text();
        throw new Error(body.slice(0, 200) || `HTTP ${r.status}`);
      }
      await refresh();
    },
    [getToken, refresh],
  );

  const deleteSession = useCallback(
    async (id: string): Promise<void> => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(body.slice(0, 200) || `HTTP ${r.status}`);
      }
      await refresh();
    },
    [getToken, refresh],
  );

  return { sessions, loading, error, refresh, closeSession, deleteSession };
}

export type UseSessionsResult = ReturnType<typeof useSessions>;
