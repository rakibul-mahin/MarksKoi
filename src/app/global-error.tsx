"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f5f7f6", color: "#1c2333" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>MarksKoi is having trouble</h1>
          <p style={{ color: "#556070" }}>Please try again in a moment. Your data is safe.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, border: 0, background: "#155e4b", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
