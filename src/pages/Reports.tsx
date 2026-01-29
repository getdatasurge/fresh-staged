import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { useTRPC } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ComplianceReportCard } from "@/components/reports/ComplianceReportCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format as format_, subDays } from "date-fns";
import {
  Download,
  FileText,
  AlertTriangle,
  ClipboardList,
  CalendarIcon,
  Loader2,
  Filter,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@stackframe/react";
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity";

interface Site {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
  area: {
    name: string;
    site: {
      id: string;
      name: string;
    };
  };
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

const Reports = () => {
  const { toast } = useToast();
  const user = useUser();
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const trpc = useTRPC();
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Fetch sites via tRPC
  const sitesQuery = useQuery(
    trpc.sites.list.queryOptions(
      undefined,
      { enabled: isInitialized && !!effectiveOrgId }
    )
  );

  // Fetch units via tRPC
  const unitsQuery = useQuery(
    trpc.units.listByOrg.queryOptions(
      { organizationId: effectiveOrgId || "" },
      { enabled: isInitialized && !!effectiveOrgId }
    )
  );

  // Transform sites to expected format
  const sites = useMemo<Site[]>(() => {
    if (!sitesQuery.data) return [];
    return sitesQuery.data.map(s => ({
      id: s.id,
      name: s.name,
    }));
  }, [sitesQuery.data]);

  // Transform units to expected format with area/site hierarchy
  const units = useMemo<Unit[]>(() => {
    if (!unitsQuery.data) return [];
    return unitsQuery.data.map(u => ({
      id: u.id,
      name: u.name,
      area: {
        name: u.areaName || "",
        site: {
          id: u.siteId || "",
          name: u.siteName || "",
        },
      },
    }));
  }, [unitsQuery.data]);

  // Filter units by selected site
  const filteredUnits = useMemo(() => {
    if (selectedSite === "all") return units;
    return units.filter(u => u.area.site.id === selectedSite);
  }, [selectedSite, units]);

  const loading = sitesQuery.isLoading || unitsQuery.isLoading;

  // tRPC mutation for exporting reports
  const exportMutation = useMutation({
    ...trpc.reports.export.mutationOptions(),
    onSuccess: (data) => {
      // Download file
      const blob = new Blob([data.content], { type: data.contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Export complete",
        description: `Report downloaded successfully.`,
      });
    },
    onError: (err) => {
      console.error("Export error:", err);
      toast({
        title: "Export failed",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Reset unit selection when site changes
  useEffect(() => {
    setSelectedUnit("all");
  }, [selectedSite]);

  const handleExport = (reportType: "daily" | "exceptions" | "manual" | "compliance", format: "csv" | "pdf" = "csv") => {
    if (!dateRange.from || !dateRange.to) {
      toast({
        title: "Date range required",
        description: "Please select a start and end date.",
        variant: "destructive",
      });
      return;
    }

    // Ensure user is authenticated and has organization context
    if (!user || !effectiveOrgId) {
      toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
      window.location.href = "/auth";
      return;
    }

    // Use tRPC mutation for export
    exportMutation.mutate({
      organizationId: effectiveOrgId,
      startDate: format_(dateRange.from, "yyyy-MM-dd"),
      endDate: format_(dateRange.to, "yyyy-MM-dd"),
      reportType,
      format: format === "pdf" ? "html" : "csv",
      siteId: selectedSite !== "all" ? selectedSite : undefined,
      unitId: selectedUnit !== "all" ? selectedUnit : undefined,
    });
  };

  const reportTypes = [
    {
      id: "compliance",
      title: "Compliance Report",
      description: "Complete audit-ready report with all logs, exceptions, and corrective actions",
      icon: ShieldCheck,
      color: "text-safe",
    },
    {
      id: "daily",
      title: "Daily Temperature Logs",
      description: "All sensor readings and manual logs for the selected period",
      icon: FileText,
      color: "text-accent",
    },
    {
      id: "exceptions",
      title: "Exception Report",
      description: "Out-of-range readings and alerts requiring attention",
      icon: AlertTriangle,
      color: "text-alarm",
    },
    {
      id: "manual",
      title: "Manual Logs Only",
      description: "Staff-entered temperature readings with notes",
      icon: ClipboardList,
      color: "text-primary",
    },
  ];

  return (
    <DashboardLayout title="Reports">
      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Site Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Site</label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Unit</label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="All Units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Units</SelectItem>
                  {filteredUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name} ({unit.area.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format_(dateRange.from, "MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange.to && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format_(dateRange.to, "MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Active Filters */}
          <div className="flex flex-wrap gap-2 mt-4">
            {selectedSite !== "all" && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="w-3 h-3" />
                {sites.find(s => s.id === selectedSite)?.name}
              </Badge>
            )}
            {selectedUnit !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Unit: {filteredUnits.find(u => u.id === selectedUnit)?.name}
              </Badge>
            )}
            {dateRange.from && dateRange.to && (
              <Badge variant="outline">
                {format_(dateRange.from, "MMM d")} - {format_(dateRange.to, "MMM d, yyyy")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Types */}
      <Tabs defaultValue="compliance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="compliance" className="text-xs sm:text-sm">
            <ShieldCheck className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Compliance</span>
            <span className="sm:hidden">Comp.</span>
          </TabsTrigger>
          <TabsTrigger value="daily" className="text-xs sm:text-sm">
            <FileText className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Daily Logs</span>
            <span className="sm:hidden">Daily</span>
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="text-xs sm:text-sm">
            <AlertTriangle className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Exceptions</span>
            <span className="sm:hidden">Except.</span>
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-xs sm:text-sm">
            <ClipboardList className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Manual Logs</span>
            <span className="sm:hidden">Manual</span>
          </TabsTrigger>
        </TabsList>

        {reportTypes.map((report) => (
          <TabsContent key={report.id} value={report.id}>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-muted", report.color)}>
                      <report.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle>{report.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {report.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {selectedSite !== "all" || selectedUnit !== "all" ? (
                      <span>
                        Filtered report for{" "}
                        {selectedUnit !== "all" 
                          ? `unit: ${filteredUnits.find(u => u.id === selectedUnit)?.name}`
                          : `site: ${sites.find(s => s.id === selectedSite)?.name}`
                        }
                      </span>
                    ) : (
                      <span>All sites and units included</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleExport(report.id as "daily" | "exceptions" | "manual" | "compliance", "csv")}
                      disabled={exportMutation.isPending || !dateRange.from || !dateRange.to}
                      variant="outline"
                    >
                      {exportMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          CSV
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleExport(report.id as "daily" | "exceptions" | "manual" | "compliance", "pdf")}
                      disabled={exportMutation.isPending || !dateRange.from || !dateRange.to}
                    >
                      {exportMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4 mr-2" />
                          PDF
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Quick Export Cards for Mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {reportTypes.map((report) => (
          <Card key={report.id} className="sm:hidden">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <report.icon className={cn("w-5 h-5", report.color)} />
                  <span className="font-medium text-sm">{report.title}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExport(report.id as "daily" | "exceptions" | "manual" | "compliance")}
                  disabled={exportMutation.isPending}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
