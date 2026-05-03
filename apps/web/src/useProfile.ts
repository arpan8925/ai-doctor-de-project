import { useCallback, useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export type Profile = {
  name: string;
  age: number;
  sex: "M" | "F" | "O";
  allergies: string[];
  balance_paise?: number;
  role?: "user" | "admin";
};

export function useProfile(getToken: () => Promise<string>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) =>
        fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Profile | null) => { if (!cancelled) setProfile(data); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [getToken]);

  const saveProfile = useCallback(
    async (data: Profile): Promise<void> => {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const saved: Profile = await r.json();
      setProfile(saved);
    },
    [getToken],
  );

  return { profile, loading, saveProfile };
}
