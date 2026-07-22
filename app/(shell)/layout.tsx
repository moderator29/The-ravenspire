import { SideNav } from "@/components/shell/side-nav";
import { BottomNav } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/top-bar";
import { RightRail } from "@/components/shell/right-rail";
import { ShellGate } from "@/components/shell/shell-gate";
import { FloatingCompose } from "@/components/shell/floating-compose";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ShellGate>
      <div className="realm-bg mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <div className="sticky top-0 hidden h-screen w-[272px] shrink-0 border-r border-steel-line/70 lg:block">
          <SideNav />
        </div>
        <TopBar />
        <main className="min-w-0 flex-1 pb-24 lg:pb-8">{children}</main>
        <RightRail />
        <BottomNav />

        <FloatingCompose />
      </div>
    </ShellGate>
  );
}
