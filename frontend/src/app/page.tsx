"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { decodeTokenPayload, getDashboardPath } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("sentraai_token");
    if (token) {
      const payload = decodeTokenPayload(token);
      router.replace(payload ? getDashboardPath(payload.role) : "/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-panel-glow px-10 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2 text-gradient-purple">SentraAI</h1>
        <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}
