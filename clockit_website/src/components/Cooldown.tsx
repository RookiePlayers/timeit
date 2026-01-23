"use client";

import { useEffect, useState } from "react";

type Props = {
  remainingMs: number;
};

export default function Cooldown({ remainingMs }: Props) {
  const [ms, setMs] = useState(remainingMs);

  useEffect(() => {
    setMs(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    if (ms <= 0) {return;}
    const id = setInterval(() => {
      setMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [ms]);

  if (ms <= 0) {
    return <span className="text-xs text-gray-500">Ready to refresh</span>;
  }

  const minutes = Math.floor(ms / 60000);
  return <span className="text-xs text-gray-500">Available in {minutes}m</span>;
}
