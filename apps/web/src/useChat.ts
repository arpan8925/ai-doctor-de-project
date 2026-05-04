import { useCallback, useRef, useState } from "react";
import type { ChatResponse, DifferentialItem, Message, Attachment, RedFlag } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

const CLIENT_RED_FLAGS = [
  /chest\s+pain.*\b(arm|jaw|sweat)/i,
  /sudden\s+severe\s+headache|worst\s+headache\s+of\s+my\s+life/i,
  /can'?t\s+breathe|gasping\s+for\s+air/i,
  /face\s+droop|slurred\s+speech|stroke/i,
  /\b(passed\s+out|fainted|unconscious)\b/i,
  /\b(suicid|kill\s+myself|want\s+to\s+die)\b/i,
];

function clientPreviewFlag(text: string): RedFlag | null {
  for (const r of CLIENT_RED_FLAGS) {
    if (r.test(text)) {
      return {
        rule_id: "client-preview",
        label: "Possible emergency",
        rationale: "Confirming with the AI Doctor server…",
        severity: "emergency",
      };
    }
  }
  return null;
}

const newId = () => Math.random().toString(36).slice(2, 9);

export function useChat(getToken: () => Promise<string>) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [score, setScore] = useState(0);
  const [action, setAction] = useState<string>("ask");
  const [differential, setDifferential] = useState<DifferentialItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redFlag, setRedFlag] = useState<RedFlag | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [costUsd, setCostUsd] = useState(0);
  const [settled, setSettled] = useState(false);
  const [topupRequired, setTopupRequired] = useState(false);

  // In-flight session-creation promise — guards against double-creation if
  // the user sends two messages before the first POST /sessions returns.
  const startingRef = useRef<Promise<string | null> | null>(null);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (startingRef.current) return startingRef.current;
    setError(null);
    setSettled(false);
    setCostUsd(0);
    setTopupRequired(false);
    startingRef.current = (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status === 402) {
          setTopupRequired(true);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setSessionId(d.session_id);
        return d.session_id as string;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Backend unreachable at ${API_BASE}: ${msg}`);
        return null;
      } finally {
        startingRef.current = null;
      }
    })();
    return startingRef.current;
  }, [sessionId, getToken]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const sid = sessionId ?? (await ensureSession());
      if (!sid) return;
      const trimmed = text.trim();
      const preview = clientPreviewFlag(trimmed);
      if (preview && !redFlag) setRedFlag(preview);

      const userMsg: Message = {
        id: newId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
      };
      setMessages((m) => [...m, userMsg]);
      setPendingAttachments([]);
      setBusy(true);
      setError(null);

      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sid, message: trimmed }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 220)}`);
        }
        const data: ChatResponse & { cost_usd?: number; settled?: boolean } = await res.json();
        setScore(data.score);
        setAction(data.action);
        setDifferential(data.differential ?? []);
        if (typeof data.cost_usd === "number") setCostUsd(data.cost_usd);
        if (data.settled) setSettled(true);
        if (data.red_flag) {
          setRedFlag(data.red_flag);
        } else if (redFlag?.rule_id === "client-preview") {
          setRedFlag(null);
        }
        const aiMsg: Message = {
          id: newId(),
          role: "ai",
          content: data.ui,
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, aiMsg]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, ensureSession, pendingAttachments, redFlag, getToken],
  );

  const endSession = useCallback(async () => {
    if (!sessionId || settled) return;
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSettled(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to end session");
    }
  }, [sessionId, settled, getToken]);

  const attachFile = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = Array.from(files).map((f) => ({
      id: newId(),
      name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "pdf",
      size: f.size,
    }));
    setPendingAttachments((cur) => [...cur, ...next]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((cur) => cur.filter((a) => a.id !== id));
  }, []);

  const reset = useCallback(async () => {
    // Settle current session before tearing down (idempotent on backend).
    if (sessionId && !settled) {
      try {
        const token = await getToken();
        await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* swallow — we're navigating away anyway */ }
    }
    setMessages([]);
    setScore(0);
    setAction("ask");
    setDifferential([]);
    setError(null);
    setRedFlag(null);
    setPendingAttachments([]);
    setSessionId(null);
    setSettled(false);
    setCostUsd(0);
    setTopupRequired(false);
    // No new session is created here — we'll create one lazily when the
    // user sends their first message, so navigating around the app or
    // clicking "New consult" doesn't litter Firestore with empty docs.
  }, [sessionId, settled, getToken]);

  return {
    apiBase: API_BASE,
    sessionId,
    messages,
    score,
    action,
    differential,
    busy,
    error,
    redFlag,
    pendingAttachments,
    costUsd,
    settled,
    topupRequired,
    send,
    attachFile,
    removeAttachment,
    dismissRedFlag: () => setRedFlag(null),
    reset,
    endSession,
  };
}
