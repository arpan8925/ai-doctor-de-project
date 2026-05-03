import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  Composer,
  EmptyState,
  ErrorBanner,
  MessageBubble,
  RedFlagBanner,
  RightRail,
  Sidebar,
  TopBar,
} from "./components";
import type { Page } from "./components";
import { LoginScreen } from "./LoginScreen";
import { SetupWizard } from "./SetupWizard";
import { AdminPanel } from "./AdminPanel";
import { Wallet } from "./Wallet";
import { useAuth } from "./useAuth";
import { useChat } from "./useChat";
import { useProfile, type Profile } from "./useProfile";
import { formatPaise } from "./useWallet";

function ChatPage({
  getToken,
  page,
  onNavigate,
  onSignOut,
  isAdmin,
}: {
  getToken: () => Promise<string>;
  page: Page;
  onNavigate: (p: Page) => void;
  onSignOut: () => void;
  isAdmin: boolean;
}) {
  const chat = useChat(getToken);
  const [seed, setSeed] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = dist < 80;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.busy]);

  return (
    <div className="app">
      <TopBar
        apiBase={chat.apiBase}
        busy={chat.busy}
        online={chat.sessionId !== null}
        onSignOut={onSignOut}
      />

      <main className="main">
        <Sidebar
          onNew={() => chat.reset()}
          page={page}
          onNavigate={onNavigate}
          isAdmin={isAdmin}
        />

        <section className="chat-panel">
          {chat.redFlag && (
            <RedFlagBanner flag={chat.redFlag} onDismiss={chat.dismissRedFlag} />
          )}

          {chat.topupRequired && (
            <div className="topup-banner">
              <strong>Top-up needed.</strong> Your wallet balance is negative — add money before starting a new consultation.
              <button className="topup-banner-btn" onClick={() => onNavigate("wallet")}>
                Go to wallet
              </button>
            </div>
          )}

          <div className="messages" ref={messagesRef}>
            {chat.messages.length === 0 ? (
              <EmptyState
                onPick={(s) => setSeed(s)}
                onPickRegion={(r) => setSeed(`I have pain in my ${r.toLowerCase()}`)}
              />
            ) : (
              <>
                {chat.messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
                {chat.busy && (
                  <div className="msg msg-ai">
                    <div className="msg-avatar typing"><span /><span /><span /></div>
                    <div className="msg-body">
                      <div className="msg-bubble ai typing-bubble">
                        <span className="dot-typing" /><span className="dot-typing" /><span className="dot-typing" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {chat.error && <ErrorBanner message={chat.error} />}
          </div>

          {/* Cost meter + end-consultation button */}
          {chat.messages.length > 0 && (
            <div className="cost-bar">
              <span className="cost-label">
                Session cost: <strong>{formatPaise(usdToPaise(chat.costUsd))}</strong>
                {chat.settled && <span className="cost-settled"> · settled</span>}
              </span>
              {!chat.settled && (
                <button
                  className="cost-end-btn"
                  onClick={() => chat.endSession()}
                  disabled={chat.busy}
                >
                  End consultation
                </button>
              )}
            </div>
          )}

          <Composer
            busy={chat.busy}
            pendingAttachments={chat.pendingAttachments}
            onAttach={chat.attachFile}
            onRemoveAttachment={chat.removeAttachment}
            onSend={(t) => {
              chat.send(t);
              setSeed("");
            }}
            defaultValue={seed}
          />
        </section>

        <RightRail
          score={chat.score}
          action={chat.action}
          differential={chat.differential}
        />
      </main>
    </div>
  );
}

// 83 INR/USD — kept in sync with backend INR_PER_USD; only used for the running
// cost meter (the authoritative debit happens server-side at settle time).
function usdToPaise(usd: number): number {
  return Math.ceil(usd * 83 * 100);
}

function AppShell({
  profile,
  getToken,
  onSignOut,
}: {
  profile: Profile;
  getToken: () => Promise<string>;
  onSignOut: () => void;
}) {
  const [page, setPage] = useState<Page>("chat");
  const isAdmin = profile.role === "admin";

  // Force non-admins off /admin if they somehow land there.
  useEffect(() => {
    if (page === "admin" && !isAdmin) setPage("chat");
  }, [page, isAdmin]);

  if (page === "wallet") {
    return (
      <PageShell page={page} onNavigate={setPage} isAdmin={isAdmin} onSignOut={onSignOut}>
        <Wallet getToken={getToken} />
      </PageShell>
    );
  }
  if (page === "admin" && isAdmin) {
    return (
      <PageShell page={page} onNavigate={setPage} isAdmin={isAdmin} onSignOut={onSignOut}>
        <AdminPanel getToken={getToken} />
      </PageShell>
    );
  }
  return (
    <ChatPage
      getToken={getToken}
      page={page}
      onNavigate={setPage}
      onSignOut={onSignOut}
      isAdmin={isAdmin}
    />
  );
}

function PageShell({
  page,
  onNavigate,
  isAdmin,
  onSignOut,
  children,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  isAdmin: boolean;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <TopBar apiBase="" busy={false} online onSignOut={onSignOut} />
      <main className="main">
        <Sidebar
          onNew={() => onNavigate("chat")}
          page={page}
          onNavigate={onNavigate}
          isAdmin={isAdmin}
        />
        <section className="chat-panel page-section">{children}</section>
        <div className="right-rail-placeholder" />
      </main>
    </div>
  );
}

function AuthenticatedApp({
  getToken,
  onSignOut,
}: {
  getToken: () => Promise<string>;
  onSignOut: () => void;
}) {
  const { profile, loading, saveProfile } = useProfile(getToken);

  if (loading) {
    return <div className="auth-loading-shell">Loading your profile…</div>;
  }
  if (!profile) {
    return <SetupWizard onComplete={saveProfile} />;
  }
  return <AppShell profile={profile} getToken={getToken} onSignOut={onSignOut} />;
}

export default function App() {
  const { user, loading, step, error, busy, sendOtp, verifyOtp, getToken, signOut } = useAuth();

  if (loading) {
    return <div className="auth-loading-shell">Loading…</div>;
  }
  if (!user) {
    return (
      <LoginScreen
        step={step}
        busy={busy}
        error={error}
        onSendOtp={sendOtp}
        onVerifyOtp={verifyOtp}
      />
    );
  }
  return <AuthenticatedApp getToken={getToken} onSignOut={signOut} />;
}
