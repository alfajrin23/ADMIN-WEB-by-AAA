"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCurrentJakartaDate } from "@/lib/date";

type AttendanceDateBoundaryRefreshProps = {
  currentDate: string;
};

export function AttendanceDateBoundaryRefresh({
  currentDate,
}: AttendanceDateBoundaryRefreshProps) {
  const router = useRouter();
  const currentDateRef = useRef(currentDate);

  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextDate = getCurrentJakartaDate();
      if (nextDate === currentDateRef.current) {
        return;
      }

      currentDateRef.current = nextDate;
      router.refresh();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [router]);

  return null;
}
