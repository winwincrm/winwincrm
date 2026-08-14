import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LeadDetailInline } from "@/components/LeadDetailInline";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/leads/$id")({
  head: () => ({
    meta: [
      { title: "Lead Detail | YellowSkies CRM" },
      { name: "description", content: "Review lead details, comments, activity, status, and assignments in YellowSkies CRM." },
      { property: "og:title", content: "Lead Detail | YellowSkies CRM" },
      { property: "og:description", content: "Review lead details, comments, activity, status, and assignments in YellowSkies CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  return <ProtectedRoute><LeadDetailContent /></ProtectedRoute>;
}

function LeadDetailContent() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<{ user_id: string; full_name: string | null; office_id: string | null }[]>([]);

  useEffect(() => {
    let q = supabase.from("profiles").select("user_id, full_name, office_id");
    if ((role === "manager" || role === "superiormanager") && profile?.office_id) {
      q = q.eq("office_id", profile.office_id);
    }
    void q.then(({ data }) => setAgents(data ?? []));
  }, [role, profile?.office_id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/leads" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}
        </Button>
      </div>
      <LeadDetailInline
        leadId={id}
        agents={agents}
        onClose={() => navigate({ to: "/leads" })}
      />
    </div>
  );
}
