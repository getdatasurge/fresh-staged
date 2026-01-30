import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useUser } from '@stackframe/react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import { HierarchyBreadcrumb, BreadcrumbSibling } from '@/components/HierarchyBreadcrumb';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { usePermissions } from '@/hooks/useUserRole';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  ChevronRight,
  Building2,
  Loader2,
  Thermometer,
  Pencil,
  Wifi,
  WifiOff,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type UnitType =
  | 'fridge'
  | 'freezer'
  | 'walk_in_cooler'
  | 'walk_in_freezer'
  | 'display_case'
  | 'blast_chiller';

interface Unit {
  id: string;
  name: string;
  unit_type: string;
  status: string;
  last_temp_reading: number | null;
  last_reading_at: string | null;
  temp_limit_high: number;
  temp_limit_low: number | null;
}

interface AreaData {
  id: string;
  name: string;
  description: string | null;
  site: {
    id: string;
    name: string;
  };
}

const unitTypes: { value: UnitType; label: string }[] = [
  { value: 'fridge', label: 'Refrigerator' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'walk_in_cooler', label: 'Walk-in Cooler' },
  { value: 'walk_in_freezer', label: 'Walk-in Freezer' },
  { value: 'display_case', label: 'Display Case' },
  { value: 'blast_chiller', label: 'Blast Chiller' },
];

import { STATUS_CONFIG } from '@/lib/statusConfig';

const AreaDetail = () => {
  const { siteId, areaId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useUser();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const { effectiveOrgId, isInitialized: identityInitialized } = useEffectiveIdentity();
  const { canDeleteEntities, isLoading: permissionsLoading } = usePermissions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    unit_type: 'fridge' as UnitType,
    temp_limit_high: '41',
    temp_limit_low: '',
  });
  const [editFormData, setEditFormData] = useState({ name: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // tRPC queries
  const areaQuery = useQuery(
    trpc.areas.get.queryOptions(
      { organizationId: effectiveOrgId!, siteId: siteId!, areaId: areaId! },
      { enabled: !!areaId && !!siteId && !!effectiveOrgId && identityInitialized },
    ),
  );

  const unitsQuery = useQuery(
    trpc.units.list.queryOptions(
      { organizationId: effectiveOrgId!, siteId: siteId!, areaId: areaId! },
      { enabled: !!areaId && !!siteId && !!effectiveOrgId && identityInitialized },
    ),
  );

  const siblingAreasQuery = useQuery(
    trpc.areas.list.queryOptions(
      { organizationId: effectiveOrgId!, siteId: siteId! },
      { enabled: !!siteId && !!effectiveOrgId && identityInitialized },
    ),
  );

  const siteQuery = useQuery(
    trpc.sites.get.queryOptions(
      { organizationId: effectiveOrgId!, siteId: siteId! },
      { enabled: !!siteId && !!effectiveOrgId && identityInitialized },
    ),
  );

  const isLoading = areaQuery.isLoading || !identityInitialized;

  // Derived data
  const area = useMemo((): AreaData | null => {
    if (!areaQuery.data || !siteQuery.data) return null;
    return {
      id: areaQuery.data.id,
      name: areaQuery.data.name,
      description: areaQuery.data.description,
      site: {
        id: siteQuery.data.id,
        name: siteQuery.data.name,
      },
    };
  }, [areaQuery.data, siteQuery.data]);

  const units = useMemo((): Unit[] => {
    return (unitsQuery.data || []).map((u) => ({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      status: u.status,
      last_temp_reading: u.lastTemperature,
      last_reading_at: u.lastReadingAt?.toISOString() || null,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
    }));
  }, [unitsQuery.data]);

  const siblingAreas = useMemo((): BreadcrumbSibling[] => {
    if (!siblingAreasQuery.data) return [];
    return siblingAreasQuery.data
      .filter((a) => a.id !== areaId)
      .map((a) => ({
        id: a.id,
        name: a.name,
        href: `/sites/${siteId}/areas/${a.id}`,
      }));
  }, [siblingAreasQuery.data, siteId, areaId]);

  // Set edit form data when area loads
  useMemo(() => {
    if (areaQuery.data) {
      setEditFormData({
        name: areaQuery.data.name,
        description: areaQuery.data.description || '',
      });
    }
  }, [areaQuery.data]);

  const refreshAreaData = () => {
    areaQuery.refetch();
    unitsQuery.refetch();
    siblingAreasQuery.refetch();
  };

  const handleCreateUnit = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Unit name is required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await trpcClient.units.create.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        areaId: areaId!,
        data: {
          name: formData.name,
          unitType: formData.unit_type,
          tempMax: parseFloat(formData.temp_limit_high) || 41,
          tempMin: formData.temp_limit_low ? parseFloat(formData.temp_limit_low) : null,
        },
      });
      toast({ title: 'Unit created successfully' });
      setFormData({ name: '', unit_type: 'fridge', temp_limit_high: '41', temp_limit_low: '' });
      setDialogOpen(false);
      refreshAreaData();
    } catch (error) {
      console.error('Error creating unit:', error);
      toast({ title: 'Failed to create unit', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleUpdateArea = async () => {
    if (!editFormData.name.trim()) {
      toast({ title: 'Area name is required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await trpcClient.areas.update.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        areaId: areaId!,
        data: {
          name: editFormData.name,
          description: editFormData.description || null,
        },
      });
      toast({ title: 'Area updated successfully' });
      setEditDialogOpen(false);
      refreshAreaData();
    } catch (error) {
      console.error('Error updating area:', error);
      toast({ title: 'Failed to update area', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleDeleteArea = async () => {
    if (!user?.id || !areaId || !siteId || !effectiveOrgId) return;
    try {
      await trpcClient.areas.delete.mutate({
        organizationId: effectiveOrgId,
        siteId: siteId,
        areaId: areaId,
      });
      toast({ title: 'Area deleted' });
      navigate(`/sites/${siteId}`);
    } catch (err) {
      console.error('Error deleting area:', err);
      toast({ title: 'Failed to delete area', variant: 'destructive' });
    }
  };

  const formatTemp = (temp: number | null) => {
    if (temp === null) return '--';
    return `${temp.toFixed(1)}°F`;
  };

  const getTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleUnitTypeChange = (value: UnitType) => {
    const isFreezer = ['freezer', 'walk_in_freezer', 'blast_chiller'].includes(value);
    setFormData({
      ...formData,
      unit_type: value,
      temp_limit_high: isFreezer ? '0' : '41',
      temp_limit_low: isFreezer ? '-20' : '',
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!area) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Area not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <HierarchyBreadcrumb
        items={[
          { label: 'All Equipment', href: '/sites' },
          { label: area.site.name, href: `/sites/${area.site.id}` },
          { label: area.name, isCurrentPage: true, siblings: siblingAreas },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Area
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Area</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Area Name *</Label>
                    <Input
                      id="edit-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-desc">Description</Label>
                    <Textarea
                      id="edit-desc"
                      value={editFormData.description}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateArea} disabled={isSubmitting}>
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
      <div className="space-y-6">
        {/* Area Header - simplified since breadcrumb has the name */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-secondary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{area.name}</h1>
            <p className="text-muted-foreground">
              {area.site.name} · {area.description || 'No description'}
            </p>
          </div>
        </div>

        {/* Units Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Refrigeration Units</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Unit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Unit</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit-name">Unit Name *</Label>
                    <Input
                      id="unit-name"
                      placeholder="e.g., Prep Fridge #1"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Type</Label>
                    <Select value={formData.unit_type} onValueChange={handleUnitTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="temp-high">High Limit (°F)</Label>
                      <Input
                        id="temp-high"
                        type="number"
                        value={formData.temp_limit_high}
                        onChange={(e) =>
                          setFormData({ ...formData, temp_limit_high: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="temp-low">Low Limit (°F)</Label>
                      <Input
                        id="temp-low"
                        type="number"
                        placeholder="Optional"
                        value={formData.temp_limit_low}
                        onChange={(e) =>
                          setFormData({ ...formData, temp_limit_low: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateUnit}
                      disabled={isSubmitting}
                      className="bg-accent hover:bg-accent/90"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Unit
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {units.length > 0 ? (
            <div className="grid gap-3">
              {units.map((unit) => {
                const status = STATUS_CONFIG[unit.status] || STATUS_CONFIG.offline;
                const isOnline = unit.status !== 'offline' && unit.last_reading_at;

                return (
                  <Link key={unit.id} to={`/units/${unit.id}`}>
                    <Card className="unit-card cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-12 h-12 rounded-xl ${status.bgColor} flex items-center justify-center`}
                            >
                              <Thermometer className={`w-6 h-6 ${status.color}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground">{unit.name}</h3>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${status.bgColor} ${status.color}`}
                                >
                                  {status.label}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground capitalize">
                                {unit.unit_type.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                              <div
                                className={`temp-display text-xl font-semibold ${
                                  unit.last_temp_reading &&
                                  unit.last_temp_reading > unit.temp_limit_high
                                    ? 'text-alarm'
                                    : status.color
                                }`}
                              >
                                {formatTemp(unit.last_temp_reading)}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {isOnline ? (
                                  <Wifi className="w-3 h-3 text-safe" />
                                ) : (
                                  <WifiOff className="w-3 h-3" />
                                )}
                                {getTimeAgo(unit.last_reading_at)}
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </div>

                        {/* Mobile temp display */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border sm:hidden">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {isOnline ? (
                              <Wifi className="w-3 h-3 text-safe" />
                            ) : (
                              <WifiOff className="w-3 h-3" />
                            )}
                            {getTimeAgo(unit.last_reading_at)}
                          </div>
                          <div
                            className={`temp-display text-xl font-semibold ${
                              unit.last_temp_reading &&
                              unit.last_temp_reading > unit.temp_limit_high
                                ? 'text-alarm'
                                : status.color
                            }`}
                          >
                            {formatTemp(unit.last_temp_reading)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                  <Thermometer className="w-7 h-7 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Units Yet</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Add refrigeration units to this area to start monitoring temperatures.
                </p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Unit
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {area && (
          <DeleteConfirmationDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            entityName={area.name}
            entityType="area"
            onConfirm={handleDeleteArea}
            hasChildren={units.length > 0}
            childrenCount={units.length}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default AreaDetail;
