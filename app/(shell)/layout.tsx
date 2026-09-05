import { Suspense } from "react";
import { SideNav } from "@/components/shell/side-nav";
import { BottomNav } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/top-bar";
import { RightRail } from "@/components/shell/right-rail";
import { ShellGate } from "@/components/shell/shell-gate";
import { FloatingCompose } from "@/components/shell/floating-compose";
import { ShellMain, ShellChrome } from "@/components/shell/shell-main";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { DossierProvider } from "@/components/social/user-dossier";
import { VisitorRibbon } from "@/components/share/visitor-ribbon";
import { ToastProvider } from "@/components/ui/toast";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ShellGate>
      {/* The realm's toast host, and it had been missing since the Muster
          shipped.
       *
       * `useToast` is not a soft dependency: it resolves Base UI's toast store
       * out of context and THROWS when no provider is above it. The only
       * ToastProvider in the product was the one inside the kitchen sink, so
       * every surface that raised a toast was a surface that took its own
       * segment down instead. The Muster made that fatal on the most visited
       * screen in the realm: the Ravenry's strip renders MusterCell as soon as
       * /api/realm/strip answers, and musterState never returns null, so the
       * Ravenry rendered correctly, waited for one fetch, and then handed the
       * shell error boundary a thrown render for every signed-in member.
       *
       * It sits here rather than in components/providers.tsx because a layout
       * wraps its own error.js, so the host survives the boundary it would
       * otherwise be replaced by, and toasts are a shell affordance: the
       * landing gate raises none. Above NotificationsProvider so a raven toast
       * and a realm toast are never fighting over mount order. */}
      <ToastProvider>
        <NotificationsProvider>
          <DossierProvider>
        <div className="realm-bg mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
          <div className="sticky top-0 hidden h-screen w-[272px] shrink-0 border-r border-steel-line/70 lg:block">
            <SideNav />
          </div>
          <ShellChrome>
            <TopBar />
          </ShellChrome>
          {/* The mobile dock floats and can carry a sub navigation strip above
              it, so it needs more clearance than the old fixed 64px bar. A
              full bleed surface gets neither the padding nor the chrome. */}
          <ShellMain>
            {/* Inside the main column rather than beside it: the shell is a
                flex ROW at lg, so a sibling here would become a third column
                on desktop. Renders nothing at all for a member. */}
            <VisitorRibbon />
            {children}
          </ShellMain>
          <ShellChrome>
            <RightRail />
          </ShellChrome>
          {/* The dock reads the query string to mark the current sub
              destination, and useSearchParams() opts a component out of static
              rendering. Without this boundary every statically rendered page in
              the shell fails to prerender at build time. */}
          <ShellChrome>
            <Suspense fallback={null}>
              <BottomNav />
            </Suspense>
          </ShellChrome>

          <FloatingCompose />
        </div>
          </DossierProvider>
        </NotificationsProvider>
      </ToastProvider>
    </ShellGate>
  );
}
