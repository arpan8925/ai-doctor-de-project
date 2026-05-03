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
import { useChat } from "./useChat";

export default function App() {
  const chat = useChat();
  const [seed, setSeed] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Track whether the user is at the bottom — only auto-scroll if so.
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
