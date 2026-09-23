import { useState } from "react";
import { signInWithPassword, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  EyeOff,
  ArrowRight,
  Users,
  Calendar,
  Dumbbell,
  CreditCard,
  Phone,
  Lock,
  Ban,
  Wallet,
  LogOut,
} from "lucide-react";

interface LoginPageProps {
  onLogin: () => void;
}

interface BlockedInfo {
  vendorName: string;
  businessName: string | null;
  phone: string;
  usedCredits: number;
  totalCredits: number;
}

const features = [
  { icon: Users, label: "Member\nManagement" },
  { icon: Calendar, label: "Attendance\nTracking" },
  { icon: Dumbbell, label: "Workout\nPlans" },
  { icon: CreditCard, label: "Payments\n& Reports" },
];

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!/^\d{10}$/.test(phone)) {
      setError("Phone number must be exactly 10 digits");
      setLoading(false);
      return;
    }

    const fakeEmail = `${phone}@gmail.com`;

    const { error: signInError } = await signInWithPassword({
      email: fakeEmail,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message || "Sign in failed");
      return;
    }

    // Sign-in succeeded — check if this vendor's account is blocked.
    // The admin (UID check client-side) is never blocked.
    try {
      const res = await fetch(`/api/vendor-accounts/status/${phone}`, {
        credentials: "include",
      });
      if (res.ok) {
        const status = await res.json();
        if (status?.blocked) {
          // Blocked vendor: sign out immediately and show pay & unlock screen
          await signOut();
          setBlockedInfo({
            vendorName: status.vendorName,
            businessName: status.businessName,
            phone: status.phone,
            usedCredits: status.usedCredits,
            totalCredits: status.totalCredits,
          });
          setLoading(false);
          return;
        }
      }
      // 404 (admin/no account) or not blocked → let them in
    } catch {
      // status check failed → don't block login on infrastructure error
    }

    setLoading(false);
    onLogin();
  };

  // ══════════════════════════════════════════════════════════════
  // BLOCKED SCREEN — vendor consumed all paid + credit days
  // ══════════════════════════════════════════════════════════════
  if (blockedInfo) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <Ban className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Account Blocked</h1>
          <p className="mt-2 text-sm text-gray-500">
            {blockedInfo.businessName
              ? `${blockedInfo.businessName} — ${blockedInfo.vendorName}`
              : blockedInfo.vendorName}
          </p>

          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 p-4">
            <p className="text-sm font-semibold text-red-700">
              You have used all your credit days
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge className="bg-red-600 text-white hover:bg-red-600 border border-red-700">
                0/{blockedInfo.totalCredits} days
              </Badge>
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200">
                {blockedInfo.usedCredits} days outstanding
              </Badge>
            </div>
            <p className="mt-3 text-sm text-red-600">
              Please pay your outstanding days to unlock your account.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button
              className="h-11 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                setBlockedInfo(null);
                setPassword("");
              }}
              data-testid="button-back-to-login"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pay &amp; Unlock — Contact Admin
            </Button>
            <Button
              variant="ghost"
              onClick={() => setBlockedInfo(null)}
              data-testid="button-try-again"
            >
              Back to Login
            </Button>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Once the admin updates your account, you can sign in again with the same
            phone number and password.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full">
      {/* ═══════════════════════════════════════════════
          LEFT PANEL — 50% Gym Image + Content
         ═══════════════════════════════════════════════ */}
      <div className="relative hidden lg:flex w-[60%] flex-col bg-[#0d0d0d]">
        {/* Background image — full cover */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80')",
          }}
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Content — flex column, spaced evenly */}
        <div className="relative z-10 flex flex-col h-full px-10 py-8">
          {/* ── Top: Logo ── */}
          <header className="flex items-center gap-2.5">
            <Dumbbell className="h-6 w-6 text-red-500" />
            <span className="text-2xl font-bold text-white">
              Gym <span className="text-red-500">Management</span> System
            </span>
            <span className="ml-3 text-[10px] tracking-[0.2em] text-white/50 uppercase">
              Manage | Track | Grow
            </span>
          </header>

          {/* ── Middle: Headline + Features ── */}
          <main className="flex-1 flex flex-col justify-center max-w-lg">
            <h1 className="text-5xl font-extrabold leading-[1.08] text-white">
              Your Gym,
              <br />
              <span className="text-red-500">Simplified</span>
            </h1>
            <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-sm">
              Manage members, trainers, workouts, payments and more — all in
              one place.
            </p>

            {/* Feature cards — equal width row */}
            <div className="mt-8 grid grid-cols-4 gap-3">
              {features.map((f) => (
                <div
                  key={f.label}
                  className="flex flex-col items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-5 text-center"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-500/15">
                    <f.icon className="h-5 w-5 text-red-400" />
                  </div>
                  <span className="text-[11px] font-medium text-white/80 whitespace-pre-line leading-tight">
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </main>

          {/* ── Bottom: Motivational text ── */}
          <footer>
            <div className="h-0.5 w-8 bg-red-500 mb-2.5" />
            <p className="text-[10px] tracking-[0.2em] text-white/60 uppercase font-medium leading-relaxed">
              Stronger People
              <br />
              Brighter Tomorrow
            </p>
            <p className="mt-4 text-[10px] text-white/50">
              &copy; 2026 Gym Management System. All rights reserved.
            </p>
          </footer>
        </div>

        {/* Wall text — subtle overlay */}
        <div className="absolute top-32 right-20 z-10 pointer-events-none select-none">
          <p className="text-[28px] font-black text-white/[0.08] leading-[1.15] text-right">
            A
            <br />
            HEALTHIER
            <br />
            <span className="text-red-500/15">YOU</span>
            <br />
            A HAPPIER
            <br />
            TOMORROW
          </p>
        </div>
      </div>



      {/* ═══════════════════════════════════════════════
          RIGHT PANEL — 50% White + Centered Login
         ═══════════════════════════════════════════════ */}
      <div className="relative flex w-full lg:w-[40%] flex-col bg-white overflow-hidden">
        {/* Subtle decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-red-50 rounded-full blur-3xl opacity-40 translate-y-1/3 -translate-x-1/4 pointer-events-none" />
        <div className="absolute top-1/2 right-10 w-40 h-40 bg-red-50/50 rounded-full blur-2xl opacity-30 pointer-events-none" />

        {/* Top-right tagline */}
        <div className="absolute top-7 right-8 text-right hidden sm:block">
          <p className="text-[10px] tracking-[0.3em] text-gray-900 uppercase font-semibold">
            Fit Today
          </p>
          <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            For a Better Tomorrow
          </p>
          <div className="h-0.5 w-5 bg-red-500 ml-auto mt-1" />
        </div>

        {/* Centered login card */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8">
          <div className="w-full max-w-[440px] rounded-2xl border border-gray-200 px-6 sm:px-10 py-8 sm:py-12 shadow-sm">
            {/* Dumbbell icon */}
            <div className="mb-5 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <Dumbbell className="h-7 w-7 text-red-500" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-center text-[22px] font-bold text-gray-900">
              Gym <span className="text-red-500">Management</span> System
            </h2>
            <p className="mt-1 text-center text-[13px] text-gray-400">
              Sign in to access your dashboard
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {error && (
                <p className="rounded-lg bg-red-50 p-2.5 text-center text-sm text-red-600 border border-red-100">
                  {error}
                </p>
              )}

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-gray-700">
                  Phone Number
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={phone}
                    maxLength={10}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setError("");
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50/60 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-500/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-gray-700">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50/60 pl-10 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Sign In Button — same width as inputs */}
              <div className="pt-2">
                <Button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-all shadow-md shadow-red-600/15"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Please wait...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Sign In <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>


      </div>
    </div>
  );
}
