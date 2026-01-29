import { useState } from "react";
import { useUser } from "@stackframe/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUpdateUnit } from "@/hooks/useUnits";
import {
  Settings,
  ChevronDown,
  ChevronRight,
  Pencil,
  Loader2,
  Thermometer,
  DoorOpen,
} from "lucide-react";

interface UnitSettingsSectionProps {
  unitId: string;
  organizationId: string;
  siteId: string;
  areaId: string;
  unitType: string;
  tempLimitLow: number | null;
  tempLimitHigh: number;
  notes?: string | null;
  doorSensorEnabled?: boolean;
  doorOpenGraceMinutes?: number;
  onSettingsUpdated: () => void;
}

const unitTypeLabels: Record<string, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  display_case: "Display Case",
  walk_in_cooler: "Walk-in Cooler",
  walk_in_freezer: "Walk-in Freezer",
  blast_chiller: "Blast Chiller",
};

export default function UnitSettingsSection({
  unitId,
  organizationId,
  siteId,
  areaId,
  unitType,
  tempLimitLow,
  tempLimitHigh,
  notes,
  doorSensorEnabled = false,
  doorOpenGraceMinutes = 20,
  onSettingsUpdated,
}: UnitSettingsSectionProps) {
  const { toast } = useToast();
  const user = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Use tRPC mutation for unit updates
  const updateUnitMutation = useUpdateUnit();

  // Edit form state
  const [editUnitType, setEditUnitType] = useState(unitType);
  const [editLowLimit, setEditLowLimit] = useState(
    tempLimitLow !== null ? tempLimitLow.toString() : ""
  );
  const [editHighLimit, setEditHighLimit] = useState(tempLimitHigh.toString());
  const [validationError, setValidationError] = useState<string | null>(null);

  const formatTemp = (temp: number | null) => {
    if (temp === null) return "Not set";
    return `${temp}°F`;
  };

  const openEditModal = () => {
    setEditUnitType(unitType);
    setEditLowLimit(tempLimitLow !== null ? tempLimitLow.toString() : "");
    setEditHighLimit(tempLimitHigh.toString());
    setValidationError(null);
    setShowEditModal(true);
  };

  const validateAndSave = async () => {
    const lowVal = editLowLimit ? parseFloat(editLowLimit) : null;
    const highVal = parseFloat(editHighLimit);

    if (isNaN(highVal)) {
      setValidationError("High limit is required");
      return;
    }

    if (lowVal !== null && lowVal >= highVal) {
      setValidationError("Low limit must be less than high limit");
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    // Check authentication
    if (!user) {
      toast({ title: "Not authenticated", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    // Check for changes
    const hasChanges =
      editUnitType !== unitType ||
      lowVal !== tempLimitLow ||
      highVal !== tempLimitHigh;

    if (!hasChanges) {
      toast({ title: "No changes to save" });
      setShowEditModal(false);
      setIsSaving(false);
      return;
    }

    try {
      // Use tRPC mutation to update unit
      // Note: The backend schema uses tempMin/tempMax instead of tempLimitLow/tempLimitHigh
      await updateUnitMutation.mutateAsync({
        organizationId,
        siteId,
        areaId,
        unitId,
        data: {
          unitType: editUnitType as 'fridge' | 'freezer' | 'display_case' | 'walk_in_cooler' | 'walk_in_freezer' | 'blast_chiller',
          tempMin: lowVal !== null ? Math.round(lowVal) : undefined,
          tempMax: Math.round(highVal),
        },
      });

      toast({ title: "Unit settings updated" });
      setShowEditModal(false);
      onSettingsUpdated();
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    }

    setIsSaving(false);
  };


  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-border/50">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Unit Settings
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!isOpen && (
                    <span className="text-sm text-muted-foreground hidden sm:inline">
                      {unitTypeLabels[unitType] || unitType} · Low: {formatTemp(tempLimitLow)} · High: {formatTemp(tempLimitHigh)}
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <Thermometer className="w-4 h-4 text-accent" />
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium">{unitTypeLabels[unitType] || unitType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-[10px] text-blue-400">L</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Low Limit</p>
                    <p className="font-medium">{formatTemp(tempLimitLow)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <span className="text-[10px] text-red-400">H</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">High Limit</p>
                    <p className="font-medium">{formatTemp(tempLimitHigh)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <DoorOpen className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Door Sensor</p>
                    <p className="font-medium">{doorSensorEnabled ? `On (${doorOpenGraceMinutes}m grace)` : "Off"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openEditModal}>
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Unit Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Unit Type</Label>
              <Select value={editUnitType} onValueChange={setEditUnitType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fridge">Fridge</SelectItem>
                  <SelectItem value="freezer">Freezer</SelectItem>
                  <SelectItem value="display_case">Display Case</SelectItem>
                  <SelectItem value="walk_in_cooler">Walk-in Cooler</SelectItem>
                  <SelectItem value="walk_in_freezer">Walk-in Freezer</SelectItem>
                  <SelectItem value="blast_chiller">Blast Chiller</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Low Limit (°F)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 32 or -10"
                  value={editLowLimit}
                  onChange={(e) => setEditLowLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Negative values for freezers
                </p>
              </div>
              <div className="space-y-2">
                <Label>High Limit (°F)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 41"
                  value={editHighLimit}
                  onChange={(e) => setEditHighLimit(e.target.value)}
                />
              </div>
            </div>

            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={validateAndSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
