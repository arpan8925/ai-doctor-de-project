import { useState } from "react";
import { Stethoscope } from "./icons";
import type { AuthStep } from "./useAuth";

interface Props {
  step: AuthStep;
  busy: boolean;
  error: string | null;
  onSendOtp: (phone: string) => void;
  onVerifyOtp: (otp: string) => void;
}

export function LoginScreen({ step, busy, error, onSendOtp, onVerifyOtp }: Props) {
  const [phone, setPhone] = useState("+91 ");
  const [otp, setOtp] = useState("");

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">
            <Stethoscope width={26} height={26} />
          </div>
          <div>
            <h1>AI Doctor</h1>
            <p className="auth-brand-tagline">Conversational triage for everyone</p>
          </div>
        </div>

        <div className="auth-divider">
          {step === "phone" ? "Sign in" : "Verify your number"}
        </div>

        {step === "phone" ? (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSendOtp(phone.replace(/\s+/g, ""));
            }}
          >
            <div className="auth-field">
              <label htmlFor="phone">Mobile number</label>
              <input
                id="phone"
                className="auth-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                autoFocus
                disabled={busy}
              />
              <span className="auth-field-hint">
                Include the country code. We'll text you a 6-digit code.
              </span>
            </div>
            <button
              className="auth-btn"
              type="submit"
              disabled={busy || phone.replace(/\s+/g, "").length < 8}
            >
              {busy ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              onVerifyOtp(otp.trim());
            }}
          >
            <div className="auth-field">
              <label htmlFor="otp">6-digit code</label>
              <input
                id="otp"
                className="auth-input auth-input-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="------"
                autoFocus
                disabled={busy}
              />
              <span className="auth-field-hint">Sent to {phone.trim()}</span>
            </div>
            <button
              className="auth-btn"
              type="submit"
              disabled={busy || otp.length !== 6}
            >
              {busy ? "Verifying..." : "Verify & continue"}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-foot">
          By continuing you agree this is for educational use, not a substitute for a doctor.
        </p>

        {/* invisible reCAPTCHA mounts here */}
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}
