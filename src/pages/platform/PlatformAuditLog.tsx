import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { useTRPC } from '@/lib/trpc';
import PlatformLayout from '@/components/platform/PlatformLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  RefreshCw,
  FileText,
  User,
  Building2,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Eye,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  impersonatedUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetOrgId: string | null;
  targetOrgName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SUPPORT_MODE_ENTERED: { label: 'Support Mode Entered', color: 'bg-purple-100 text-purple-800' },
  SUPPORT_MODE_EXITED: { label: 'Support Mode Exited', color: 'bg-purple-100 text-purple-800' },
  IMPERSONATION_STARTED: { label: 'Impersonation Started', color: 'bg-orange-100 text-orange-800' },
  IMPERSONATION_ENDED: { label: 'Impersonation Ended', color: 'bg-orange-100 text-orange-800' },
  VIEWED_ORGANIZATION_DETAIL: { label: 'Viewed Organization', color: 'bg-blue-100 text-blue-800' },
  VIEWED_ORGANIZATIONS_LIST: { label: 'Viewed Orgs List', color: 'bg-blue-100 text-blue-800' },
  VIEWED_USER_DETAIL: { label: 'Viewed User', color: 'bg-blue-100 text-blue-800' },
  VIEWED_USERS_LIST: { label: 'Viewed Users List', color: 'bg-blue-100 text-blue-800' },
  VIEWED_ORGANIZATION: { label: 'Viewed Org', color: 'bg-blue-100 text-blue-800' },
  SUPER_ADMIN_REVOKED: { label: 'Super Admin Revoked', color: 'bg-red-100 text-red-800' },
};

export default function PlatformAuditLog() {
  const { logSuperAdminAction } = useSuperAdmin();
  const trpc = useTRPC();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const auditLogQuery = useQuery(
    trpc.admin.listSuperAdminAuditLog.queryOptions({ limit: 500 })
  );

  // Handle side effect for logging
  useEffect(() => {
    if (auditLogQuery.isSuccess) {
      logSuperAdminAction('VIEWED_AUDIT_LOG');
    }
  }, [auditLogQuery.isSuccess, logSuperAdminAction]);

  const entries = auditLogQuery.data || [];
  const isLoading = auditLogQuery.isLoading;

  const toggleExpanded = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (actionTypeFilter !== 'all' && entry.action !== actionTypeFilter) {
        return false;
      }
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        entry.actorEmail?.toLowerCase().includes(query) ||
        entry.impersonatedUserId?.toLowerCase().includes(query) ||
        entry.targetOrgName?.toLowerCase().includes(query) ||
        entry.action.toLowerCase().includes(query)
      );
    });
  }, [entries, actionTypeFilter, searchQuery]);

  const uniqueActionTypes = [...new Set(entries.map(e => e.action))];

  return (
    <PlatformLayout title="Audit Log">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entries.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Support Mode Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {entries.filter(e => e.action === 'SUPPORT_MODE_ENTERED').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impersonations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {entries.filter(e => e.action === 'IMPERSONATION_STARTED').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {entries.filter(e => {
                const date = new Date(e.createdAt);
                const today = new Date();
                return date.toDateString() === today.toDateString();
              }).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, organization, or action..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActionTypes.map(type => (
              <SelectItem key={type} value={type}>
                {ACTION_TYPE_LABELS[type]?.label || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => auditLogQuery.refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No audit log entries found
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => {
                  const isExpanded = expandedEntries.has(entry.id);
                  const actionConfig = ACTION_TYPE_LABELS[entry.action];

                  return (
                    <>
                      <TableRow key={entry.id} className="cursor-pointer" onClick={() => toggleExpanded(entry.id)}>
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(entry.createdAt), 'MMM d, yyyy HH:mm:ss')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-purple-600" />
                            <span className="text-sm">{entry.actorEmail || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={actionConfig?.color || 'bg-gray-100 text-gray-800'}
                          >
                            {actionConfig?.label || entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.targetOrgName && (
                            <div className="flex items-center gap-1 text-sm">
                              <Building2 className="w-3 h-3" />
                              {entry.targetOrgName}
                            </div>
                          )}
                          {entry.impersonatedUserId && (
                            <div className="flex items-center gap-1 text-sm text-orange-600">
                              <Eye className="w-3 h-3" />
                              {entry.impersonatedUserId}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.details && Object.keys(entry.details).length > 0
                            ? `${Object.keys(entry.details).length} fields`
                            : '-'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${entry.id}-details`}>
                          <TableCell colSpan={6} className="bg-muted/50 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="font-medium mb-2">Entry Details</div>
                                <dl className="space-y-1">
                                  <div className="flex">
                                    <dt className="w-32 text-muted-foreground">Entry ID:</dt>
                                    <dd className="font-mono text-xs">{entry.id}</dd>
                                  </div>
                                  <div className="flex">
                                    <dt className="w-32 text-muted-foreground">Actor ID:</dt>
                                    <dd className="font-mono text-xs">{entry.actorEmail || entry.actorName || 'Unknown'}</dd>
                                  </div>
                                  {entry.impersonatedUserId && (
                                    <div className="flex">
                                      <dt className="w-32 text-muted-foreground">Impersonated:</dt>
                                      <dd className="font-mono text-xs">{entry.impersonatedUserId}</dd>
                                    </div>
                                  )}
                                  {entry.targetId && (
                                    <div className="flex">
                                      <dt className="w-32 text-muted-foreground">Target ID:</dt>
                                      <dd className="font-mono text-xs">{entry.targetId}</dd>
                                    </div>
                                  )}
                                  {entry.targetType && (
                                    <div className="flex">
                                      <dt className="w-32 text-muted-foreground">Target Type:</dt>
                                      <dd>{entry.targetType}</dd>
                                    </div>
                                  )}
                                </dl>
                              </div>
                              {entry.details && Object.keys(entry.details).length > 0 && (
                                <div>
                                  <div className="font-medium mb-2">Details</div>
                                  <pre className="bg-background p-2 rounded text-xs overflow-auto max-h-32">
                                    {JSON.stringify(entry.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PlatformLayout>
  );
}
