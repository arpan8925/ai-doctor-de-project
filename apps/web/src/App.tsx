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
import { LoginScreen } from "./LoginScreen";
import { SetupWizard } from "./SetupWizard";
import { useAuth } from "./useAuth";
import { useChat } from "./useChat";
import { useProfile } from "./useProfile";

function ChatApp({ getToken, onSignOut }: { getToken: () => Promise<string>; onSignOut: () => void }) {
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
        <Sidebar onNew={() => chat.reset()} />

        <section className="chat-panel">
          {chat.redFlag && (
            <RedFlagBanner flag={chat.redFlag} onDismiss={chat.dismissRedFlag} />
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

// Mounted only when the user is authenticated — safe to call useProfile unconditionally.
function AuthenticatedApp({
  getToken,
  onSignOut,
}: {
  getToken: () => Promise<string>;
  onSignOut: () => void;
}) {
  const { profile, loading, saveProfile } = useProfile(getToken);

  if (loading) {
    return (
      <div className="login-root">
        <div className="login-loading">Loading your profile…</div>
      </div>
    );
  }

  if (!profile) {
    return <SetupWizard onComplete={saveProfile} />;
  }

  return <ChatApp getToken={getToken} onSignOut={onSignOut} />;
}

export default function App() {
  const { user, loading, step, error, busy, sendOtp, verifyOtp, getToken, signOut } = useAuth();

  if (loading) {
    return (
      <div className="login-root">
        <div className="login-loading">Loading…</div>
      </div>
    );
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
