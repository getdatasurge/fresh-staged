import DashboardLayout from "@/components/DashboardLayout"
import { HierarchyBreadcrumb } from "@/components/HierarchyBreadcrumb"
import { LayoutHeaderDropdown } from "@/components/LayoutHeaderDropdown"
import { SiteComplianceSettings } from "@/components/site/SiteComplianceSettings"
import { SiteGatewaysCard } from "@/components/site/SiteGatewaysCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EntityDashboard } from "@/features/dashboard-layout"
import { useToast } from "@/hooks/use-toast"
import { useOrgAlertRules, useSiteAlertRules } from "@/hooks/useAlertRules"
import { useEntityDashboardUrl } from "@/hooks/useEntityDashboardUrl"
import { usePermissions } from "@/hooks/useUserRole"
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity"
import { useUser } from "@stackframe/react"
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Download,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Settings,
  Thermometer,
  Trash2
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

interface Area {
  id: string;
  name: string;
  description: string | null;
  unitsCount: number;
}

interface SiteData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  timezone: string;
  compliance_mode: string;
  manual_log_cadence_seconds: number;
  corrective_action_required: boolean;
  organization_id: string;
  latitude: number | null;
  longitude: number | null;
}

import { useTRPC, useTRPCClient } from "@/lib/trpc"

const SiteDetail = () => {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useUser();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const { effectiveOrgId, isInitialized: identityInitialized } = useEffectiveIdentity();
  const { layoutKey } = useEntityDashboardUrl();
  const { canDeleteEntities, isLoading: permissionsLoading } = usePermissions();

  const siteQuery = useQuery(
    trpc.sites.get.queryOptions(
      { siteId: siteId!, organizationId: effectiveOrgId! },
      { enabled: !!siteId && !!effectiveOrgId && identityInitialized }
    )
  );

  const areasQuery = useQuery(
    trpc.areas.listWithUnitCount.queryOptions(
      { siteId: siteId!, organizationId: effectiveOrgId! },
      { enabled: !!siteId && !!effectiveOrgId && identityInitialized }
    )
  );

  const siblingSitesQuery = useQuery(
    trpc.sites.list.queryOptions(
      { organizationId: effectiveOrgId! },
      { enabled: !!effectiveOrgId && identityInitialized }
    )
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [editFormData, setEditFormData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);

  const { data: siteRules, refetch: refetchSiteRules } = useSiteAlertRules(siteId || null);
  const { data: orgRules } = useOrgAlertRules(effectiveOrgId);

  const isLoading = siteQuery.isLoading || areasQuery.isLoading || !identityInitialized;

  const site = useMemo(() => {
    if (!siteQuery.data) return null;
    return {
      ...siteQuery.data,
      organization_id: siteQuery.data.organizationId,
      address: siteQuery.data.address || "",
      city: siteQuery.data.city || "",
      state: siteQuery.data.state || "",
      postal_code: siteQuery.data.postalCode || "",
      compliance_mode: siteQuery.data.complianceMode || "fda_food_code",
      manual_log_cadence_seconds: siteQuery.data.manualLogCadenceSeconds || 14400,
      corrective_action_required: siteQuery.data.correctiveActionRequired ?? true,
      latitude: siteQuery.data.latitude ? parseFloat(siteQuery.data.latitude) : null,
      longitude: siteQuery.data.longitude ? parseFloat(siteQuery.data.longitude) : null,
    } as any;
  }, [siteQuery.data]);

  const areas = useMemo(() => {
    return (areasQuery.data || []).map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      unitsCount: a.unitsCount,
    }));
  }, [areasQuery.data]);

  const totalUnits = useMemo(() => {
    return areas.reduce((sum, a) => sum + a.unitsCount, 0);
  }, [areas]);

  const siblingSites = useMemo(() => {
    if (!siblingSitesQuery.data) return [];
    return siblingSitesQuery.data
      .filter(s => s.id !== siteId)
      .map(s => ({
        id: s.id,
        name: s.name,
        href: `/sites/${s.id}`,
      }));
  }, [siblingSitesQuery.data, siteId]);

  useEffect(() => {
    if (site) {
      setEditFormData({
        name: site.name,
        address: site.address || "",
        city: site.city || "",
        state: site.state || "",
        postal_code: site.postal_code || "",
      });
    }
  }, [site]);

  const refreshSiteData = () => {
    siteQuery.refetch();
    areasQuery.refetch();
    siblingSitesQuery.refetch();
  };


  const handleCreateArea = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Area name is required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await trpcClient.areas.create.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        data: {
          name: formData.name,
          description: formData.description || null,
        }
      });
      toast({ title: "Area created successfully" });
      setFormData({ name: "", description: "" });
      setDialogOpen(false);
      refreshSiteData();
    } catch (err) {
      console.error("Error creating area:", err);
      toast({ title: "Failed to create area", variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleUpdateSite = async () => {
    if (!editFormData.name.trim()) {
      toast({ title: "Site name is required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await trpcClient.sites.update.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        data: {
          name: editFormData.name,
          address: editFormData.address || null,
          city: editFormData.city || null,
          state: editFormData.state || null,
          postalCode: editFormData.postal_code || null,
        }
      });
      toast({ title: "Site updated successfully" });
      setEditDialogOpen(false);
      refreshSiteData();
    } catch (err) {
      console.error("Error updating site:", err);
      toast({ title: "Failed to update site", variant: "destructive" });
    }
    setIsSubmitting(false);
  };


  const handleExport = async (reportType: "daily" | "exceptions") => {
    if (!siteId) return;
    setIsExporting(true);

    try {
      if (!user) {
        toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
        navigate("/auth");
        return;
      }

      // TODO: Migrate to tRPC export endpoint when available
      toast({
        title: "Export in progress",
        description: "CSV exports are being migrated to the new backend. Please try again soon."
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export failed", variant: "destructive" });
    }
    setIsExporting(false);
  };

  const handleDeleteSite = async () => {
    if (!user?.id || !siteId || !effectiveOrgId) return;
    try {
      await trpcClient.sites.delete.mutate({
        organizationId: effectiveOrgId,
        siteId: siteId,
      });
      toast({ title: "Site deleted" });
      navigate("/sites");
    } catch (err) {
      console.error("Error deleting site:", err);
      toast({ title: "Failed to delete site", variant: "destructive" });
    }
  };

  const formatAddress = () => {
    const parts = [site?.address, site?.city, site?.state, site?.postal_code].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "No address set";
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!site) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Site not found</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <HierarchyBreadcrumb
        items={[
          { label: "All Equipment", href: "/sites" },
          { label: site.name, isCurrentPage: true, siblings: siblingSites },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Layout Selector Dropdown */}
            <LayoutHeaderDropdown
              entityType="site"
              entityId={siteId!}
              organizationId={site.organization_id}
              currentLayoutKey={layoutKey}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("daily")}>
                  <FileText className="w-4 h-4 mr-2" />
                  Daily Log (7 days)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("exceptions")}>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Exceptions (7 days)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Site</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Site Name *</Label>
                    <Input
                      id="edit-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-address">Address</Label>
                    <Input
                      id="edit-address"
                      value={editFormData.address}
                      onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-city">City</Label>
                      <Input
                        id="edit-city"
                        value={editFormData.city}
                        onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-state">State</Label>
                      <Input
                        id="edit-state"
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-postal">Postal Code</Label>
                    <Input
                      id="edit-postal"
                      value={editFormData.postal_code}
                      onChange={(e) => setEditFormData({ ...editFormData, postal_code: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateSite} disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            {canDeleteEntities && !permissionsLoading && (
              <Button 
                variant="ghost" 
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Tab-based layout */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="areas">
            <LayoutGrid className="w-4 h-4 mr-2" />
            Areas & Units
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab - Customizable Grid */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Site Header Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl sm:text-2xl truncate">{site.name}</CardTitle>
                  <CardDescription className="truncate">{formatAddress()}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Customizable Dashboard Grid */}
          <EntityDashboard
            entityType="site"
            entityId={siteId!}
            organizationId={site.organization_id}
            site={{
              id: site.id,
              name: site.name,
              organization_id: site.organization_id,
              latitude: site.latitude,
              longitude: site.longitude,
              timezone: site.timezone,
            }}
            areas={areas}
            totalUnits={totalUnits}
            onSiteLocationChange={refreshSiteData}
          />
        </TabsContent>

        {/* Areas Tab */}
        <TabsContent value="areas" className="space-y-4">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                    <LayoutGrid className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{areas.length}</p>
                    <p className="text-xs text-muted-foreground">Areas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                    <Thermometer className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalUnits}</p>
                    <p className="text-xs text-muted-foreground">Units</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate">{site.timezone}</p>
                    <p className="text-xs text-muted-foreground">Timezone</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Areas List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Areas</CardTitle>
                  <CardDescription>Organize units by location within this site</CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Area
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Area</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="area-name">Area Name *</Label>
                        <Input
                          id="area-name"
                          placeholder="e.g., Main Kitchen"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="area-desc">Description</Label>
                        <Textarea
                          id="area-desc"
                          placeholder="Optional description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleCreateArea} 
                          disabled={isSubmitting}
                        >
                          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Create Area
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {areas.length > 0 ? (
                <div className="space-y-2">
                  {areas.map((area) => (
                    <Link key={area.id} to={`/sites/${siteId}/areas/${area.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-foreground truncate">{area.name}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {area.description || "No description"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Thermometer className="w-4 h-4" />
                            <span>{area.unitsCount}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg">
                  <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center mb-3">
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-1">No Areas Yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                    Create areas within this site to organize your refrigeration units.
                  </p>
                  <Button 
                    size="sm"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Area
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          {/* Gateways Section */}
          <SiteGatewaysCard
            siteId={site.id}
            siteName={site.name}
            organizationId={site.organization_id}
          />

          {/* Compliance Settings Section */}
          <SiteComplianceSettings
            siteId={site.id}
            siteName={site.name}
            organizationId={site.organization_id}
            timezone={site.timezone}
            complianceMode={site.compliance_mode}
            manualLogCadenceSeconds={site.manual_log_cadence_seconds}
            correctiveActionRequired={site.corrective_action_required}
            onSettingsUpdated={refreshSiteData}
          />
        </TabsContent>
      </Tabs>

      {site && (
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          entityName={site.name}
          entityType="site"
          onConfirm={handleDeleteSite}
          hasChildren={areas.length > 0}
          childrenCount={areas.length + totalUnits}
        />
      )}
    </DashboardLayout>
  );
};

export default SiteDetail;
