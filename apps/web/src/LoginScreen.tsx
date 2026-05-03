import { useRef, useState } from "react";
import type { AuthStep } from "./useAuth";

interface Props {
  step: AuthStep;
  busy: boolean;
  error: string | null;
  onSendOtp: (phone: string) => void;
  onVerifyOtp: (otp: string) => void;
}

export function LoginScreen({ step, busy, error, onSendOtp, onVerifyOtp }: Props) {
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="12" fill="#3b82f6" />
            <path d="M20 8v24M8 20h24" stroke="white" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>AI Doctor</span>
        </div>

        <p className="login-subtitle">
          {step === "phone"
            ? "Enter your mobile number to continue"
            : "Enter the 6-digit OTP sent to your phone"}
        </p>

        {step === "phone" ? (
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSendOtp(phone.trim());
            }}
          >
            <input
              ref={inputRef}
              className="login-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoFocus
              disabled={busy}
            />
            <button className="login-btn" type="submit" disabled={busy || phone.length < 8}>
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              onVerifyOtp(otp.trim());
            }}
          >
            <input
              className="login-input login-input-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
              disabled={busy}
            />
            <button className="login-btn" type="submit" disabled={busy || otp.length !== 6}>
              {busy ? "Verifying…" : "Verify OTP"}
            </button>
          </form>
        )}

        {error && <p className="login-error">{error}</p>}

        {/* invisible reCAPTCHA mounts here */}
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}
