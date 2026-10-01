import {
  Building2,
  CalendarClock,
  ClipboardList,
  Database,
  Globe,
  Image,
  LayoutDashboard,
  Mail,
  Palette,
  PlayCircle,
  Settings2,
  Share2,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/add-business', label: 'Add Business', icon: Building2 },
  { to: '/posts', label: 'Posts', icon: ClipboardList },
  { to: '/daily-job', label: 'Run Daily Job', icon: PlayCircle },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
  { to: '/social', label: 'Social Posting', icon: Share2 },
  { to: '/ghl-status', label: 'GHL Status', icon: Settings2 },
  { to: '/media', label: 'Media Library', icon: Image },
  { to: '/approval', label: 'Approval Queue', icon: CalendarClock },
];

const phase4NavItems = [
  { to: '/designs', label: 'Designs', icon: Palette },
  { to: '/sites', label: 'Generated Sites', icon: Globe },
  { to: '/industry-schemas', label: 'Industry Schemas', icon: Database },
  { to: '/contacts', label: 'Contact Submissions', icon: Mail },
  { to: '/form-test', label: 'Generate Site (Admin)', icon: Send },
];

function navClass(isActive: boolean) {
  return cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
  );
}

interface AppSidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function AppSidebar({ onNavigate, className }: AppSidebarProps) {
  const { user, signOut } = useAuth();
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="border-b border-slate-800/80 px-5 py-5">
        <img
          src="/logo.png?v=7"
          alt="Peakwa"
          className="logo-on-dark h-14 w-auto max-w-[220px] object-contain"
        />
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
      <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
        <p className="min-w-0 truncate text-xs text-slate-500">
          Signed in as <span className="font-medium text-slate-300">{user?.name}</span>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

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
