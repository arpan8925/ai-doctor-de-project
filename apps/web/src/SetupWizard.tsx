import { useEffect, useState } from "react";
import type { Profile } from "./useProfile";

interface Props {
  onComplete: (profile: Profile) => Promise<void>;
}

const STEPS = ["Your name", "About you", "Health basics"] as const;

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "O" | "">("");
  const [allergyText, setAllergyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Block ESC from doing anything
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, []);

  const handleComplete = async () => {
    setBusy(true);
    setError(null);
    try {
      const allergies = allergyText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "none");
      await onComplete({ name: name.trim(), age: parseInt(age, 10), sex: sex as "M" | "F" | "O", allergies });
    } catch {
      setError("Failed to save — please try again.");
      setBusy(false);
    }
  };

  const ageNum = parseInt(age, 10);
  const ageValid = age !== "" && ageNum >= 1 && ageNum <= 120;

  return (
    // Stop propagation so clicking the overlay card never "falls through"
    <div className="wizard-overlay" onMouseDown={(e) => e.stopPropagation()}>
      <div className="wizard-card">

        {/* Step indicator */}
        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <div key={i} className={`wizard-step-pip ${i < step ? "done" : i === step ? "active" : ""}`}>
              <div className="wizard-pip-dot">
                {i < step ? (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="wizard-pip-label">{label}</span>
              {i < STEPS.length - 1 && <div className="wizard-pip-line" />}
            </div>
          ))}
        </div>

        {/* ── Step 0 — Name ── */}
        {step === 0 && (
          <div className="wizard-body">
            <h2 className="wizard-title">Welcome to AI Doctor</h2>
            <p className="wizard-sub">Complete your health profile to begin — this only takes a minute.</p>
            <label className="wizard-label">Full name</label>
            <input
              className="wizard-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arpan Dey"
              autoFocus
            />
            <div className="wizard-actions">
              <button
                className="wizard-btn-primary"
                disabled={name.trim().length < 2}
                onClick={() => setStep(1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1 — Age + Sex ── */}
        {step === 1 && (
          <div className="wizard-body">
            <h2 className="wizard-title">A bit about you</h2>
            <p className="wizard-sub">Helps the AI ask age-appropriate questions.</p>
            <label className="wizard-label">Age</label>
            <input
              className="wizard-input"
              type="number"
              min={1}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 22"
              autoFocus
            />
            <label className="wizard-label" style={{ marginTop: 16 }}>Biological sex</label>
            <div className="wizard-sex-row">
              {(["M", "F", "O"] as const).map((s) => (
                <button
                  key={s}
                  className={`wizard-sex-btn ${sex === s ? "selected" : ""}`}
                  onClick={() => setSex(s)}
                >
                  {s === "M" ? "Male" : s === "F" ? "Female" : "Other"}
                </button>
              ))}
            </div>
            <div className="wizard-actions wizard-split">
              <button className="wizard-btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button
                className="wizard-btn-primary"
                disabled={!ageValid || !sex}
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 — Allergies ── */}
        {step === 2 && (
          <div className="wizard-body">
            <h2 className="wizard-title">Known allergies</h2>
            <p className="wizard-sub">
              Enter any allergies separated by commas — or leave blank if none.
            </p>
            <label className="wizard-label">Allergies <span className="wizard-optional">(optional)</span></label>
            <input
              className="wizard-input"
              type="text"
              value={allergyText}
              onChange={(e) => setAllergyText(e.target.value)}
              placeholder="e.g. Penicillin, Peanuts, Latex"
              autoFocus
            />
            {error && <p className="wizard-error">{error}</p>}
            <div className="wizard-actions wizard-split">
              <button className="wizard-btn-ghost" onClick={() => setStep(1)} disabled={busy}>
                ← Back
              </button>
              <button className="wizard-btn-primary" onClick={handleComplete} disabled={busy}>
                {busy ? "Saving…" : "Complete Setup →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
