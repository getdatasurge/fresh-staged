import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { useToast } from "@/hooks/use-toast";
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity";
import { useTRPC } from "@/lib/trpc";
import {
    Building2,
    ChevronRight,
    Loader2,
    MapPin,
    Plus,
    Thermometer
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  areasCount: number;
  unitsCount: number;
}

const Sites = () => {
  const { toast } = useToast();
  const { effectiveOrgId, isInitialized, isImpersonating } = useEffectiveIdentity();
  const { isSupportModeActive } = useSuperAdmin();
  const trpc = useTRPC();
  
  const sitesQuery = trpc.sites.list.useQuery(
    { organizationId: effectiveOrgId || "" },
    { enabled: !!effectiveOrgId }
  );

  const createSiteMutation = trpc.sites.create.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map tRPC sites to local format
  const sites = useMemo(() => {
    if (!sitesQuery.data) return [];
    return sitesQuery.data.map(s => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      is_active: s.isActive,
      areasCount: s.areasCount,
      unitsCount: s.unitsCount,
    }));
  }, [sitesQuery.data]);

  const isLoading = isInitialized && (sitesQuery.isLoading || (isSupportModeActive && !effectiveOrgId));

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Site name is required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await createSiteMutation.mutateAsync({
        organizationId: effectiveOrgId || "",
        data: {
          name: formData.name,
          address: formData.address || null,
          city: formData.city || null,
          state: formData.state || null,
          postalCode: formData.postal_code || null,
        }
      });

      toast({ title: "Site created successfully" });
      setFormData({ name: "", address: "", city: "", state: "", postal_code: "" });
      setDialogOpen(false);
      sitesQuery.refetch();
    } catch (error) {
      console.error("Error creating site:", error);
      toast({ title: "Failed to create site", variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  return (
    <DashboardLayout title="Sites">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">Manage your locations and their refrigeration units</p>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Add Site
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Site</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Site Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Downtown Restaurant"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    placeholder="123 Main Street"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="State"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal">Postal Code</Label>
                  <Input
                    id="postal"
                    placeholder="12345"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
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
                    Create Site
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Sites List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : sites.length > 0 ? (
          <div className="grid gap-4">
            {sites.map((site) => (
              <Link key={site.id} to={`/sites/${site.id}`}>
                <Card className="card-hover cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <MapPin className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{site.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {[site.city, site.state].filter(Boolean).join(", ") || "No address set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            <span>{site.areasCount} areas</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Thermometer className="w-4 h-4" />
                            <span>{site.unitsCount} units</span>
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
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Sites Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Create your first site to start organizing your refrigeration monitoring.
              </p>
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Site
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Sites;
