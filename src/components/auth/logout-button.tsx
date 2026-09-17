"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [message, setMessage] = useState("");

  async function logOut() {
    setIsLoggingOut(true);
    setMessage("");

    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) {
        setIsLoggingOut(false);
        setMessage("We could not sign you out. Please try again.");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
      setMessage("We could not sign you out. Please try again.");
    }
  }

  return (
    <div className="logout-control">
      <button disabled={isLoggingOut} onClick={() => void logOut()} type="button">
        {isLoggingOut ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <LogOut aria-hidden="true" size={16} />}
        {isLoggingOut ? "Signing out…" : "Sign out"}
      </button>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
