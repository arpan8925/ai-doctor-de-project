import { useCallback, useEffect, useState } from "react";
import type { Transaction } from "./useWallet";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export type PendingTopup = Transaction & { user_name?: string };

export function useAdmin(getToken: () => Promise<string>) {
  const [pending, setPending] = useState<PendingTopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/admin/transactions/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(body.slice(0, 200) || `HTTP ${r.status}`);
      }
      const data: PendingTopup[] = await r.json();
      setPending(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin queue");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const approve = useCallback(
    async (txnId: string) => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/admin/transactions/${txnId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    },
    [getToken, refresh],
  );

  const reject = useCallback(
    async (txnId: string, reason?: string) => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/admin/transactions/${txnId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason ?? null }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    },
    [getToken, refresh],
  );

  return { pending, loading, error, refresh, approve, reject };
}
