import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/change-password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
  return <Navigate to="/dashboard" />;
}
