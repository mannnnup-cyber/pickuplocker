'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Package, Lock, Users, MessageSquare, DollarSign, Settings,
  Plus, Send, Phone, Clock, AlertTriangle, CheckCircle2,
  XCircle, Building2, Box, ArrowRight, RefreshCw, Trash2,
  Edit, Eye, Bell, BellRing, Wallet, CreditCard, Activity,
  Search, ChevronRight, TrendingUp, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───
interface DashboardData {
  lockers: { total: number; available: number; occupied: number; maintenance: number; utilizationRate: number };
  parcels: { total: number; deposited: number; collected: number; overdue: number };
  customers: { total: number };
  revenue: { total: number; pendingFees: number };
  recentParcels: any[];
  recentSms: any[];
  locations: any[];
}

interface Locker {
  id: string; lockerNumber: string; size: string; status: string; locationId: string;
  location?: any; parcels?: any[];
}

interface Parcel {
  id: string; trackingCode: string; description?: string; depositedAt: string;
  collectedAt?: string; status: string; lockerId: string; customerId: string;
  locker?: any; customer?: any; storageFees?: any[];
}

interface Customer {
  id: string; name: string; phone: string; email?: string; balance: number;
  _count?: { parcels: number; payments: number };
  parcels?: any[];
}

interface SmsLog {
  id: string; to: string; message: string; type: string; status: string;
  twilioSid?: string; errorMessage?: string; sentAt?: string; createdAt: string;
  customer?: any;
}

interface StorageFee {
  id: string; parcelId: string; feeType: string; amount: number; freeHours: number;
  ratePerHour: number; status: string; startDate: string; endDate?: string;
  chargedAt?: string; parcel?: any; payment?: any; calculation?: any;
}

interface Payment {
  id: string; customerId: string; amount: number; currency: string; method: string;
  status: string; description?: string; createdAt: string; customer?: any;
}

interface Location {
  id: string; name: string; address: string; city: string; isActive: boolean;
  _count?: { lockers: number };
}

// ─── API Helper ───
async function api(path: string, options?: RequestInit) {
  const res = await fetch(`/api/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Status Badge Helpers ───
function lockerStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    AVAILABLE: { label: 'Available', variant: 'default' },
    OCCUPIED: { label: 'Occupied', variant: 'secondary' },
    RESERVED: { label: 'Reserved', variant: 'outline' },
    MAINTENANCE: { label: 'Maintenance', variant: 'destructive' },
    OUT_OF_SERVICE: { label: 'Out of Service', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function parcelStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    DEPOSITED: { label: 'Deposited', variant: 'outline', icon: Package },
    NOTIFIED: { label: 'Notified', variant: 'secondary', icon: Bell },
    REMINDED: { label: 'Reminded', variant: 'secondary', icon: BellRing },
    OVERDUE: { label: 'Overdue', variant: 'destructive', icon: AlertTriangle },
    COLLECTED: { label: 'Collected', variant: 'default', icon: CheckCircle2 },
    RETURNED: { label: 'Returned', variant: 'outline', icon: ArrowRight },
  };
  const s = map[status] || { label: status, variant: 'outline' as const, icon: Package };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function feeStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    ACCUMULATING: { label: 'Accumulating', variant: 'outline' },
    CHARGED: { label: 'Charged', variant: 'default' },
    WAIVED: { label: 'Waived', variant: 'secondary' },
    DISPUTED: { label: 'Disputed', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function smsStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    QUEUED: { label: 'Queued', variant: 'outline' },
    SENT: { label: 'Sent', variant: 'default' },
    DELIVERED: { label: 'Delivered', variant: 'default' },
    FAILED: { label: 'Failed', variant: 'destructive' },
    UNDELIVERED: { label: 'Undelivered', variant: 'destructive' },
  };
  const s = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function sizeLabel(size: string) {
  const map: Record<string, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', XLARGE: 'XL' };
  return map[size] || size;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Main Page ───
export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [fees, setFees] = useState<StorageFee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const loadDashboard = useCallback(async () => {
    setLoading(l => ({ ...l, dashboard: true }));
    try {
      const data = await api('dashboard');
      setDashboard(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, dashboard: false }));
  }, []);

  const loadLockers = useCallback(async () => {
    setLoading(l => ({ ...l, lockers: true }));
    try {
      const data = await api('lockers');
      setLockers(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, lockers: false }));
  }, []);

  const loadParcels = useCallback(async () => {
    setLoading(l => ({ ...l, parcels: true }));
    try {
      const data = await api('parcels');
      setParcels(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, parcels: false }));
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(l => ({ ...l, customers: true }));
    try {
      const data = await api('customers');
      setCustomers(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, customers: false }));
  }, []);

  const loadSms = useCallback(async () => {
    setLoading(l => ({ ...l, sms: true }));
    try {
      const data = await api('sms');
      setSmsLogs(data.logs);
      setTwilioConfigured(data.twilioConfigured);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, sms: false }));
  }, []);

  const loadFees = useCallback(async () => {
    setLoading(l => ({ ...l, fees: true }));
    try {
      const data = await api('fees');
      setFees(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, fees: false }));
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(l => ({ ...l, payments: true }));
    try {
      const data = await api('payments');
      setPayments(data.payments);
    } catch (e: any) { toast.error(e.message); }
    setLoading(l => ({ ...l, payments: false }));
  }, []);

  const loadLocations = useCallback(async () => {
    try { setLocations(await api('locations')); } catch {}
  }, []);

  const loadedTabs = useRef<Set<string>>(new Set());

  // Initial load
  useEffect(() => {
    const init = async () => {
      const dashData = await api('dashboard');
      setDashboard(dashData);
      setLocations(await api('locations').catch(() => []));
    };
    init();
  }, []);

  // Tab-based lazy loading
  useEffect(() => {
    if (loadedTabs.current.has(activeTab)) return;
    loadedTabs.current.add(activeTab);

    const loaders: Record<string, () => Promise<void>> = {
      lockers: loadLockers,
      parcels: loadParcels,
      customers: loadCustomers,
      sms: loadSms,
      fees: loadFees,
      payments: loadPayments,
    };
    if (loaders[activeTab]) loaders[activeTab]();
  }, [activeTab, loadLockers, loadParcels, loadCustomers, loadSms, loadFees, loadPayments]);

  const handleSeed = async () => {
    try {
      await api('seed', { method: 'POST' });
      toast.success('Demo data seeded!');
      setDashboard(await api('dashboard'));
      setLocations(await api('locations').catch(() => []));
      // Reset loaded flags so data reloads on tab switch
      loadedTabs.current.clear();
      setLockers([]); setParcels([]); setCustomers([]); setSmsLogs([]); setFees([]); setPayments([]);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Pickup Locker</h1>
              <p className="text-xs text-slate-500">Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSeed}>
              <Package className="w-4 h-4 mr-1" /> Seed Demo Data
            </Button>
            <Button variant="outline" size="sm" onClick={() => { loadDashboard(); loadLocations(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7 mb-6">
            <TabsTrigger value="dashboard" className="text-xs sm:text-sm"><Activity className="w-4 h-4 mr-1 hidden sm:inline" />Dashboard</TabsTrigger>
            <TabsTrigger value="lockers" className="text-xs sm:text-sm"><Lock className="w-4 h-4 mr-1 hidden sm:inline" />Lockers</TabsTrigger>
            <TabsTrigger value="parcels" className="text-xs sm:text-sm"><Package className="w-4 h-4 mr-1 hidden sm:inline" />Parcels</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs sm:text-sm"><Users className="w-4 h-4 mr-1 hidden sm:inline" />Customers</TabsTrigger>
            <TabsTrigger value="sms" className="text-xs sm:text-sm"><MessageSquare className="w-4 h-4 mr-1 hidden sm:inline" />SMS</TabsTrigger>
            <TabsTrigger value="fees" className="text-xs sm:text-sm"><DollarSign className="w-4 h-4 mr-1 hidden sm:inline" />Fees</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs sm:text-sm"><CreditCard className="w-4 h-4 mr-1 hidden sm:inline" />Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab data={dashboard} loading={loading.dashboard} onRefresh={loadDashboard} /></TabsContent>
          <TabsContent value="lockers"><LockersTab lockers={lockers} locations={locations} loading={loading.lockers} onRefresh={loadLockers} onLocationRefresh={loadLocations} /></TabsContent>
          <TabsContent value="parcels"><ParcelsTab parcels={parcels} lockers={lockers} customers={customers} locations={locations} loading={loading.parcels} onRefresh={loadParcels} onRefreshAll={() => { loadParcels(); loadLockers(); loadCustomers(); }} /></TabsContent>
          <TabsContent value="customers"><CustomersTab customers={customers} loading={loading.customers} onRefresh={loadCustomers} /></TabsContent>
          <TabsContent value="sms"><SmsTab logs={smsLogs} customers={customers} twilioConfigured={twilioConfigured} loading={loading.sms} onRefresh={loadSms} /></TabsContent>
          <TabsContent value="fees"><FeesTab fees={fees} loading={loading.fees} onRefresh={loadFees} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab payments={payments} customers={customers} loading={loading.payments} onRefresh={loadPayments} /></TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/50 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-slate-500">
          Pickup Locker Management System &mdash; Phase 2: SMS Notifications + Auto-Charge
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════
function DashboardTab({ data, loading, onRefresh }: { data: DashboardData | null; loading: boolean; onRefresh: () => void }) {
  if (loading && !data) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!data) return <Card className="p-8 text-center"><p>No data. Click &quot;Seed Demo Data&quot; to get started.</p></Card>;

  const { lockers, parcels, customers, revenue, recentParcels, recentSms, locations } = data;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Available Lockers</p>
                <p className="text-2xl font-bold text-emerald-600">{lockers.available}</p>
              </div>
              <Lock className="w-8 h-8 text-emerald-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{lockers.total} total &middot; {lockers.utilizationRate}% used</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Active Parcels</p>
                <p className="text-2xl font-bold text-amber-600">{parcels.deposited}</p>
              </div>
              <Package className="w-8 h-8 text-amber-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{parcels.overdue} overdue</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Customers</p>
                <p className="text-2xl font-bold text-blue-600">{customers.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Revenue</p>
                <p className="text-2xl font-bold text-violet-600">${revenue.total.toFixed(2)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-violet-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">${revenue.pendingFees.toFixed(2)} pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Utilization Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Locker Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm w-20">Available</span>
              <Progress value={(lockers.available / Math.max(lockers.total, 1)) * 100} className="flex-1 h-3" />
              <span className="text-sm font-medium w-10">{lockers.available}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20">Occupied</span>
              <Progress value={(lockers.occupied / Math.max(lockers.total, 1)) * 100} className="flex-1 h-3" />
              <span className="text-sm font-medium w-10">{lockers.occupied}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm w-20">Maintenance</span>
              <Progress value={(lockers.maintenance / Math.max(lockers.total, 1)) * 100} className="flex-1 h-3" />
              <span className="text-sm font-medium w-10">{lockers.maintenance}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Locations & Recent Activity */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> Locations</CardTitle>
          </CardHeader>
          <CardContent>
            {locations.length === 0 ? <p className="text-sm text-slate-400">No locations yet</p> : (
              <div className="space-y-2">
                {locations.map(loc => (
                  <div key={loc.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                    <div>
                      <p className="font-medium text-sm">{loc.name}</p>
                      <p className="text-xs text-slate-400">{loc.address}, {loc.city}</p>
                    </div>
                    <Badge variant="secondary">{loc._count?.lockers || 0} lockers</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Recent Parcels</CardTitle>
          </CardHeader>
          <CardContent>
            {recentParcels.length === 0 ? <p className="text-sm text-slate-400">No parcels yet</p> : (
              <div className="space-y-2">
                {recentParcels.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="font-medium text-sm">{p.trackingCode}</p>
                        <p className="text-xs text-slate-400">{p.customer?.name} &middot; {p.locker?.lockerNumber}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {parcelStatusBadge(p.status)}
                      <p className="text-xs text-slate-400 mt-1">{timeAgo(p.depositedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent SMS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Recent SMS Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSms.length === 0 ? <p className="text-sm text-slate-400">No SMS logs yet</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSms.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.customer?.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{s.type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>{smsStatusBadge(s.status)}</TableCell>
                    <TableCell className="text-xs text-slate-400">{timeAgo(s.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOCKERS TAB
// ═══════════════════════════════════════════════════════════════════
function LockersTab({ lockers, locations, loading, onRefresh, onLocationRefresh }: {
  lockers: Locker[]; locations: Location[]; loading: boolean; onRefresh: () => void; onLocationRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ lockerNumber: '', size: 'MEDIUM', locationId: '' });

  const filtered = lockers.filter(l => {
    if (filterLocation !== 'all' && l.locationId !== filterLocation) return false;
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    return true;
  });

  const handleAdd = async () => {
    try {
      await api('lockers', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Locker created');
      setShowAdd(false);
      setForm({ lockerNumber: '', size: 'MEDIUM', locationId: '' });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this locker?')) return;
    try {
      await api(`lockers?id=${id}`, { method: 'DELETE' });
      toast.success('Locker deleted');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api('lockers', { method: 'PUT', body: JSON.stringify({ id, status }) });
      toast.success('Status updated');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && lockers.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Filters & Actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="OCCUPIED">Occupied</SelectItem>
              <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
              <SelectItem value="OUT_OF_SERVICE">Out of Service</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <AddLocationDialog onCreated={onLocationRefresh} />
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Locker</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Locker</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Locker Number</Label><Input placeholder="e.g., A-01" value={form.lockerNumber} onChange={e => setForm(f => ({ ...f, lockerNumber: e.target.value }))} /></div>
                <div><Label>Size</Label><Select value={form.size} onValueChange={v => setForm(f => ({ ...f, size: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SMALL">Small</SelectItem><SelectItem value="MEDIUM">Medium</SelectItem><SelectItem value="LARGE">Large</SelectItem><SelectItem value="XLARGE">X-Large</SelectItem></SelectContent></Select></div>
                <div><Label>Location</Label><Select value={form.locationId} onValueChange={v => setForm(f => ({ ...f, locationId: v }))}><SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger><SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
                <Button onClick={handleAdd} disabled={!form.lockerNumber || !form.locationId} className="w-full">Create Locker</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Locker Grid */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No lockers found. Add a location and create some lockers.</Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map(l => {
            const statusColor = l.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50' : l.status === 'OCCUPIED' ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50';
            return (
              <Card key={l.id} className={`cursor-pointer hover:shadow-md transition-shadow border-2 ${statusColor}`}>
                <CardContent className="p-3 text-center">
                  <p className="font-bold text-lg">{l.lockerNumber}</p>
                  <Badge variant="outline" className="text-xs mt-1">{sizeLabel(l.size)}</Badge>
                  <div className="mt-2">{lockerStatusBadge(l.status)}</div>
                  {l.parcels && l.parcels.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1 truncate">{l.parcels[0].trackingCode}</p>
                  )}
                  <div className="mt-2 flex gap-1 justify-center">
                    {l.status !== 'OCCUPIED' && (
                      <Select onValueChange={v => handleStatusChange(l.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Set Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVAILABLE">Available</SelectItem>
                          <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                          <SelectItem value="OUT_OF_SERVICE">Out of Service</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(l.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Add Location Dialog
function AddLocationDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', city: '' });

  const handleCreate = async () => {
    try {
      await api('locations', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Location created');
      setOpen(false);
      setForm({ name: '', address: '', city: '' });
      onCreated();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Building2 className="w-4 h-4 mr-1" /> Add Location</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div><Label>Name</Label><Input placeholder="e.g., Downtown Hub" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Address</Label><Input placeholder="e.g., 123 Main St" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div><Label>City</Label><Input placeholder="e.g., New York" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <Button onClick={handleCreate} disabled={!form.name || !form.address} className="w-full">Create Location</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PARCELS TAB
// ═══════════════════════════════════════════════════════════════════
function ParcelsTab({ parcels, lockers, customers, locations, loading, onRefresh, onRefreshAll }: {
  parcels: Parcel[]; lockers: Locker[]; customers: Customer[]; locations: Location[]; loading: boolean; onRefresh: () => void; onRefreshAll: () => void;
}) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ trackingCode: '', description: '', lockerId: '', customerId: '', sendNotification: true });

  const availableLockers = lockers.filter(l => l.status === 'AVAILABLE');
  const filtered = parcels.filter(p => filterStatus === 'all' || p.status === filterStatus);

  const handleDeposit = async () => {
    try {
      await api('parcels', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Parcel deposited! SMS notification sent.');
      setShowDeposit(false);
      setForm({ trackingCode: '', description: '', lockerId: '', customerId: '', sendNotification: true });
      onRefreshAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCollect = async (id: string) => {
    try {
      await api('parcels', { method: 'PUT', body: JSON.stringify({ id, action: 'collect' }) });
      toast.success('Parcel collected! Storage fee processed.');
      onRefreshAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSendReminder = async (id: string) => {
    try {
      await api('parcels', { method: 'PUT', body: JSON.stringify({ id, action: 'sendReminder' }) });
      toast.success('Reminder SMS sent!');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleMarkOverdue = async (id: string) => {
    try {
      await api('parcels', { method: 'PUT', body: JSON.stringify({ id, action: 'markOverdue' }) });
      toast.success('Parcel marked overdue. SMS sent.');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && parcels.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DEPOSITED">Deposited</SelectItem>
            <SelectItem value="NOTIFIED">Notified</SelectItem>
            <SelectItem value="REMINDED">Reminded</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="COLLECTED">Collected</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Deposit Parcel</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Deposit New Parcel</DialogTitle><DialogDescription>Place a parcel into an available locker. SMS notification will be sent automatically.</DialogDescription></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Tracking Code</Label><Input placeholder="e.g., PKG-007" value={form.trackingCode} onChange={e => setForm(f => ({ ...f, trackingCode: e.target.value }))} /></div>
              <div><Label>Description</Label><Input placeholder="e.g., Amazon Package" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Customer</Label><Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone})</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Locker</Label><Select value={form.lockerId} onValueChange={v => setForm(f => ({ ...f, lockerId: v }))}><SelectTrigger><SelectValue placeholder="Select locker" /></SelectTrigger><SelectContent>{availableLockers.map(l => <SelectItem key={l.id} value={l.id}>{l.lockerNumber} - {sizeLabel(l.size)} ({locations.find(loc => loc.id === l.locationId)?.name})</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.sendNotification} onChange={e => setForm(f => ({ ...f, sendNotification: e.target.checked }))} className="rounded" />
                <Label className="text-sm">Send SMS notification to customer</Label>
              </div>
              <Button onClick={handleDeposit} disabled={!form.trackingCode || !form.lockerId || !form.customerId} className="w-full">
                <Package className="w-4 h-4 mr-1" /> Deposit &amp; Notify
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No parcels found</Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Locker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deposited</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><div><p className="font-medium">{p.trackingCode}</p><p className="text-xs text-slate-400">{p.description}</p></div></TableCell>
                    <TableCell>{p.customer?.name}</TableCell>
                    <TableCell><div><p>{p.locker?.lockerNumber}</p><p className="text-xs text-slate-400">{p.locker?.location?.name}</p></div></TableCell>
                    <TableCell>{parcelStatusBadge(p.status)}</TableCell>
                    <TableCell className="text-sm">{timeAgo(p.depositedAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.status !== 'COLLECTED' && p.status !== 'RETURNED' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleCollect(p.id)}><CheckCircle2 className="w-3 h-3 mr-1" /> Collect</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSendReminder(p.id)}><Bell className="w-3 h-3" /></Button>
                            {p.status !== 'OVERDUE' && (
                              <Button variant="ghost" size="sm" onClick={() => handleMarkOverdue(p.id)}><AlertTriangle className="w-3 h-3 text-red-400" /></Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CUSTOMERS TAB
// ═══════════════════════════════════════════════════════════════════
function CustomersTab({ customers, loading, onRefresh }: { customers: Customer[]; loading: boolean; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', balance: 0 });
  const [topUpCustomer, setTopUpCustomer] = useState<Customer | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');

  const handleAdd = async () => {
    try {
      await api('customers', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Customer added');
      setShowAdd(false);
      setForm({ name: '', phone: '', email: '', balance: 0 });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleTopUp = async () => {
    if (!topUpCustomer || !topUpAmount) return;
    try {
      await api('payments', { method: 'POST', body: JSON.stringify({ customerId: topUpCustomer.id, amount: parseFloat(topUpAmount), method: 'CASH', description: 'Balance top-up' }) });
      toast.success(`$${topUpAmount} added to ${topUpCustomer.name}'s balance`);
      setTopUpCustomer(null);
      setTopUpAmount('');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      await api(`customers?id=${id}`, { method: 'DELETE' });
      toast.success('Customer deleted');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && customers.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Name</Label><Input placeholder="John Doe" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input placeholder="+12125551234" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Email (optional)</Label><Input placeholder="john@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Initial Balance ($)</Label><Input type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: parseFloat(e.target.value) || 0 }))} /></div>
              <Button onClick={handleAdd} disabled={!form.name || !form.phone} className="w-full">Add Customer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Top Up Dialog */}
      <Dialog open={!!topUpCustomer} onOpenChange={() => setTopUpCustomer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Top Up Balance - {topUpCustomer?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-500">Current balance: <span className="font-bold">${topUpCustomer?.balance.toFixed(2)}</span></p>
            <div><Label>Amount ($)</Label><Input type="number" placeholder="25.00" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} /></div>
            <div className="flex gap-2">
              {[10, 25, 50, 100].map(amt => (
                <Button key={amt} variant="outline" size="sm" onClick={() => setTopUpAmount(String(amt))}>${amt}</Button>
              ))}
            </div>
            <Button onClick={handleTopUp} disabled={!topUpAmount} className="w-full"><Wallet className="w-4 h-4 mr-1" /> Top Up</Button>
          </div>
        </DialogContent>
      </Dialog>

      {customers.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No customers yet</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map(c => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold">{c.name}</p>
                    <p className="text-sm text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</p>
                    {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-600">${c.balance.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">balance</p>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="flex items-center justify-between">
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>{c._count?.parcels || 0} parcels</span>
                    <span>{c._count?.payments || 0} payments</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setTopUpCustomer(c)}><Wallet className="w-3 h-3 mr-1" /> Top Up</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                  </div>
                </div>
                {c.parcels && c.parcels.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs font-medium text-slate-500 mb-1">Active Parcels:</p>
                    {c.parcels.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span>{p.trackingCode}</span>
                        {parcelStatusBadge(p.status)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SMS TAB (Phase 2a)
// ═══════════════════════════════════════════════════════════════════
function SmsTab({ logs, customers, twilioConfigured, loading, onRefresh }: {
  logs: SmsLog[]; customers: Customer[]; twilioConfigured: boolean; loading: boolean; onRefresh: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [form, setForm] = useState({ customerId: '', message: '', type: 'CUSTOM' });
  const [sendingBulk, setSendingBulk] = useState(false);

  const handleSendCustom = async () => {
    try {
      await api('sms', { method: 'POST', body: JSON.stringify(form) });
      toast.success('SMS sent!');
      setShowCustom(false);
      setForm({ customerId: '', message: '', type: 'CUSTOM' });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkReminders = async () => {
    setSendingBulk(true);
    try {
      const result = await api('sms', { method: 'PUT', body: JSON.stringify({ action: 'sendBulkReminders' }) });
      toast.success(`Sent ${result.sent} reminders!`);
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    setSendingBulk(false);
  };

  if (loading && logs.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Twilio Status Banner */}
      <Card className={twilioConfigured ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {twilioConfigured ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <div>
              <p className="font-medium">{twilioConfigured ? 'Twilio Connected' : 'Twilio Not Configured'}</p>
              <p className="text-xs text-slate-500">
                {twilioConfigured
                  ? 'SMS messages will be sent via Twilio'
                  : 'SMS messages are being simulated. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env to enable real SMS.'}
              </p>
            </div>
          </div>
          <Badge variant={twilioConfigured ? 'default' : 'destructive'}>{twilioConfigured ? 'Live' : 'Simulated'}</Badge>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkReminders} disabled={sendingBulk}>
            {sendingBulk ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <BellRing className="w-4 h-4 mr-1" />}
            Send Bulk Reminders
          </Button>
        </div>
        <Dialog open={showCustom} onOpenChange={setShowCustom}>
          <DialogTrigger asChild><Button size="sm"><Send className="w-4 h-4 mr-1" /> Send Custom SMS</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Custom SMS</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Customer</Label><Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone})</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CUSTOM">Custom</SelectItem><SelectItem value="DEPOSIT_NOTIFICATION">Deposit Notification</SelectItem><SelectItem value="COLLECTION_REMINDER">Collection Reminder</SelectItem><SelectItem value="OVERDUE_NOTICE">Overdue Notice</SelectItem><SelectItem value="FEE_CHARGED">Fee Charged</SelectItem><SelectItem value="FEE_WARNING">Fee Warning</SelectItem></SelectContent></Select></div>
              <div><Label>Message</Label><Textarea rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Type your message..." /></div>
              <Button onClick={handleSendCustom} disabled={!form.customerId || !form.message} className="w-full"><Send className="w-4 h-4 mr-1" /> Send SMS</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* SMS Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SMS Activity Log</CardTitle>
          <CardDescription>{logs.length} messages logged</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-slate-400">No SMS logs yet. Deposit a parcel to trigger an automatic notification.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.customer?.name || log.to}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs whitespace-nowrap">{log.type.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{log.message}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {smsStatusBadge(log.status)}
                        {log.twilioSid && log.twilioSid.startsWith('SIM_') && <Badge variant="outline" className="text-xs">Sim</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FEES TAB (Phase 2b)
// ═══════════════════════════════════════════════════════════════════
function FeesTab({ fees, loading, onRefresh }: { fees: StorageFee[]; loading: boolean; onRefresh: () => void }) {
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState('all');

  const filtered = fees.filter(f => filter === 'all' || f.status === filter);
  const accumulatingFees = fees.filter(f => f.status === 'ACCUMULATING');
  const totalAccumulating = accumulatingFees.reduce((sum, f) => sum + (f.calculation?.totalFee || f.amount), 0);

  const handleProcessAutoCharges = async () => {
    setProcessing(true);
    try {
      const result = await api('fees', { method: 'POST', body: JSON.stringify({ action: 'processAutoCharges' }) });
      toast.success(`Processed ${result.processed} charges. Total: $${result.totalCharged.toFixed(2)}`);
      if (result.errors.length > 0) {
        result.errors.forEach((e: string) => toast.error(e));
      }
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    setProcessing(false);
  };

  const handleCharge = async (feeId: string) => {
    try {
      await api('fees', { method: 'POST', body: JSON.stringify({ action: 'charge', feeId }) });
      toast.success('Fee charged successfully! SMS notification sent.');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleWaive = async (feeId: string) => {
    try {
      await api('fees', { method: 'POST', body: JSON.stringify({ action: 'waive', feeId }) });
      toast.success('Fee waived');
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && fees.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Fee Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Accumulating Fees</p>
            <p className="text-2xl font-bold text-amber-600">${totalAccumulating.toFixed(2)}</p>
            <p className="text-xs text-slate-400">{accumulatingFees.length} parcels</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Collected</p>
            <p className="text-2xl font-bold text-emerald-600">${fees.filter(f => f.status === 'CHARGED').reduce((s, f) => s + f.amount, 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Waived</p>
            <p className="text-2xl font-bold text-slate-600">{fees.filter(f => f.status === 'WAIVED').length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <Button onClick={handleProcessAutoCharges} disabled={processing} className="w-full" variant={processing ? 'outline' : 'default'}>
              {processing ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-1" />}
              Process Auto-Charges
            </Button>
            <p className="text-xs text-slate-400 mt-1 text-center">Charge customers with sufficient balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Auto-Charge Info */}
      <Card className="border-violet-200 bg-violet-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-violet-600 mt-0.5" />
            <div>
              <p className="font-medium text-violet-900">Auto-Charge System</p>
              <p className="text-sm text-violet-700 mt-1">
                Parcels get {fees[0]?.freeHours || 24} hours of free storage. After that, fees accumulate at ${fees[0]?.ratePerHour || 0.50}/hour.
                When you click &quot;Process Auto-Charges&quot;, the system will charge customers who have sufficient balance for their accumulated fees.
                Customers without enough balance will continue accumulating fees until they top up.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Label className="text-sm">Filter:</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="ACCUMULATING">Accumulating</SelectItem>
            <SelectItem value="CHARGED">Charged</SelectItem>
            <SelectItem value="WAIVED">Waived</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {/* Fee Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-slate-400">No fees found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcel</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Free Hours</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Current Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{f.parcel?.trackingCode}</p>
                        <p className="text-xs text-slate-400">{f.parcel?.locker?.lockerNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell>{f.parcel?.customer?.name}</TableCell>
                    <TableCell>{f.freeHours}h</TableCell>
                    <TableCell>${f.ratePerHour}/h</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-bold">${(f.calculation?.totalFee || f.amount).toFixed(2)}</p>
                        {f.calculation && f.status === 'ACCUMULATING' && (
                          <p className="text-xs text-slate-400">{f.calculation.hoursStored.toFixed(1)}h stored</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {feeStatusBadge(f.status)}
                        {f.calculation?.isOverdue && f.status === 'ACCUMULATING' && (
                          <Badge variant="destructive" className="text-xs ml-1">Overdue</Badge>
                        )}
                        {f.calculation?.isApproachingLimit && f.status === 'ACCUMULATING' && (
                          <Badge variant="outline" className="text-xs ml-1">Expiring</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {f.status === 'ACCUMULATING' && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleCharge(f.id)} disabled={(f.calculation?.totalFee || 0) <= 0}>
                            <CreditCard className="w-3 h-3 mr-1" /> Charge
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleWaive(f.id)}>
                            Waive
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENTS TAB
// ═══════════════════════════════════════════════════════════════════
function PaymentsTab({ payments, customers, loading, onRefresh }: {
  payments: Payment[]; customers: Customer[]; loading: boolean; onRefresh: () => void;
}) {
  const [showTopUp, setShowTopUp] = useState(false);
  const [form, setForm] = useState({ customerId: '', amount: '', method: 'CASH', description: 'Balance top-up' });

  const totalRevenue = payments.filter(p => p.status === 'COMPLETED').reduce((s, p) => s + p.amount, 0);
  const storageFeePayments = payments.filter(p => p.description?.includes('Storage fee'));
  const topUpPayments = payments.filter(p => p.description?.includes('top-up'));

  const handleTopUp = async () => {
    try {
      await api('payments', { method: 'POST', body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
      toast.success('Payment recorded');
      setShowTopUp(false);
      setForm({ customerId: '', amount: '', method: 'CASH', description: 'Balance top-up' });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && payments.length === 0) return <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Revenue Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-600">${totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Storage Fee Revenue</p>
            <p className="text-2xl font-bold">${storageFeePayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Top-ups</p>
            <p className="text-2xl font-bold">${topUpPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Up Dialog */}
      <div className="flex justify-end">
        <Dialog open={showTopUp} onOpenChange={setShowTopUp}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Payment / Top Up</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Customer</Label><Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} (Balance: ${c.balance.toFixed(2)})</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Amount ($)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>Method</Label><Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="CARD">Card</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="BALANCE">Balance</SelectItem></SelectContent></Select></div>
              <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <Button onClick={handleTopUp} disabled={!form.customerId || !form.amount} className="w-full"><CreditCard className="w-4 h-4 mr-1" /> Record Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Payment Table */}
      <Card>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-center text-slate-400">No payments yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.customer?.name}</TableCell>
                    <TableCell className="font-bold">${p.amount.toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'COMPLETED' ? 'default' : p.status === 'FAILED' ? 'destructive' : 'secondary'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{p.description}</TableCell>
                    <TableCell className="text-xs text-slate-400">{formatDate(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
