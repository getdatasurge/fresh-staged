import DashboardLayout from "@/components/DashboardLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity"
import { useUserRole } from "@/hooks/useUserRole"
import {
  categoryConfig,
  getEventIcon,
  getEventLabel,
  inferCategory,
  inferSeverity,
  severityConfig,
  type EventCategory,
  type EventSeverity,
} from "@/lib/eventTypeMapper"
import { useTRPC } from "@/lib/trpc"
import { useQuery } from "@tanstack/react-query"
import { format, formatDistanceToNow } from "date-fns"
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"


interface EventLog {
  id: string;
  event_type: string;
  category: string | null;
  severity: string | null;
  title: string | null;
  recorded_at: string;
  organization_id: string;
  site_id: string | null;
  area_id: string | null;
  unit_id: string | null;
  actor_id: string | null;
  actor_type: string | null;
  event_data: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  // Joined data
  site?: { name: string } | null;
  area?: { name: string } | null;
  unit?: { name: string } | null;
  actor_profile?: { full_name: string | null; email: string } | null;
}

const EventHistory = () => {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { role, isLoading: roleLoading } = useUserRole();
  const { effectiveOrgId, isInitialized: identityInitialized } = useEffectiveIdentity();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const isAdmin = role === "owner" || role === "admin";

  const sitesQuery = useQuery(
    trpc.sites.list.queryOptions(
      { organizationId: effectiveOrgId! },
      { enabled: !!effectiveOrgId && identityInitialized }
    )
  );

  const eventsQuery = useQuery(
    trpc.audit.list.queryOptions(
      {
        organizationId: effectiveOrgId!,
        siteId: siteFilter !== "all" ? siteFilter : undefined,
        category: categoryFilter !== "all" ? (categoryFilter as any) : undefined,
        severity: severityFilter !== "all" ? (severityFilter as any) : undefined,
        page: page,
        limit: PAGE_SIZE,
      },
      {
        enabled: !!effectiveOrgId && identityInitialized,
        placeholderData: (previousData) => previousData
      }
    )
  );

  const isLoading = eventsQuery.isLoading || !identityInitialized;
  const events = eventsQuery.data || [];
  const hasMore = events.length === PAGE_SIZE; // Simplified for now

  const handleRefetch = () => {
    eventsQuery.refetch();
    setLastUpdated(new Date());
  };





  const toggleExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const buildContext = (event: any): string => {
    const parts: string[] = [];
    if (event.siteName) parts.push(event.siteName);
    if (event.areaName) parts.push(event.areaName);
    if (event.unitName) parts.push(event.unitName);
    return parts.join(" · ") || "—";
  };


  const getActorDisplay = (event: any): string => {
    if (event.actorType === "system") return "System";
    if (event.actorName) {
      return event.actorName;
    }
    return event.actorEmail || "System";
  };


  if (roleLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Event History</h1>
            <p className="text-sm text-muted-foreground">
              Complete audit timeline for your organization
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleRefetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {Object.entries(severityConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sitesQuery.data?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}

                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-320px)]">
              {isLoading && events.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No events found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Events will appear here as actions occur in your organization
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {events.map((event) => {
                    const isExpanded = expandedEvents.has(event.id);
                    const category = (event.category as EventCategory) || inferCategory(event.event_type);
                    const severity = (event.severity as EventSeverity) || inferSeverity(event.event_type);
                    const catConfig = categoryConfig[category] || categoryConfig.system;
                    const sevConfig = severityConfig[severity] || severityConfig.info;
                    const Icon = getEventIcon(event.event_type);
                    const label = event.title || getEventLabel(event.event_type);

                    return (
                      <Collapsible
                        key={event.id}
                        open={isExpanded}
                        onOpenChange={() => toggleExpanded(event.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="w-full p-4 text-left hover:bg-muted/30 transition-colors">
                            <div className="flex items-start gap-4">
                              {/* Icon */}
                              <div
                                className={`w-9 h-9 rounded-lg ${catConfig.bgColor} flex items-center justify-center flex-shrink-0`}
                              >
                                <Icon className={`w-4.5 h-4.5 ${catConfig.color}`} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-foreground">
                                    {label}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold bg-secondary/10 text-secondary-foreground">
                                    {catConfig.label}
                                  </span>
                                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold ${sevConfig.color} ${sevConfig.borderColor}`}>
                                    {sevConfig.label}
                                  </span>

                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {buildContext(event)}
                                </p>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 mt-1">
                                  <span>
                                    {format(new Date(event.recorded_at), "MMM d, yyyy h:mm:ss a")}
                                  </span>
                                  <span>•</span>
                                  <span>{getActorDisplay(event)}</span>
                                </div>
                              </div>

                              {/* Expand icon */}
                              <div className="flex-shrink-0">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-0 ml-[52px] space-y-3">
                            {/* Key-value details for all users */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Event ID:</span>
                                <span className="ml-2 font-mono text-foreground">
                                  {event.id.slice(0, 8)}...
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Type:</span>
                                <span className="ml-2 font-mono text-foreground">
                                  {event.event_type}
                                </span>
                              </div>
                              {event.ip_address && (
                                <div>
                                  <span className="text-muted-foreground">IP:</span>
                                  <span className="ml-2 font-mono text-foreground">
                                    {event.ip_address}
                                  </span>
                                </div>
                              )}
                              {event.unit_id && (
                                <div>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 text-xs text-accent"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/units/${event.unit_id}`);
                                    }}
                                  >
                                    Open Unit <ExternalLink className="w-3 h-3 ml-1" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Full JSON payload for admins only */}
                            {isAdmin && Object.keys(event.event_data).length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs text-muted-foreground mb-1">
                                  Event Data (Admin Only):
                                </p>
                                <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto font-mono">
                                  {JSON.stringify(event.event_data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* Key data summary for non-admins */}
                            {!isAdmin && Object.keys(event.event_data).length > 0 && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {Object.entries(event.event_data)
                                  .filter(
                                    ([key]) =>
                                      !key.includes("password") &&
                                      !key.includes("token") &&
                                      !key.includes("secret")
                                  )
                                  .slice(0, 6)
                                  .map(([key, value]) => (
                                    <div key={key}>
                                      <span className="text-muted-foreground capitalize">
                                        {key.replace(/_/g, " ")}:
                                      </span>
                                      <span className="ml-2 text-foreground">
                                        {typeof value === "object"
                                          ? JSON.stringify(value)
                                          : String(value)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}

                  {/* Load more */}
                  {hasMore && (
                    <div className="p-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPage((p) => p + 1);
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EventHistory;
