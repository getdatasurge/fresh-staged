import { Crown, Eye, Shield, User, Users } from 'lucide-react';
import type { AppRole } from '@/lib/api-types';

export const roleConfig: Record<
  AppRole,
  { label: string; icon: React.ElementType; color: string }
> = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'bg-warning/15 text-warning border-warning/30',
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    color: 'bg-accent/15 text-accent border-accent/30',
  },
  manager: {
    label: 'Manager',
    icon: Users,
    color: 'bg-primary/15 text-primary border-primary/30',
  },
  staff: {
    label: 'Staff',
    icon: User,
    color: 'bg-safe/15 text-safe border-safe/30',
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'bg-muted text-muted-foreground border-border',
  },
};

export const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

// E.164 phone number validation
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const formatPhoneForInput = (value: string): string => {
  const cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned && !cleaned.startsWith('+')) {
    return '+' + cleaned;
  }
  return cleaned;
};

export const isValidE164 = (phone: string): boolean => {
  return E164_REGEX.test(phone);
};

export const getTelnyxErrorMessage = (error: string): string => {
  if (error.includes('10009') || error.includes('Authentication')) {
    return 'SMS authentication failed. Please contact support.';
  }
  if (error.includes('40310') || error.includes('40311') || error.includes('invalid')) {
    return 'Invalid phone number format or number not SMS-capable.';
  }
  if (error.includes('40300') || error.includes('opted out')) {
    return 'This number has opted out of SMS. Reply START to re-enable.';
  }
  if (error.includes('40001') || error.includes('landline')) {
    return 'Cannot send SMS to landline numbers.';
  }
  if (error.includes('40002') || error.includes('40003') || error.includes('blocked')) {
    return 'Message blocked by carrier. Try a different message.';
  }
  if (error.includes('20100') || error.includes('funds')) {
    return 'SMS service temporarily unavailable. Contact support.';
  }
  if (error.includes('rate') || error.includes('limit')) {
    return 'Rate limited. Please wait a few minutes before trying again.';
  }
  return error;
};
