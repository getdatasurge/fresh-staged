import { toast } from "sonner";

export interface SoftDeleteResult {
  success: boolean;
  error?: string;
}

const unavailable = async (): Promise<SoftDeleteResult> => {
  const message = "Restore/delete actions are unavailable during Supabase removal.";
  toast.error(message);
  return { success: false, error: message };
};

export async function restoreUnit(_unitId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function restoreArea(_areaId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function restoreSite(_siteId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function restoreDevice(_deviceId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function restoreSensor(_sensorId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function permanentlyDeleteUnit(_unitId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function permanentlyDeleteArea(_areaId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export async function permanentlyDeleteSite(_siteId: string, _userId: string): Promise<SoftDeleteResult> {
  return unavailable();
}

export function useSoftDelete() {
  return {
    restoreUnit,
    restoreArea,
    restoreSite,
    restoreDevice,
    restoreSensor,
    permanentlyDeleteUnit,
    permanentlyDeleteArea,
    permanentlyDeleteSite,
  };
}
