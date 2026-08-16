import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SheetSyncManager } from "@/components/SheetSyncManager";

export const Route = createFileRoute("/sheet-syncs")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Google Sheets Sync — YellowSkies CRM" },
      {
        name: "description",
        content:
          "Manage office-assigned Google Sheets, review sync history, and safely remove links.",
      },
      { property: "og:title", content: "Google Sheets Sync — YellowSkies CRM" },
      {
        property: "og:description",
        content:
          "Office-scoped Google Sheet links, detailed change history, and safe link removal.",
      },
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
            Sheet links are assigned to an office. Managers see only their office; administrators
            see every office.
          </p>
        </div>
        <SheetSyncManager />
      </div>
    </ProtectedRoute>
  );
}
