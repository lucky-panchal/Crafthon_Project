import { useState, useEffect } from "react";
import useAuthStore from "../store/useAuthStore";

const API = "http://localhost:8000";

export default function AuthModal({ mode, onClose }) {
  const [tab,      setTab]     = useState(mode);
  const [name,     setName]    = useState("");
  const [email,    setEmail]   = useState("");
  const [password, setPass]    = useState("");
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const login = useAuthStore((s) => s.login);

  // Handle OAuth redirect — token comes back in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");
    const uname  = params.get("name");
    const uemail = params.get("email");
    if (token) {
      login(token, { name: uname, email: uemail });
      window.history.replaceState({}, "", window.location.pathname);
      onClose({ access_token: token });
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body     = tab === "login" ? { email, password } : { name, email, password };
      const res      = await fetch(`${API}${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Auth failed");
      login(data.access_token, data.user);
      onClose(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOAuth(provider) {
    window.location.href = `${API}/api/auth/${provider}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background:    "rgba(10, 18, 12, 0.92)",
          backdropFilter:"blur(20px)",
          border:        "1px solid rgba(74, 94, 42, 0.5)",
          boxShadow:     "0 0 60px rgba(0,0,0,0.7), 0 0 20px rgba(74,94,42,0.1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Logo + title */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_16px_#3b82f660]">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">RAKSHA</p>
            <p className="text-[9px] text-[#556b2f] tracking-widest">SECURE ACCESS</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 p-1 rounded-lg bg-[#1e2d0e]/60">
            {["login", "signup"].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === t
                    ? "bg-[#3a4f1a] text-[#a3c45a] shadow"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none transition-colors">✕</button>
        </div>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleOAuth("google")}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl border border-[#2a3a1a]/60 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth("github")}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl border border-[#2a3a1a]/60 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all"
          >
            <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-[#2a3a1a]/60" />
          <span className="text-[10px] text-gray-600 font-mono">OR</span>
          <div className="flex-1 h-px bg-[#2a3a1a]/60" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "signup" && (
            <input
              type="text" placeholder="Full Name" value={name}
              onChange={e => setName(e.target.value)} required
              className="w-full bg-[#0d1a06]/60 border border-[#2a3a1a]/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#556b2f] transition-colors"
            />
          )}
          <input
            type="email" placeholder="Email address" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="w-full bg-[#0d1a06]/60 border border-[#2a3a1a]/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#556b2f] transition-colors"
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPass(e.target.value)} required
            className="w-full bg-[#0d1a06]/60 border border-[#2a3a1a]/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#556b2f] transition-colors"
          />
          {error && (
            <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
              ⚠ {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#3a4f1a] hover:bg-[#4a5e2a] text-[#a3c45a] text-xs font-bold transition-all disabled:opacity-50 border border-[#556b2f]/50 shadow-[0_0_12px_#3a4f1a40]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-[#a3c45a] border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : tab === "login" ? "Login to DefComm" : "Create Account"}
          </button>
        </form>

        <p className="text-[9px] text-gray-700 text-center">
          Protected by JWT · OAuth 2.0 · RAKSHA v1.0
        </p>
      </div>
    </div>
  );
}
