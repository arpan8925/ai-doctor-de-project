import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatResponse, DifferentialItem, Message, Attachment, RedFlag } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

// Cheap client-side preview while waiting for the server's authoritative
// detection. The server's regex set is stricter and includes negation
// handling, so it overrides this on every response.
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

export function useChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [score, setScore] = useState(0);
  const [action, setAction] = useState<string>("ask");
  const [differential, setDifferential] = useState<DifferentialItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redFlag, setRedFlag] = useState<RedFlag | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetch(`${API_BASE}/sessions`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setSessionId(d.session_id))
      .catch((e) => setError(`Backend unreachable at ${API_BASE}: ${e.message}`));
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim()) return;
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
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, message: trimmed }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 220)}`);
        }
        const data: ChatResponse = await res.json();
        setScore(data.score);
        setAction(data.action);
        setDifferential(data.differential ?? []);
        // Server-side detection is authoritative — overrides the client preview.
        if (data.red_flag) {
          setRedFlag(data.red_flag);
        } else if (redFlag?.rule_id === "client-preview") {
          // Client preview fired but server didn't confirm → false positive.
          setRedFlag(null);
        }
        const aiMsg: Message = {
          id: newId(),
          role: "ai",
          content: data.ui,
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, aiMsg]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, pendingAttachments, redFlag],
  );

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

  const reset = useCallback(() => {
    setMessages([]);
    setScore(0);
    setAction("ask");
    setDifferential([]);
    setError(null);
    setRedFlag(null);
    setPendingAttachments([]);
  }, []);

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
    send,
    attachFile,
    removeAttachment,
    dismissRedFlag: () => setRedFlag(null),
    reset,
  };
}
