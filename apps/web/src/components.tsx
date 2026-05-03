import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Brain,
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  Globe,
  Heart,
  Home,
  MessageSquare,
  Mic,
  Paperclip,
  Pill,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Stethoscope,
  X,
  Zap,
} from "./icons";
import {
  ClarificationGauge,
  DifferentialDonut,
  DifferentialLegend,
  Sparkline,
} from "./charts";
import {
  BODY_REGIONS,
  MOCK_PATIENT,
  MOCK_RECENT_SESSIONS,
  MOCK_VITALS,
  QUICK_SYMPTOM_CHIPS,
} from "./mock";
import type { Attachment, DifferentialItem, Message, RedFlag } from "./types";

// ────────────────────────────── TopBar ──────────────────────────────

export function TopBar({
  apiBase,
  busy,
  online,
}: {
  apiBase: string;
  busy: boolean;
  online: boolean;
}) {
  const [locale, setLocale] = useState("EN");
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Stethoscope width={20} height={20} />
        </div>
        <div className="brand-name">
          <strong>AI Doctor</strong>
          <span>conversational triage · v0.1</span>
        </div>
      </div>

      <div className="search">
        <Search width={16} height={16} />
        <input placeholder="Search conditions, symptoms, ICD-10 codes…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar-actions">
        <button className={`status-pill ${online ? "ok" : "off"}`} title={apiBase}>
          <span className="status-dot" />
          {busy ? "Thinking…" : online ? "Connected" : "Offline"}
        </button>

        <div className="locale">
          <Globe width={14} height={14} />
          <select value={locale} onChange={(e) => setLocale(e.target.value)} aria-label="Language">
            <option>EN</option>
            <option>हिं</option>
            <option>ગુજ</option>
          </select>
        </div>

        <button className="icon-btn" aria-label="Notifications">
          <Bell width={16} height={16} />
          <span className="badge">2</span>
        </button>

        <button className="profile" title={MOCK_PATIENT.name}>
          <span className="avatar">{MOCK_PATIENT.name.charAt(0)}</span>
          <span className="profile-name">{MOCK_PATIENT.name.split(" ")[0]}</span>
        </button>
      </div>
    </header>
  );
}

// ────────────────────────────── Sidebar ─────────────────────────────

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "consult", label: "New consult", icon: MessageSquare, active: true },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "vitals", label: "Vitals", icon: Activity },
  { id: "history", label: "History", icon: Calendar },
  { id: "guidelines", label: "Guidelines", icon: ClipboardList },
];

export function Sidebar({ onNew }: { onNew: () => void }) {
  return (
    <aside className="sidebar">
      <button className="new-consult" onClick={onNew}>
        <Plus width={16} height={16} />
        <span>New consult</span>
      </button>

      <nav className="nav">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button key={n.id} className={`nav-item ${n.active ? "active" : ""}`}>
              <Icon width={16} height={16} />
              <span>{n.label}</span>
              {n.active && <ChevronRight width={14} height={14} className="nav-caret" />}
            </button>
          );
        })}
      </nav>

      <div className="recent">
        <div className="section-title">Recent</div>
        <ul className="recent-list">
          {MOCK_RECENT_SESSIONS.map((s) => (
            <li key={s.id} className={`recent-item status-${s.status}`}>
              <div className="recent-line">
                <strong>{s.patientName}</strong>
                <span className="recent-status">
                  {s.status === "active" ? "active" : s.status === "awaiting_labs" ? "labs" : "done"}
                </span>
              </div>
              <div className="recent-dx">{s.topDiagnosis}</div>
              <div className="recent-foot">
                <span>{relTime(s.startedAt)}</span>
                <span className="recent-score">{s.score}/100</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <button className="settings-btn">
        <Settings width={14} height={14} />
        <span>Settings</span>
      </button>
    </aside>
  );
}

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ────────────────────────────── EmptyState ──────────────────────────

export function EmptyState({
  onPick,
  onPickRegion,
}: {
  onPick: (s: string) => void;
  onPickRegion: (r: string) => void;
}) {
  return (
    <div className="empty">
      <div className="empty-illustration" aria-hidden>
        <div className="pulse"><Heart width={28} height={28} /></div>
      </div>
      <h2>How are you feeling today?</h2>
      <p>Tell me what's wrong in your own words. I'll ask follow-up questions to narrow it down — and I'll let you know when you should see a doctor in person.</p>

      <div className="quick-card">
        <div className="quick-title">Quick symptoms</div>
        <div className="chips">
          {QUICK_SYMPTOM_CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => onPick(`I have ${c.toLowerCase()}`)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-card">
        <div className="quick-title">Or tap where it hurts</div>
        <div className="regions">
          {BODY_REGIONS.map((r) => (
            <button key={r.id} className="region" onClick={() => onPickRegion(r.label)}>
              <span className="region-emoji">{r.emoji}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="reassure">
        <ShieldCheck width={14} height={14} />
        <span>Educational only. Not a substitute for a licensed doctor. In an emergency, call your local emergency line.</span>
      </div>
    </div>
  );
}

// ────────────────────────────── MessageBubble ───────────────────────

export function MessageBubble({ m }: { m: Message }) {
  return (
    <div className={`msg msg-${m.role}`}>
      <div className="msg-avatar">
        {m.role === "user" ? MOCK_PATIENT.name.charAt(0) : <Stethoscope width={14} height={14} />}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <strong>{m.role === "user" ? "You" : "AI Doctor"}</strong>
          <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className={`msg-bubble ${m.role}`}>
          <div className="msg-text">{m.content}</div>
          {m.attachments && m.attachments.length > 0 && (
            <div className="msg-attachments">
              {m.attachments.map((a) => (
                <span key={a.id} className="att-pill">
                  <FileText width={12} height={12} />
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────── Composer ────────────────────────────

export function Composer({
  busy,
  pendingAttachments,
  onAttach,
  onRemoveAttachment,
  onSend,
  defaultValue = "",
}: {
  busy: boolean;
  pendingAttachments: Attachment[];
  onAttach: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (text: string) => void;
  defaultValue?: string;
}) {
  const [text, setText] = useState(defaultValue);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(defaultValue), [defaultValue]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [text]);

  function submit() {
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  }

  return (
    <div className="composer">
      {pendingAttachments.length > 0 && (
        <div className="att-tray">
          {pendingAttachments.map((a) => (
            <span key={a.id} className="att-pill">
              <FileText width={12} height={12} />
              {a.name}
              <button onClick={() => onRemoveAttachment(a.id)} aria-label="Remove">
                <X width={10} height={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = "";
          }}
        />
        <button className="composer-icon" onClick={() => fileRef.current?.click()} aria-label="Attach">
          <Paperclip width={16} height={16} />
        </button>
        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          placeholder="Describe your symptoms… (e.g. headache and nausea for 2 days)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={busy}
        />
        <button
          className="composer-icon"
          aria-label="Voice (coming Week 11)"
          title="Voice input — coming Week 11"
        >
          <Mic width={16} height={16} />
        </button>
        <button className="composer-send" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? <span className="spinner" /> : <Send width={16} height={16} />}
          <span>{busy ? "Thinking…" : "Send"}</span>
        </button>
      </div>
      <div className="composer-foot">
        <span>Enter to send · Shift+Enter for newline</span>
        <span className="legal">
          <ShieldCheck width={11} height={11} /> Encrypted in transit. Not stored after this session.
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────── RedFlagBanner ───────────────────────

export function RedFlagBanner({ flag, onDismiss }: { flag: RedFlag; onDismiss: () => void }) {
  const checking = flag.rule_id === "client-preview";
  return (
    <div className={`red-flag ${checking ? "red-flag-pending" : ""}`}>
      <AlertTriangle width={20} height={20} />
      <div>
        <strong>{checking ? "Checking with AI Doctor…" : flag.label}</strong>{" "}
        <span>
          {checking
            ? flag.rationale
            : `${flag.rationale} Please go to the nearest emergency room or call your local emergency number now — don't wait for further AI questions.`}
        </span>
      </div>
      <button className="red-flag-x" onClick={onDismiss} aria-label="Dismiss">
        <X width={14} height={14} />
      </button>
    </div>
  );
}

// ────────────────────────────── ErrorBanner ─────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="err-banner">
      <AlertTriangle width={16} height={16} />
      <span>{message}</span>
    </div>
  );
}

// ────────────────────────────── RightRail ───────────────────────────

export function RightRail({
  score,
  action,
  differential,
}: {
  score: number;
  action: string;
  differential: DifferentialItem[];
}) {
  const hasReal = differential.length > 0;
  return (
    <aside className="right-rail">
      <PatientCard />

      <Card title="Differential" subtitle="Top candidate diagnoses" icon={<Brain width={14} height={14} />}>
        {hasReal ? (
          <>
            <DifferentialDonut items={differential} />
            <DifferentialLegend items={differential} />
            <div className="card-foot">
              {differential.length} candidates · RAG-retrieved from ICD-10
            </div>
          </>
        ) : (
          <div className="diff-empty">
            <Brain width={28} height={28} />
            <p>Differential appears once you describe your symptoms.</p>
            <small>The top-K disease candidates are retrieved from a 1,643-record ICD-10 vector index.</small>
          </div>
        )}
      </Card>

      <Card title="Clarification" subtitle="How sure am I?" icon={<Zap width={14} height={14} />}>
        <ClarificationGauge score={score} action={action} />
        <ul className="thresholds">
          <li><span className="dot ask" /> &lt;70 — keep asking</li>
          <li><span className="dot req" /> 70–95 — request labs</li>
          <li><span className="dot com" /> ≥95 — diagnose</li>
        </ul>
      </Card>

      <Card title="Vitals (24h)" subtitle="From smartwatch" icon={<Heart width={14} height={14} />}>
        <div className="vitals-grid">
          {MOCK_VITALS.map((v) => (
            <Sparkline key={v.label} series={v} width={250} height={32} />
          ))}
        </div>
      </Card>

      <Card title="Engine" subtitle="LLM + RAG stack" icon={<Pill width={14} height={14} />}>
        <ModeCard />
      </Card>
    </aside>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="card-head">
        <div className="card-title">
          {icon && <span className="card-icon">{icon}</span>}
          <span>{title}</span>
        </div>
        {subtitle && <span className="card-sub">{subtitle}</span>}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

function PatientCard() {
  return (
    <section className="patient-card">
      <div className="patient-avatar">{MOCK_PATIENT.name.charAt(0)}</div>
      <div className="patient-info">
        <strong>{MOCK_PATIENT.name}</strong>
        <span>
          {MOCK_PATIENT.age}y · {MOCK_PATIENT.sex} · {MOCK_PATIENT.locale}
        </span>
        <div className="patient-tags">
          <span className="tag tag-warn">⚠ {MOCK_PATIENT.allergies[0]} allergy</span>
          {MOCK_PATIENT.watchLinked && <span className="tag tag-ok">⌚ Watch linked</span>}
        </div>
      </div>
    </section>
  );
}

function ModeCard() {
  return (
    <div className="mode mode-ok">
      <strong>Gemini 2.0 Flash · LiteLLM</strong>
      <span>
        Each turn the model generates the next follow-up question and re-scores
        the differential against new evidence. Retrieval is cosine search over
        a 1,643-record ICD-10 + MedlinePlus index.
      </span>
    </div>
  );
}
