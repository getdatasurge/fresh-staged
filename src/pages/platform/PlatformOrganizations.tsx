import PlatformLayout from '@/components/platform/PlatformLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSuperAdmin } from '@/contexts/SuperAdminContext'
import { useTRPC } from '@/lib/trpc'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  ChevronRight,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

export default function PlatformOrganizations() {
  const { logSuperAdminAction } = useSuperAdmin();
  const trpc = useTRPC();
  const [searchQuery, setSearchQuery] = useState('');

  const orgsQuery = useQuery(
    trpc.admin.listOrganizations.queryOptions(undefined)
  );

  // Handle side effect for logging
  useEffect(() => {
    if (orgsQuery.isSuccess) {
      logSuperAdminAction('VIEWED_ORGANIZATIONS_LIST');
    }
  }, [orgsQuery.isSuccess, logSuperAdminAction]);

  const organizations = orgsQuery.data || [];
  const isLoading = orgsQuery.isLoading;

  const filteredOrganizations = useMemo(() => {
    if (!searchQuery) return organizations;
    const query = searchQuery.toLowerCase();
    return organizations.filter((org) =>
      org.name.toLowerCase().includes(query) ||
      org.slug.toLowerCase().includes(query)
    );
  }, [organizations, searchQuery]);

  const totalCount = organizations.length;
  const totalUsers = organizations.reduce((sum, org) => sum + (org.userCount || 0), 0);
  const totalSites = organizations.reduce((sum, org) => sum + (org.siteCount || 0), 0);

  return (
    <PlatformLayout title="Organizations">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSites}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations by name or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => orgsQuery.refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Organizations Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Sites</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredOrganizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'No organizations match your search' : 'No organizations found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrganizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{org.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {org.slug}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        {org.userCount}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {org.siteCount}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        org.complianceMode === 'haccp' 
                          ? 'border-transparent bg-primary text-primary-foreground' 
                          : 'border-transparent bg-secondary text-secondary-foreground'
                      }`}>
                        {org.complianceMode || 'standard'}
                      </span>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Link to={`/platform/organizations/${org.id}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PlatformLayout>
  );
}

export { PlatformOrganizations }

