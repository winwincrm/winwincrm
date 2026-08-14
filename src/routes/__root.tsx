import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { isAllowedHost } from "@/lib/subdomain-tenancy";
import { IpGate } from "@/components/IpGate";
import "@/i18n";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function UnknownDomainScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          This domain is not configured for the CRM.
        </p>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "YellowSkies CRM" },
      { name: "description", content: "YellowSkies — a bright, modern CRM." },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { property: "og:title", content: "YellowSkies CRM" },
      { property: "og:description", content: "YellowSkies — a bright, modern CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "YellowSkies CRM" },
      { name: "twitter:description", content: "YellowSkies — a bright, modern CRM." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b5518bf-ecdf-4ce3-8e39-1b5d643aa40b/id-preview-09d655ff--4358ce6a-46b7-40e5-b56d-755dc8eeed6e.lovable.app-1784563196633.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b5518bf-ecdf-4ce3-8e39-1b5d643aa40b/id-preview-09d655ff--4358ce6a-46b7-40e5-b56d-755dc8eeed6e.lovable.app-1784563196633.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

const themeInitScript = `(function(){try{if(typeof localStorage!=="undefined"&&localStorage.getItem("dark-theme")==="1"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [hostOk, setHostOk] = useState<boolean | null>(null);
  useEffect(() => {
    setHostOk(isAllowedHost());
  }, []);
  if (hostOk === false) return <UnknownDomainScreen />;
  return (
    <QueryClientProvider client={queryClient}>
      <IpGate>
        <AuthProvider>
          <Outlet />
          <Toaster />
        </AuthProvider>
      </IpGate>
    </QueryClientProvider>
  );
}
