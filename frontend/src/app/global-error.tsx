"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen bg-[#0a0e1a] text-white antialiased flex items-center justify-center p-6">
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "0.75rem",
            padding: "2.5rem",
            textAlign: "center",
            maxWidth: "28rem",
          }}
        >
          <p
            style={{
              fontSize: "4rem",
              fontWeight: "bold",
              color: "rgba(255,255,255,0.3)",
              marginBottom: "1rem",
            }}
          >
            500
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Application Error
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "1.5rem" }}>
            A critical error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#2563eb",
              color: "white",
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
