import {
  Building2,
  CalendarClock,
  ClipboardList,
  Database,
  Globe,
  Image,
  Layout,
  LayoutDashboard,
  Mail,
  Palette,
  Send,
  PlayCircle,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/add-business', label: 'Add Business', icon: Building2 },
  { to: '/posts', label: 'Posts', icon: ClipboardList },
  { to: '/daily-job', label: 'Run Daily Job', icon: PlayCircle },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
  { to: '/ghl-status', label: 'GHL Status', icon: Settings2 },
  { to: '/media', label: 'Media Library', icon: Image },
  { to: '/approval', label: 'Approval Queue', icon: CalendarClock },
];

const phase4NavItems = [
  { to: '/templates', label: 'Templates', icon: Layout },
  { to: '/designs', label: 'Designs', icon: Palette },
  { to: '/sites', label: 'Generated Sites', icon: Globe },
  { to: '/industry-schemas', label: 'Industry Schemas', icon: Database },
  { to: '/contacts', label: 'Contact Submissions', icon: Mail },
  { to: '/form-test', label: 'Form Submission (Test)', icon: Send },
];

function navClass(isActive: boolean) {
  return cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-emerald-500/15 text-emerald-400'
      : 'text-slate-400 hover:bg-slate-800 hover:text-white',
  );
}

interface AppSidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function AppSidebar({ onNavigate, className }: AppSidebarProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            PW
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Peakwa</p>
            <p className="text-xs text-slate-500">GBP Automation</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => navClass(isActive)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}

        <p className="mb-2 mt-5 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          Website Builder
        </p>
        {phase4NavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => navClass(isActive)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* <div className="border-t border-slate-800 px-4 py-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Locations
        </p>
        <div className="max-h-40 space-y-2 overflow-y-auto">
          {loading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : (
            locations.map((loc) => (
              <div key={loc.id} className="rounded-md bg-slate-800/50 px-3 py-2">
                <p className="truncate text-xs font-medium text-slate-200">
                  {loc.businessName}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                  {loc.id}
                </p>
              </div>
            ))
          )}
        </div>
      </div> */}
    </div>
  );
}
