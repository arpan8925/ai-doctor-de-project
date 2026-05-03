import { useState } from "react";
import type { Transaction } from "./useWallet";
import { formatPaise, formatTxnDate, useWallet } from "./useWallet";

const QUICK_AMOUNTS = [100, 500, 1000, 2000];

export function Wallet({ getToken }: { getToken: () => Promise<string> }) {
  const { state, loading, error, requestTopup } = useWallet(getToken);
  const [amount, setAmount] = useState<number>(500);
  const [custom, setCustom] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const effectiveAmount = custom.trim() ? Math.round(parseFloat(custom) || 0) : amount;
  const amountPaise = effectiveAmount * 100;

  async function handlePay() {
    if (amountPaise < 1000) {
      setToast({ kind: "err", msg: "Minimum top-up is ₹10" });
      return;
    }
    setBusy(true);
    setToast(null);
    // Mock gateway — simulate 1.5s of "processing" before hitting the API.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await requestTopup(amountPaise);
      setToast({
        kind: "ok",
        msg: `Top-up of ${formatPaise(amountPaise)} requested. Awaiting admin approval.`,
      });
      setCustom("");
    } catch (e: unknown) {
      setToast({ kind: "err", msg: e instanceof Error ? e.message : "Top-up failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-root">
      <div className="page-inner">
        <header className="page-head">
          <div>
            <h1 className="page-title">Wallet</h1>
            <p className="page-sub">Top up using the test gateway. Each top-up requires admin approval before it credits your balance.</p>
          </div>
        </header>

        {/* Balance card */}
        <section className="card balance-card">
          <div className="balance-meta">
            <span className="balance-label">Current balance</span>
            <span className="balance-amount">
              {loading ? "—" : formatPaise(state?.balance_paise ?? 0)}
            </span>
            {state && state.balance_paise < 0 && (
              <span className="balance-warn">Negative balance — top up to start a new consultation.</span>
            )}
          </div>
        </section>

        {/* Top-up form */}
        <section className="card">
          <h2 className="card-title">Add money</h2>
          <p className="card-sub">Pick a quick amount or enter a custom one.</p>

          <div className="quick-amounts">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                className={`quick-amount ${!custom && amount === amt ? "selected" : ""}`}
                onClick={() => {
                  setAmount(amt);
                  setCustom("");
                }}
                disabled={busy}
              >
                ₹{amt}
              </button>
            ))}
          </div>

          <div className="custom-amount">
            <label className="wizard-label">Custom amount (₹)</label>
            <input
              className="wizard-input"
              type="number"
              min={10}
              max={10000}
              placeholder="e.g. 250"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={busy}
            />
          </div>

          <button
            className="wizard-btn-primary topup-btn"
            disabled={busy || amountPaise < 1000}
            onClick={handlePay}
          >
            {busy ? "Processing payment…" : `Pay ${formatPaise(amountPaise)} via Test Gateway`}
          </button>

          {toast && (
            <p className={toast.kind === "ok" ? "toast-ok" : "toast-err"}>{toast.msg}</p>
          )}
          {error && <p className="toast-err">{error}</p>}
        </section>

        {/* Transactions */}
        <section className="card">
          <h2 className="card-title">Recent transactions</h2>
          {loading ? (
            <p className="card-sub">Loading…</p>
          ) : !state || state.transactions.length === 0 ? (
            <p className="card-sub">No transactions yet.</p>
          ) : (
            <div className="txn-table">
              <div className="txn-row txn-head">
                <span>Type</span>
                <span>Amount</span>
                <span>Status</span>
                <span>When</span>
                <span>Details</span>
              </div>
              {state.transactions.map((t) => (
                <TransactionRow key={t.id} txn={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TransactionRow({ txn }: { txn: Transaction }) {
  const isCredit = txn.type === "credit";
  return (
    <div className="txn-row">
      <span className={`txn-type ${isCredit ? "credit" : "debit"}`}>
        {isCredit ? "Top-up" : "Usage"}
      </span>
      <span className="txn-amount">
        {isCredit ? "+" : "−"}
        {formatPaise(txn.amount_paise)}
      </span>
      <span className={`txn-status status-${txn.status}`}>{txn.status}</span>
      <span className="txn-date">{formatTxnDate(txn.created_at)}</span>
      <span className="txn-note">
        {txn.note ?? "—"}
        {txn.rejection_reason && (
          <span className="txn-reason"> · {txn.rejection_reason}</span>
        )}
      </span>
    </div>
  );
}
