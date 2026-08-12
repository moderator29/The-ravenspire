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

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ShellGate>
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
          <ShellMain>{children}</ShellMain>
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
    </ShellGate>
  );
}
