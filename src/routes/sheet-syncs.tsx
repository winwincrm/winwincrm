import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SheetSyncManager } from "@/components/SheetSyncManager";

export const Route = createFileRoute("/sheet-syncs")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Google Sheets Sync — YellowSkies CRM" },
      { name: "description", content: "Manage linked Google Sheets, review sync history and remove sheet links without deleting imported leads." },
      { property: "og:title", content: "Google Sheets Sync — YellowSkies CRM" },
      { property: "og:description", content: "Linked Google Sheets, detailed change history and safe link removal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Page() {
  return (
    <ProtectedRoute roles={["admin", "superiormanager", "manager"]}>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Google Sheets</h1>
          <p className="text-sm text-muted-foreground">
            Every linked sheet, its full change history, and safe link removal — imported leads are always kept.
          </p>
        </div>
        <SheetSyncManager />
      </div>
    </ProtectedRoute>
  );
}
