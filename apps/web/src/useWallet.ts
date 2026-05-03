import { useCallback, useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export type Transaction = {
  id: string;
  uid: string;
  type: "credit" | "debit";
  amount_paise: number;
  status: "pending" | "approved" | "rejected" | "completed";
  created_at?: string;
  updated_at?: string;
  approved_at?: string;
  approved_by?: string;
  payment_method?: string;
  session_id?: string;
  cost_usd?: number;
  note?: string;
  rejection_reason?: string;
};

export type WalletState = {
  balance_paise: number;
  transactions: Transaction[];
};

export function useWallet(getToken: () => Promise<string>) {
  const [state, setState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: WalletState = await r.json();
      setState(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestTopup = useCallback(
    async (amountPaise: number): Promise<Transaction> => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/wallet/topup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_paise: amountPaise }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(body.slice(0, 200) || `HTTP ${r.status}`);
      }
      const txn: Transaction = await r.json();
      await refresh();
      return txn;
    },
    [getToken, refresh],
  );

  return { state, loading, error, refresh, requestTopup };
}

// Pure helpers — co-located so any view that imports a Transaction can format it.
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const pa = abs % 100;
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${pa.toString().padStart(2, "0")}`;
}

export function formatTxnDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
