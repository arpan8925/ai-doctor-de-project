import { useEffect, useState } from "react";
import { Stethoscope } from "./icons";
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

  // Block ESC from doing anything — wizard must be completed.
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, []);

  const ageNum = parseInt(age, 10);
  const ageValid = age !== "" && ageNum >= 1 && ageNum <= 120;

  const handleComplete = async () => {
    setBusy(true);
    setError(null);
    try {
      const allergies = allergyText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "none");
      await onComplete({
        name: name.trim(),
        age: ageNum,
        sex: sex as "M" | "F" | "O",
        allergies,
      });
    } catch {
      setError("Failed to save profile. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="wizard-overlay" onMouseDown={(e) => e.stopPropagation()}>
      <div className="wizard-card">
        <div className="wizard-header">
          <div className="auth-mark">
            <Stethoscope width={22} height={22} />
          </div>
          <div className="wizard-header-text">
            <strong>AI Doctor</strong>
            <span>Set up your health profile</span>
          </div>
        </div>

        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <div
              key={i}
              className={`wizard-step-pip ${
                i < step ? "done" : i === step ? "active" : ""
              }`}
            >
              <div className="wizard-pip-dot">
                {i < step ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <polyline
                      points="2,6 5,9 10,3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
            <h2 className="wizard-title">Welcome aboard</h2>
            <p className="wizard-sub">
              Let's set up your profile so the AI can give you personalised guidance.
              This only takes a minute.
            </p>
            <div className="wizard-field">
              <label className="wizard-label">Full name</label>
              <input
                className="wizard-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Arpan Dey"
                autoFocus
              />
            </div>
            <div className="wizard-actions">
              <button
                className="wizard-btn-primary"
                disabled={name.trim().length < 2}
                onClick={() => setStep(1)}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1 — Age + Sex ── */}
        {step === 1 && (
          <div className="wizard-body">
            <h2 className="wizard-title">A bit about you</h2>
            <p className="wizard-sub">
              Helps the AI ask age-appropriate questions and weigh symptoms correctly.
            </p>
            <div className="wizard-field">
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
            </div>
            <div className="wizard-field">
              <label className="wizard-label">Biological sex</label>
              <div className="wizard-sex-row">
                {(["M", "F", "O"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`wizard-sex-btn ${sex === s ? "selected" : ""}`}
                    onClick={() => setSex(s)}
                  >
                    {s === "M" ? "Male" : s === "F" ? "Female" : "Other"}
                  </button>
                ))}
              </div>
            </div>
            <div className="wizard-actions wizard-split">
              <button className="wizard-btn-ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button
                className="wizard-btn-primary"
                disabled={!ageValid || !sex}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 — Allergies ── */}
        {step === 2 && (
          <div className="wizard-body">
            <h2 className="wizard-title">Known allergies</h2>
            <p className="wizard-sub">
              List any drug or food allergies, separated by commas. Leave blank if none.
            </p>
            <div className="wizard-field">
              <label className="wizard-label">
                Allergies <span className="wizard-optional">(optional)</span>
              </label>
              <input
                className="wizard-input"
                type="text"
                value={allergyText}
                onChange={(e) => setAllergyText(e.target.value)}
                placeholder="e.g. Penicillin, Peanuts, Latex"
                autoFocus
              />
            </div>
            {error && <p className="wizard-error">{error}</p>}
            <div className="wizard-actions wizard-split">
              <button
                className="wizard-btn-ghost"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                Back
              </button>
              <button
                className="wizard-btn-primary"
                onClick={handleComplete}
                disabled={busy}
              >
                {busy ? "Saving..." : "Complete setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
