"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("sentraai_token");
    if (token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-panel px-8 py-6 text-center">
        <h1 className="text-2xl font-bold mb-2">SentraAI</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
