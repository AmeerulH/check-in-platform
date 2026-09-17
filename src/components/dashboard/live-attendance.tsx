"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LiveAttendanceProps = {
  children: ReactNode;
  eventDayId?: string;
};

export function LiveAttendance({ children, eventDayId }: LiveAttendanceProps) {
  const router = useRouter();

  useEffect(() => {
    if (!eventDayId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`attendance-${eventDayId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scan_events",
          filter: `event_day_id=eq.${eventDayId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventDayId, router]);

  return children;
}
