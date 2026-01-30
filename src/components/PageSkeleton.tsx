import { Skeleton } from '@/components/ui/skeleton';

/**
 * Full-page skeleton that mirrors the DashboardLayout structure.
 * Used as the top-level Suspense fallback in App.tsx so users see
 * the familiar sidebar + header chrome while the app loads,
 * instead of a bare "Loading..." text.
 */
const PageSkeleton = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton - matches DashboardLayout sticky header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background">
        <div className="flex h-16">
          {/* Left section - logo area (desktop) */}
          <div className="hidden lg:flex items-center w-64 px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>

          {/* Right section */}
          <div className="flex-1 flex items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Mobile logo placeholder */}
            <div className="flex items-center gap-3 lg:hidden">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-5 w-24" />
            </div>

            {/* Desktop org name placeholder */}
            <div className="hidden lg:flex items-center gap-3">
              <Skeleton className="h-4 w-32" />
            </div>

            {/* Right-side action buttons placeholder */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/30">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="hidden sm:block h-8 w-20 rounded" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar skeleton - matches DashboardLayout desktop sidebar */}
        <aside className="hidden lg:flex w-64 flex-col fixed left-0 top-16 bottom-0 border-r border-border/50 bg-card/50">
          <nav className="flex-1 p-4 space-y-2">
            {/* Navigation item skeletons (2 items before accordions) */}
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />

            {/* Accordion section skeletons (Sites + Units) */}
            <div className="pt-1">
              <Skeleton className="h-10 w-full rounded-md" />
              <div className="ml-4 mt-1 space-y-1">
                <Skeleton className="h-8 w-3/4 rounded-md" />
                <Skeleton className="h-8 w-2/3 rounded-md" />
              </div>
            </div>
            <div className="pt-1">
              <Skeleton className="h-10 w-full rounded-md" />
              <div className="ml-4 mt-1 space-y-1">
                <Skeleton className="h-8 w-3/4 rounded-md" />
                <Skeleton className="h-8 w-2/3 rounded-md" />
              </div>
            </div>

            {/* Navigation items after accordions (4 items) */}
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </nav>
        </aside>

        {/* Main content skeleton - matches DashboardLayout main area */}
        <main className="flex-1 lg:ml-64 min-w-0 overflow-x-hidden">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            {/* Page title skeleton */}
            <Skeleton className="h-7 w-48 mb-6" />

            {/* Content card skeletons */}
            <div className="space-y-6">
              {/* Primary content block */}
              <div className="rounded-lg border border-border/50 p-6 space-y-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>

              {/* Grid of smaller cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border/50 p-4 space-y-3">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PageSkeleton;
