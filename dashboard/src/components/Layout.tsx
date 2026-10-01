import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

export function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="relative flex min-h-full bg-slate-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 0% 0%, rgb(20 184 166 / 0.07), transparent 50%), radial-gradient(ellipse 50% 35% at 100% 0%, rgb(20 184 166 / 0.04), transparent 45%)',
        }}
      />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-800/80 bg-slate-900/95 backdrop-blur-sm lg:block">
        <AppSidebar className="h-full" />
      </aside>

      <div className="relative z-10 flex min-h-screen w-full flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur supports-[backdrop-filter]:bg-slate-950/75">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="gap-0 p-0">
                <AppSidebar
                  className="h-full"
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="inline-flex max-w-full rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 sm:px-4 sm:text-sm">
                <span className="truncate">Peakwa</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
