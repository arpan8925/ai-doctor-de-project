import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut as fbSignOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

export type AuthStep = "phone" | "otp";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<AuthStep>("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const result = await signInWithPhoneNumber(auth, phone, recaptchaRef.current);
      confirmationRef.current = result;
      setStep("otp");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send OTP");
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyOtp = useCallback(async (otp: string) => {
    if (!confirmationRef.current) return;
    setBusy(true);
    setError(null);
    try {
      await confirmationRef.current.confirm(otp);
    } catch {
      setError("Invalid OTP — please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  const signOut = useCallback(() => {
    fbSignOut(auth);
  }, []);

  return { user, loading, step, error, busy, sendOtp, verifyOtp, getToken, signOut };
}
