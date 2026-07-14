"use client";

import { useEffect, useState } from "react";

export function BusyLabel({ label }: { label: string }) {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const interval = window.setInterval(
      () => setDots((current) => (current % 3) + 1),
      350,
    );
    return () => window.clearInterval(interval);
  }, []);
  return `${label}${".".repeat(dots)}`;
}
