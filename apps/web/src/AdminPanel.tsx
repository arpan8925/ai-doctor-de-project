import { useState } from "react";
import { useAdmin } from "./useAdmin";
import { formatPaise, formatTxnDate } from "./useWallet";

export function AdminPanel({ getToken }: { getToken: () => Promise<string> }) {
  const { pending, loading, error, refresh, approve, reject } = useAdmin(getToken);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleApprove(txnId: string) {
    setBusyId(txnId);
    try {
      await approve(txnId);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(txnId: string) {
    const reason = window.prompt("Reason for rejection (optional):") ?? undefined;
    setBusyId(txnId);
    try {
      await reject(txnId, reason);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-root">
      <div className="page-inner">
        <header className="page-head">
          <div>
            <h1 className="page-title">
              Admin <span className="admin-badge">ADMIN</span>
            </h1>
            <p className="page-sub">Approve or reject pending wallet top-ups. Approved transactions atomically credit the user's balance.</p>
          </div>
          <button className="wizard-btn-ghost" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <section className="card">
          <h2 className="card-title">
            Pending top-ups <span className="count-pill">{pending.length}</span>
          </h2>
          {error && <p className="toast-err">{error}</p>}
          {loading ? (
            <p className="card-sub">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="card-sub">No pending requests. All caught up.</p>
          ) : (
            <div className="admin-table">
              <div className="admin-row admin-head">
                <span>User</span>
                <span>Amount</span>
                <span>Requested</span>
                <span>Method</span>
                <span>Actions</span>
              </div>
              {pending.map((t) => (
                <div key={t.id} className="admin-row">
                  <span className="admin-user">
                    <strong>{t.user_name ?? "Unknown"}</strong>
                    <span className="admin-uid">{t.uid.slice(0, 8)}…</span>
                  </span>
                  <span className="admin-amount">{formatPaise(t.amount_paise)}</span>
                  <span className="admin-date">{formatTxnDate(t.created_at)}</span>
                  <span className="admin-method">{t.payment_method ?? "—"}</span>
                  <span className="admin-actions">
                    <button
                      className="btn-approve"
                      onClick={() => handleApprove(t.id)}
                      disabled={busyId === t.id}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-reject"
                      onClick={() => handleReject(t.id)}
                      disabled={busyId === t.id}
                    >
                      Reject
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
