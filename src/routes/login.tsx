import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hostname, setHostname] = useState<string>("");
  useEffect(() => { setHostname(window.location.hostname); }, []);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      toast.error(t("auth.invalid_credentials"));
      return;
    }
    // Tenant gate runs in ProtectedRoute once profile/role are loaded — avoids RLS race here.
    window.location.replace("/");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 bg-background relative overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%), radial-gradient(ellipse at bottom right, color-mix(in oklab, var(--primary) 12%, transparent), transparent 55%)",
      }}
    >
      <div className="w-full max-w-sm relative">
        <div className="mb-8 text-center flex flex-col items-center">
          <img
            src={logo}
            alt="YellowSkies"
            className="h-32 w-auto object-contain mb-3"
          />
          <div className="text-3xl font-semibold tracking-tight">
            <><span className="text-primary">Yellow</span>Skies</>
          </div>
          <p className="text-xs text-muted-foreground mt-2 tracking-widest uppercase min-h-[1em]">
            {hostname}
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="bg-card border rounded-lg p-6 space-y-4"
          style={{
            boxShadow:
              "0 20px 50px -20px color-mix(in oklab, var(--primary) 35%, transparent), 0 8px 20px -10px color-mix(in oklab, var(--primary) 20%, transparent)",
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {t("auth.sign_in")}
          </Button>
        </form>
      </div>
    </div>
  );
}
