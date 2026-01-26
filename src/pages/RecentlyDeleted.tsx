import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@stackframe/react";
import DashboardLayout from "@/components/DashboardLayout";
import { usePermissions } from "@/hooks/useUserRole";
import { DeleteConfirmationDialog, DeleteEntityType } from "@/components/ui/delete-confirmation-dialog";
import {
  restoreUnit,
  restoreArea,
  restoreSite,
  restoreDevice,
  restoreSensor,
  permanentlyDeleteUnit,
  permanentlyDeleteArea,
  permanentlyDeleteSite,
} from "@/hooks/useSoftDelete";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Building2,
  LayoutGrid,
  Thermometer,
  Wifi,
  RefreshCw,
  Radio,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface DeletedItem {
  id: string;
  name: string;
  entityType: DeleteEntityType;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  parentPath: string;
}

const entityTypeIcons: Record<DeleteEntityType, React.ReactNode> = {
  site: <Building2 className="h-4 w-4" />,
  area: <LayoutGrid className="h-4 w-4" />,
  unit: <Thermometer className="h-4 w-4" />,
  device: <Wifi className="h-4 w-4" />,
  sensor: <Radio className="h-4 w-4" />,
};

const entityTypeLabels: Record<DeleteEntityType, string> = {
  site: "Site",
  area: "Area",
  unit: "Unit",
  device: "Device",
  sensor: "Sensor",
};

const RecentlyDeleted = () => {
  const navigate = useNavigate();
  const user = useUser();
  const { canRestoreEntities, canPermanentlyDelete, isLoading: permissionsLoading } = usePermissions();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | DeleteEntityType>("all");

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DeletedItem | null>(null);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadDeletedItems();
  }, []);

  useEffect(() => {
    if (!permissionsLoading && !canRestoreEntities) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, canRestoreEntities, navigate]);

  const loadDeletedItems = async () => {
    setIsLoading(true);

    try {
      setItems([]);
    } catch (error) {
      console.error("Failed to load deleted items:", error);
    }

    setIsLoading(false);
  };

  const handleRestore = async (item: DeletedItem) => {
    if (!user?.id) return;

    setIsRestoring(item.id);
    let result;

    switch (item.entityType) {
      case "unit":
        result = await restoreUnit(item.id, user.id);
        break;
      case "area":
        result = await restoreArea(item.id, user.id);
        break;
      case "site":
        result = await restoreSite(item.id, user.id);
        break;
      case "device":
        result = await restoreDevice(item.id, user.id);
        break;
      case "sensor":
        result = await restoreSensor(item.id, user.id);
        break;
    }

    if (result.success) {
      setItems(items.filter(i => i.id !== item.id));
    }
    setIsRestoring(null);
  };

  const handlePermanentDelete = async () => {
    if (!selectedItem || !user?.id) return;

    let result;
    switch (selectedItem.entityType) {
      case "unit":
        result = await permanentlyDeleteUnit(selectedItem.id, user.id);
        break;
      case "area":
        result = await permanentlyDeleteArea(selectedItem.id, user.id);
        break;
      case "site":
        result = await permanentlyDeleteSite(selectedItem.id, user.id);
        break;
      default:
        return;
    }

    if (result.success) {
      setItems(items.filter(i => i.id !== selectedItem.id));
    }
    setDeleteDialogOpen(false);
    setSelectedItem(null);
  };

  const filteredItems = activeTab === "all" 
    ? items 
    : items.filter(item => item.entityType === activeTab);

  if (permissionsLoading || isLoading) {
    return (
      <DashboardLayout title="Recently Deleted">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Recently Deleted">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Recently Deleted
            </CardTitle>
            <CardDescription>
              View and restore deleted sites, areas, units, and devices. Items can be permanently deleted if needed.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadDeletedItems}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({items.length})</TabsTrigger>
              <TabsTrigger value="site">Sites ({items.filter(i => i.entityType === "site").length})</TabsTrigger>
              <TabsTrigger value="area">Areas ({items.filter(i => i.entityType === "area").length})</TabsTrigger>
              <TabsTrigger value="unit">Units ({items.filter(i => i.entityType === "unit").length})</TabsTrigger>
              <TabsTrigger value="device">Devices ({items.filter(i => i.entityType === "device").length})</TabsTrigger>
              <TabsTrigger value="sensor">Sensors ({items.filter(i => i.entityType === "sensor").length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trash2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deleted items found</p>
                  <p className="text-sm mt-2">Recently deleted listings are being migrated to tRPC.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={`${item.entityType}-${item.id}`}>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            {entityTypeIcons[item.entityType]}
                            {entityTypeLabels[item.entityType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.parentPath || "—"}
                        </TableCell>
                        <TableCell>
                          <span 
                            className="text-sm" 
                            title={format(new Date(item.deletedAt), "PPpp")}
                          >
                            {formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleRestore(item)}
                                disabled={isRestoring === item.id}
                              >
                                {isRestoring === item.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                )}
                                Restore
                              </DropdownMenuItem>
                                {canPermanentlyDelete && item.entityType !== "device" && item.entityType !== "sensor" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        setSelectedItem(item);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Permanently
                                    </DropdownMenuItem>
                                  </>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedItem && (
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          entityName={selectedItem.name}
          entityType={selectedItem.entityType}
          onConfirm={handlePermanentDelete}
          isPermanent
        />
      )}
    </DashboardLayout>
  );
};

export default RecentlyDeleted;
