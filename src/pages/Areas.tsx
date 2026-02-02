import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Loader2, Plus, Thermometer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

interface Area {
  id: string;
  name: string;
  description: string | null;
  unitsCount: number;
}

const Areas = () => {
  const { siteId } = useParams();
  const { toast } = useToast();
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const areasQuery = useQuery(
    trpc.areas.listWithUnitCount.queryOptions(
      { organizationId: effectiveOrgId || '', siteId: siteId! },
      { enabled: !!effectiveOrgId && !!siteId },
    ),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
  });
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map tRPC areas to local format
  const areas = useMemo(() => {
    if (!areasQuery.data) return [];
    return areasQuery.data.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      unitsCount: a.unitsCount,
    }));
  }, [areasQuery.data]);

  const isLoading = isInitialized && areasQuery.isLoading;

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Area name is required', variant: 'destructive' });
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
        },
      });

      toast({ title: 'Area created successfully' });
      setFormData({ name: '', description: '' });
      setDialogOpen(false);
      areasQuery.refetch();
    } catch (error) {
      console.error('Error creating area:', error);
      toast({ title: 'Failed to create area', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleEdit = async () => {
    if (!editFormData.name.trim() || !selectedAreaId) {
      toast({ title: 'Area name is required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await trpcClient.areas.update.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        areaId: selectedAreaId,
        data: {
          name: editFormData.name,
          description: editFormData.description || null,
        },
      });

      toast({ title: 'Area updated successfully' });
      setEditFormData({ name: '', description: '' });
      setSelectedAreaId(null);
      setEditDialogOpen(false);
      areasQuery.refetch();
    } catch (error) {
      console.error('Error updating area:', error);
      toast({ title: 'Failed to update area', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selectedAreaId) return;

    setIsSubmitting(true);
    try {
      await trpcClient.areas.delete.mutate({
        organizationId: effectiveOrgId!,
        siteId: siteId!,
        areaId: selectedAreaId,
      });

      toast({ title: 'Area deleted successfully' });
      setSelectedAreaId(null);
      setDeleteDialogOpen(false);
      areasQuery.refetch();
    } catch (error) {
      console.error('Error deleting area:', error);
      toast({ title: 'Failed to delete area', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const openEditDialog = (area: Area) => {
    setSelectedAreaId(area.id);
    setEditFormData({
      name: area.name,
      description: area.description || '',
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (area: Area) => {
    setSelectedAreaId(area.id);
    setDeleteDialogOpen(true);
  };

  return (
    <DashboardLayout title="Areas">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">Manage areas within this site</p>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
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
                  <Label htmlFor="name">Area Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Prep Kitchen"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
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
                    onClick={handleCreate}
                    disabled={isSubmitting}
                    className="bg-accent hover:bg-accent/90"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Area
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Areas List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : areas.length > 0 ? (
          <div className="grid gap-4">
            {areas.map((area) => (
              <Link key={area.id} to={`/sites/${siteId}/areas/${area.id}`}>
                <Card className="card-hover cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{area.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {area.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Thermometer className="w-4 h-4" />
                            <span>{area.unitsCount} units</span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Areas Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Create your first area to start organizing refrigeration units in this site.
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Area
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
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
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleEdit}
                disabled={isSubmitting}
                className="bg-accent hover:bg-accent/90"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Area</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this area? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete Area
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Areas;
