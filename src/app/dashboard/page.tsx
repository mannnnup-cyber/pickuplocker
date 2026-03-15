"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Box,
  Package,
  Users,
  CreditCard,
  TrendingUp,
  Clock,
  Plus,
  Search,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Wifi,
  WifiOff,
  Lock,
  Database,
  Server,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Truck,
  Eye,
  DollarSign,
  Mail,
  Send,
  Zap,
  Copy,
  Key,
} from "lucide-react"

import { Suspense } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { AppLayout } from "@/components/app-sidebar"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/storage"
import { AuthGuard } from "@/components/auth-guard"
import { useAuth } from "@/hooks/useAuth"

// Types
interface Device {
  id: string
  deviceId: string
  name: string
  status: string
  location: string | null
  totalBoxes: number
  availableBoxes: number
  hasCredentials?: boolean
}

interface Order {
  id: string
  orderNumber: string
  trackingCode: string
  customerName: string
  customerPhone: string
  status: string
  storageDays: number
  storageFee: number
  deviceName?: string
  deviceId?: string
  bestwondDeviceId?: string
  boxNumber?: number
  createdAt: string
  currentStorageDays?: number
  currentStorageFee?: number
}

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  totalOrders: number
  activeOrders: number
}

interface Payment {
  id: string
  orderId: string
  customerName: string
  amount: number
  status: string
  method: string
  createdAt: string
}

interface Courier {
  id: string
  name: string
  code: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  status: string
  balance: number
  creditLimit: number
  autoReload: boolean
  autoReloadAmount: number | null
  minBalance: number | null
  _count?: { orders: number }
}

interface Stats {
  totalDevices: number
  totalBoxes: number
  availableBoxes: number
  totalOrders: number
  activeOrders: number
  totalRevenue: number
  todayRevenue: number
  pendingPayments: number
}

interface ServiceStatus {
  name: string
  status: 'online' | 'offline' | 'warning' | 'unknown'
  message: string
  latency?: number
  details?: Record<string, unknown>
}

interface SystemStatus {
  timestamp: string
  overallStatus: 'online' | 'degraded' | 'offline'
  totalLatency: number
  services: ServiceStatus[]
}

interface BoxInfo {
  boxNo: number
  status: 'EMPTY' | 'USED' | 'LOCKED'
  size?: string
}

// Mock data for fallback
const mockDevices = [
  { id: "1", deviceId: "2100012858", name: "UTech Campus Locker", status: "ONLINE", location: "UTech Campus, Kingston", totalBoxes: 24, availableBoxes: 18 },
  { id: "2", deviceId: "2100012859", name: "Main Office Locker", status: "ONLINE", location: "New Kingston", totalBoxes: 36, availableBoxes: 12 },
]

const mockOrders = [
  { id: "1", orderNumber: "DH-20250225-001", trackingCode: "123456", customerName: "John Brown", customerPhone: "876-555-0101", status: "STORED", storageDays: 2, storageFee: 0, deviceName: "UTech Campus Locker", boxNumber: 5, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "2", orderNumber: "DH-20250224-003", trackingCode: "789012", customerName: "Sarah Jones", customerPhone: "876-555-0202", status: "STORED", storageDays: 5, storageFee: 200, deviceName: "Main Office Locker", boxNumber: 12, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
]

const mockCustomers = [
  { id: "1", name: "John Brown", email: "john.b@email.com", phone: "876-555-0101", totalOrders: 5, activeOrders: 1 },
  { id: "2", name: "Sarah Jones", email: "sarah.j@email.com", phone: "876-555-0202", totalOrders: 12, activeOrders: 1 },
]

const mockPayments = [
  { id: "1", orderId: "DH-20250224-003", customerName: "Sarah Jones", amount: 200, status: "COMPLETED", method: "CARD", createdAt: new Date().toISOString() },
]

const mockCouriers = [
  { id: "1", name: "Knutsford Express", code: "KE", contactPerson: "John Smith", phone: "876-555-1000", email: "logistics@knutsford.com", status: "ACTIVE", balance: 5000, creditLimit: 10000, autoReload: true, autoReloadAmount: 2000, minBalance: 1000, _count: { orders: 45 } },
  { id: "2", name: "ZipMail", code: "ZM", contactPerson: "Jane Doe", phone: "876-555-2000", email: "support@zipmail.com", status: "ACTIVE", balance: 2500, creditLimit: 5000, autoReload: false, autoReloadAmount: null, minBalance: null, _count: { orders: 23 } },
]

// Stats cards component
function StatsCards({ stats }: { stats: Stats | null }) {
  const displayStats = [
    { 
      title: "Lockers", 
      value: stats?.totalDevices ?? 2, 
      subtext: "Active locations", 
      icon: Box,
      iconBg: "bg-blue-500",
      change: "+0"
    },
    { 
      title: "Available Boxes", 
      value: `${stats?.availableBoxes ?? 30}/${stats?.totalBoxes ?? 60}`, 
      subtext: "Ready for use", 
      icon: Package,
      iconBg: "bg-green-500",
      change: `${Math.round(((stats?.availableBoxes ?? 30) / (stats?.totalBoxes ?? 60)) * 100)}%`
    },
    { 
      title: "Active Orders", 
      value: stats?.activeOrders ?? 4, 
      subtext: "Packages stored", 
      icon: Clock,
      iconBg: "bg-[#FFD439]",
      change: "+0 today"
    },
    { 
      title: "Revenue", 
      value: `$${(stats?.todayRevenue ?? 0).toLocaleString()}`, 
      subtext: "JMD today", 
      icon: TrendingUp,
      iconBg: "bg-purple-500",
      change: `${stats?.pendingPayments ?? 0} pending`
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {displayStats.map((stat) => (
        <Card key={stat.title} className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.title}</p>
                <p className="text-2xl font-bold text-[#111111] mt-1">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.subtext}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${stat.iconBg}`}>
                <stat.icon className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Recent activity component
function RecentActivity({ activities }: { activities: Array<{id: string; action: string; description: string | null; userName?: string; time: string}> }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60)
    if (diff < 60) return `${diff} mins ago`
    if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`
    return `${Math.floor(diff / 1440)} days ago`
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-[#111111] uppercase">Recent Activity</CardTitle>
        <CardDescription className="text-gray-500">Latest events across all devices</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No recent activity</p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <div className="rounded-full bg-[#FFD439] p-2">
                  <Package className="h-4 w-4 text-[#111111]" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-[#111111]">{activity.action.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-500">{activity.description || activity.userName || ''}</p>
                </div>
                <div className="text-sm text-gray-500">{formatTime(activity.time)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// System Status component
function SystemStatusCard() {
  const [status, setStatus] = React.useState<SystemStatus | null>(null)
  const [loading, setLoading] = React.useState(true)

  const fetchStatus = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      setStatus(data)
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const getStatusIcon = (statusType: string) => {
    switch (statusType) {
      case 'online': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'offline': return <XCircle className="h-4 w-4 text-red-500" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default: return <AlertTriangle className="h-4 w-4 text-gray-500" />
    }
  }

  const getServiceIcon = (name: string) => {
    switch (name) {
      case 'Database': return <Database className="h-4 w-4" />
      case 'Bestwond Lockers': return <Lock className="h-4 w-4" />
      case 'DimePay': return <CreditCard className="h-4 w-4" />
      case 'TextBee SMS': return <MessageSquare className="h-4 w-4" />
      case 'Email SMTP': return <Mail className="h-4 w-4" />
      default: return <Server className="h-4 w-4" />
    }
  }

  const getOverallStatusBadge = () => {
    if (!status) return null
    const styles = {
      online: 'bg-green-500 text-white',
      degraded: 'bg-yellow-500 text-white',
      offline: 'bg-red-500 text-white'
    }
    return (
      <Badge className={styles[status.overallStatus]}>
        {status.overallStatus.toUpperCase()}
      </Badge>
    )
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-[#111111] uppercase text-base">System Status</CardTitle>
          {status && getOverallStatusBadge()}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchStatus} className="h-8 w-8 p-0">
          <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !status ? (
          <div className="text-center py-4 text-gray-500">Checking connections...</div>
        ) : (
          <div className="space-y-2">
            {status?.services.map((service) => (
              <div key={service.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <div className={`rounded-full p-1.5 ${
                    service.status === 'online' ? 'bg-green-100' :
                    service.status === 'offline' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    {getServiceIcon(service.name)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#111111]">{service.name}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[120px]">{service.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {service.latency && (
                    <span className="text-xs text-gray-500">{service.latency}ms</span>
                  )}
                  {getStatusIcon(service.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Locker Sync Widget - Shows sync status and allows manual sync
function LockerSyncWidget() {
  const [syncData, setSyncData] = React.useState<{
    devices: Array<{
      deviceId: string;
      name: string;
      status: string;
      totalBoxes: number;
      availableBoxes: number;
      sync: {
        lastSyncAt: string | null;
        syncStatus: string;
        deviceOnline: boolean;
        usedBoxes: number;
      } | null;
    }>;
    lastSync: string | null;
  } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)
  const [syncResult, setSyncResult] = React.useState<{success: boolean; message: string} | null>(null)

  const fetchSyncData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sync')
      const data = await res.json()
      if (data.success) {
        setSyncData(data)
      }
    } catch (error) {
      console.error('Failed to fetch sync data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSync = React.useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSyncResult({ success: true, message: `Synced ${data.synced}/${data.total} devices (${data.latency}ms)` })
        fetchSyncData()
      } else {
        setSyncResult({ success: false, message: data.error || 'Sync failed' })
      }
    } catch (error) {
      setSyncResult({ success: false, message: 'Failed to sync' })
    } finally {
      setSyncing(false)
    }
  }, [fetchSyncData])

  React.useEffect(() => {
    fetchSyncData()
    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchSyncData, 120000)
    return () => clearInterval(interval)
  }, [fetchSyncData])

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60)
    if (diff < 1) return 'Just now'
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return `${Math.floor(diff / 1440)}d ago`
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[#111111] uppercase text-base">Locker Sync</CardTitle>
        <div className="flex items-center gap-2">
          {syncData?.lastSync && (
            <span className="text-xs text-gray-500">Last: {formatTimeAgo(syncData.lastSync)}</span>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleSync} 
            disabled={syncing}
            className="h-8 bg-[#FFD439] hover:bg-[#FFD439]/90 text-[#111111] font-bold uppercase"
          >
            {syncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-1 h-4 w-4" />
                Sync
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !syncData ? (
          <div className="text-center py-4 text-gray-500">Loading sync status...</div>
        ) : syncData?.devices && syncData.devices.length > 0 ? (
          <div className="space-y-2">
            {syncData.devices.slice(0, 3).map((device) => (
              <div 
                key={device.deviceId} 
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    device.sync?.deviceOnline ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-[#111111]">{device.name || device.deviceId}</p>
                    <p className="text-xs text-gray-500">
                      {device.availableBoxes}/{device.totalBoxes} available
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={
                    device.sync?.syncStatus === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                    device.sync?.syncStatus === 'FAILED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }>
                    {device.sync?.syncStatus || 'PENDING'}
                  </Badge>
                  {device.sync?.lastSyncAt && (
                    <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(device.sync.lastSyncAt)}</p>
                  )}
                </div>
              </div>
            ))}
            {syncResult && (
              <div className={`p-2 rounded text-sm ${
                syncResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {syncResult.success ? '✓' : '✗'} {syncResult.message}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No devices configured</div>
        )}
      </CardContent>
    </Card>
  )
}

// Locker Details Card - Shows device metadata and box status
function LockerDetailsCard() {
  const [lockerData, setLockerData] = React.useState<{
    online: boolean
    deviceId: string
    totalBoxes: number
    emptyBoxes: number
    usedBoxes: number
    boxes: BoxInfo[]
    latency: number
  } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchLockerData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lockers?action=status')
      const data = await res.json()
      if (data.success && data.data) {
        setLockerData({
          online: data.data.online ?? true,
          deviceId: data.data.deviceId || process.env.NEXT_PUBLIC_DEVICE_ID || '2100012858',
          totalBoxes: data.data.totalBoxes || data.data.boxes?.length || 24,
          emptyBoxes: data.data.emptyBoxes || 0,
          usedBoxes: data.data.usedBoxes || 0,
          boxes: data.data.boxes || [],
          latency: data.latency || 0
        })
      } else {
        // Fallback - try status endpoint for Bestwond data
        const statusRes = await fetch('/api/status')
        const statusData = await statusRes.json()
        const bestwondService = statusData?.services?.find((s: ServiceStatus) => s.name === 'Bestwond Lockers')
        if (bestwondService?.details) {
          setLockerData({
            online: bestwondService.details.online as boolean ?? true,
            deviceId: String(bestwondService.details.device_id || '2100012858'),
            totalBoxes: (bestwondService.details.total_boxes as number) || (bestwondService.details.box_count as number) || 24,
            emptyBoxes: (bestwondService.details.empty_boxes as number) || 18,
            usedBoxes: (bestwondService.details.used_boxes as number) || 6,
            boxes: (bestwondService.details.box_preview as BoxInfo[]) || [],
            latency: bestwondService.latency || 0
          })
        } else {
          setError('No locker data available')
        }
      }
    } catch (err) {
      console.error('Failed to fetch locker data:', err)
      setError('Failed to connect to locker')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchLockerData()
    const interval = setInterval(fetchLockerData, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [fetchLockerData])

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-[#111111] uppercase text-base">Locker Details</CardTitle>
          {lockerData && (
            <Badge className={lockerData.online ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}>
              {lockerData.online ? 'ONLINE' : 'OFFLINE'}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchLockerData} className="h-8 w-8 p-0">
          <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !lockerData ? (
          <div className="text-center py-4 text-gray-500">Fetching locker data...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : lockerData ? (
          <div className="space-y-4">
            {/* Device Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase">Device ID</p>
                <p className="font-mono text-[#111111]">{lockerData.deviceId}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Response</p>
                <p className="text-[#111111]">{lockerData.latency}ms</p>
              </div>
            </div>
            
            {/* Box Stats */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{lockerData.emptyBoxes}</p>
                <p className="text-xs text-gray-500 uppercase">Empty</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-2xl font-bold text-[#FFD439]">{lockerData.usedBoxes}</p>
                <p className="text-xs text-gray-500 uppercase">Used</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-2xl font-bold text-[#111111]">{lockerData.totalBoxes}</p>
                <p className="text-xs text-gray-500 uppercase">Total</p>
              </div>
            </div>

            {/* Box Grid Preview */}
            {lockerData.boxes && lockerData.boxes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">Box Status</p>
                <div className="grid grid-cols-6 gap-1">
                  {lockerData.boxes.slice(0, 24).map((box) => (
                    <div
                      key={box.boxNo}
                      className={`aspect-square rounded text-[10px] flex items-center justify-center font-bold ${
                        box.status === 'EMPTY' 
                          ? 'bg-green-100 text-green-700 border border-green-200' 
                          : box.status === 'USED'
                          ? 'bg-[#FFD439] text-[#111111] border border-[#E5BE33]'
                          : 'bg-gray-200 text-gray-500 border border-gray-300'
                      }`}
                      title={`Box ${box.boxNo}: ${box.status}`}
                    >
                      {box.boxNo}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-100 border border-green-200" />
                    <span>Empty</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[#FFD439] border border-[#E5BE33]" />
                    <span>Used</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-gray-200 border border-gray-300" />
                    <span>Locked</span>
                  </div>
                </div>
              </div>
            )}

            {/* Capacity Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Capacity</span>
                <span className="font-medium text-[#111111]">
                  {Math.round((lockerData.usedBoxes / lockerData.totalBoxes) * 100)}% used
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div 
                  className="h-2 rounded-full bg-[#FFD439] transition-all" 
                  style={{ width: `${lockerData.totalBoxes > 0 ? (lockerData.usedBoxes / lockerData.totalBoxes) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Quick actions component
function QuickActions({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-[#111111] uppercase">Quick Actions</CardTitle>
        <CardDescription className="text-gray-500">Common operations</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button className="w-full justify-start bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={() => onNavigate("orders")}>
          <Plus className="mr-2 h-4 w-4" />
          New Drop-off
        </Button>
        <Button className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-100 font-bold uppercase" variant="outline">
          <QrCode className="mr-2 h-4 w-4" />
          Scan Pickup Code
        </Button>
        <Button className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-100 uppercase" variant="outline" onClick={() => onNavigate("devices")}>
          <Lock className="mr-2 h-4 w-4" />
          Open Box Manually
        </Button>
        <Button className="w-full justify-start border-gray-300 text-gray-700 hover:bg-gray-100 uppercase" variant="outline" onClick={() => onNavigate("orders")}>
          <Search className="mr-2 h-4 w-4" />
          Search Orders
        </Button>
      </CardContent>
    </Card>
  )
}

// Dashboard content
function DashboardContent({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [activities, setActivities] = React.useState<Array<{id: string; action: string; description: string | null; userName?: string; time: string}>>([])
  const [loading, setLoading] = React.useState(true)

  const fetchData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      if (data.success) {
        setStats(data.data.stats)
        setActivities(data.data.recentActivities)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      setStats({
        totalDevices: 2,
        totalBoxes: 60,
        availableBoxes: 30,
        totalOrders: 4,
        activeOrders: 4,
        totalRevenue: 12500,
        todayRevenue: 12500,
        pendingPayments: 2
      })
      setActivities([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Dashboard
          </h2>
          <p className="text-gray-500 text-sm">Overview of your Pickup smart locker system</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={fetchData} 
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={() => onNavigate('orders')} 
            className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Drop-off
          </Button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <StatsCards stats={stats} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Actions Bar */}
          <div className="bg-[#111111] rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-white">
                <Zap className="h-5 w-5 text-[#FFD439]" />
                <span className="font-bold uppercase text-sm">Quick Actions</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button 
                  size="sm" 
                  onClick={() => onNavigate('orders')}
                  className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold"
                >
                  <Plus className="mr-1 h-3 w-3" /> Drop-off
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onNavigate('express')}
                  className="border-white text-white hover:bg-white hover:text-[#111111]"
                >
                  <Key className="mr-1 h-3 w-3" /> Express Code
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onNavigate('devices')}
                  className="border-white text-white hover:bg-white hover:text-[#111111]"
                >
                  <Lock className="mr-1 h-3 w-3" /> Open Box
                </Button>
              </div>
            </div>
          </div>

          {/* Locker Status Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <LockerDetailsCard />
            <SystemStatusCard />
          </div>

          {/* Recent Activity */}
          <RecentActivity activities={activities} />
        </div>

        {/* Right Column - Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <LockerSyncWidget />
          
          {/* Today's Summary Card */}
          <Card className="bg-gradient-to-br from-[#111111] to-gray-900 border-0 text-white">
            <CardHeader>
              <CardTitle className="text-white uppercase text-sm">Today's Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-[#FFD439]" />
                  <span className="text-sm text-gray-300">Packages Stored</span>
                </div>
                <span className="text-2xl font-bold">{stats?.activeOrders ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[#FFD439]" />
                  <span className="text-sm text-gray-300">Pickups Today</span>
                </div>
                <span className="text-2xl font-bold">0</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-[#FFD439]" />
                  <span className="text-sm text-gray-300">Revenue</span>
                </div>
                <span className="text-2xl font-bold">${(stats?.todayRevenue ?? 0).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-gray-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Pending Payments</span>
                  <Badge className="bg-[#FFD439] text-[#111111] font-bold">
                    {stats?.pendingPayments ?? 0}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Devices content
// Box with order info
interface BoxWithOrder {
  boxNumber: number
  status: string
  size?: string | null
  lastUsedAt?: string | null
  order?: {
    id: string
    orderNumber: string
    trackingCode: string
    customerName: string
    customerPhone: string
    status: string
    createdAt: string
  } | null
}

function DevicesContent() {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [loading, setLoading] = React.useState(true)
  const [openBoxDialog, setOpenBoxDialog] = React.useState(false)
  const [addDeviceDialog, setAddDeviceDialog] = React.useState(false)
  const [editDeviceDialog, setEditDeviceDialog] = React.useState(false)
  const [deleteDeviceDialog, setDeleteDeviceDialog] = React.useState(false)
  const [viewBoxesDialog, setViewBoxesDialog] = React.useState(false)
  const [selectedDevice, setSelectedDevice] = React.useState<Device | null>(null)
  const [selectedBox, setSelectedBox] = React.useState<string>("")
  const [openingBox, setOpeningBox] = React.useState(false)
  const [openBoxResult, setOpenBoxResult] = React.useState<{success: boolean; message: string} | null>(null)
  const [newDevice, setNewDevice] = React.useState({ deviceId: '', name: '', location: '', totalBoxes: 24, bestwondAppId: '', bestwondAppSecret: '' })
  const [editDevice, setEditDevice] = React.useState({ id: '', name: '', location: '', bestwondAppId: '', bestwondAppSecret: '' })
  const [boxes, setBoxes] = React.useState<BoxWithOrder[]>([])
  const [loadingBoxes, setLoadingBoxes] = React.useState(false)
  const [syncingDevice, setSyncingDevice] = React.useState<string | null>(null)
  const [selectedBoxInfo, setSelectedBoxInfo] = React.useState<BoxWithOrder | null>(null)
  const [boxDetailDialog, setBoxDetailDialog] = React.useState(false)
  const [verifyingDevice, setVerifyingDevice] = React.useState(false)
  const [verifiedDevice, setVerifiedDevice] = React.useState<{deviceId: string; online: boolean; totalBoxes: number; availableBoxes: number} | null>(null)
  const [verifyError, setVerifyError] = React.useState<string | null>(null)
  const [syncResult, setSyncResult] = React.useState<{synced: boolean; boxesUpdated: number; deviceOnline: boolean | null} | null>(null)
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null)
  const [boxLogs, setBoxLogs] = React.useState<Array<{id: string; boxNumber: number; action: string; orderNo: string | null; occurredAt: string}>>([])
  const [loadingLogs, setLoadingLogs] = React.useState(false)
  const [logsDialog, setLogsDialog] = React.useState(false)
  
  // Device discovery states
  const [discoveringDevices, setDiscoveringDevices] = React.useState(false)
  const [discoveredDevices, setDiscoveredDevices] = React.useState<Array<{device_number: string; online?: boolean; box_count?: number}>>([])
  const [discoverError, setDiscoverError] = React.useState<string | null>(null)

  const fetchDevices = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      if (data.success && data.data.length > 0) {
        setDevices(data.data)
      } else {
        setDevices(mockDevices)
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error)
      setDevices(mockDevices)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Discover devices registered to Bestwond account
  const handleDiscoverDevices = async () => {
    if (!newDevice.bestwondAppId || !newDevice.bestwondAppSecret) {
      setDiscoverError('Please enter App ID and App Secret first')
      return
    }

    setDiscoveringDevices(true)
    setDiscoverError(null)
    setDiscoveredDevices([])

    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'device-list',
          app_id: newDevice.bestwondAppId,
          app_secret: newDevice.bestwondAppSecret
        })
      })
      const data = await res.json()

      if (data.success && data.devices) {
        setDiscoveredDevices(data.devices)
        if (data.devices.length === 0) {
          setDiscoverError('No devices found for this account. Enter device ID manually.')
        }
      } else {
        setDiscoverError(data.error || 'Failed to discover devices. Check your credentials.')
      }
    } catch (error) {
      console.error('Failed to discover devices:', error)
      setDiscoverError('Failed to connect to Bestwond API')
    } finally {
      setDiscoveringDevices(false)
    }
  }

  // Select a discovered device
  const handleSelectDiscoveredDevice = async (deviceNumber: string) => {
    setNewDevice(prev => ({ ...prev, deviceId: deviceNumber }))
    setVerifiedDevice(null)
    setVerifyError(null)
    // Auto-verify after a short delay
    setTimeout(() => {
      handleVerifyDevice()
    }, 500)
  }

  // Auto-verify device ID after user stops typing (debounced)
  // Only auto-verify if credentials are provided or global credentials exist
  React.useEffect(() => {
    if (!newDevice.deviceId || newDevice.deviceId.length < 8) {
      return // Don't auto-verify if too short or empty
    }

    // Only verify if we have credentials (either provided or will use global)
    const timeoutId = setTimeout(() => {
      handleVerifyDevice()
    }, 1200) // Wait 1.2s after user stops typing

    return () => clearTimeout(timeoutId)
  }, [newDevice.deviceId, newDevice.bestwondAppId, newDevice.bestwondAppSecret])

  const handleOpenBox = async () => {
    if (!selectedDevice || !selectedBox) {
      setOpenBoxResult({ success: false, message: 'Please select a device and enter a box number' })
      return
    }

    setOpeningBox(true)
    setOpenBoxResult(null)

    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          deviceId: selectedDevice.deviceId,
          boxNo: parseInt(selectedBox)
        })
      })
      const data = await res.json()

      if (data.success) {
        setOpenBoxResult({ success: true, message: data.message || `Box #${selectedBox} opened successfully!` })
        setTimeout(() => {
          setOpenBoxDialog(false)
          setSelectedBox('')
          setOpenBoxResult(null)
        }, 2000)
      } else {
        setOpenBoxResult({ success: false, message: data.error || 'Failed to open box' })
      }
    } catch (error) {
      console.error('Failed to open box:', error)
      setOpenBoxResult({ success: false, message: error instanceof Error ? error.message : 'Failed to open box' })
    } finally {
      setOpeningBox(false)
    }
  }

  const handleVerifyDevice = async () => {
    if (!newDevice.deviceId) {
      setVerifyError('Please enter a device ID')
      return
    }

    setVerifyingDevice(true)
    setVerifyError(null)
    setVerifiedDevice(null)

    try {
      const res = await fetch('/api/devices/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: newDevice.deviceId,
          bestwondAppId: newDevice.bestwondAppId || undefined,
          bestwondAppSecret: newDevice.bestwondAppSecret || undefined,
        })
      })
      const data = await res.json()

      if (data.success) {
        setVerifiedDevice(data.device)
        // Auto-fill total boxes and name from API
        setNewDevice(prev => ({
          ...prev,
          totalBoxes: data.device.totalBoxes,
          name: data.device.deviceName || prev.name || `Locker ${data.device.deviceId}`
        }))
      } else {
        setVerifyError(data.error || 'Device verification failed')
      }
    } catch (error) {
      console.error('Failed to verify device:', error)
      setVerifyError('Failed to verify device. Check API configuration.')
    } finally {
      setVerifyingDevice(false)
    }
  }

  const handleAddDevice = async () => {
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDevice)
      })
      const data = await res.json()
      if (data.success) {
        setAddDeviceDialog(false)
        setNewDevice({ deviceId: '', name: '', location: '', totalBoxes: 24, bestwondAppId: '', bestwondAppSecret: '' })
        setVerifiedDevice(null)
        setVerifyError(null)
        fetchDevices()
      } else {
        alert(data.error || 'Failed to add device')
      }
    } catch (error) {
      console.error('Failed to add device:', error)
      alert(error instanceof Error ? error.message : 'Failed to add device')
    }
  }

  const handleEditDevice = async () => {
    try {
      const res = await fetch('/api/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDevice)
      })
      const data = await res.json()
      if (data.success) {
        setEditDeviceDialog(false)
        setEditDevice({ id: '', name: '', location: '', bestwondAppId: '', bestwondAppSecret: '' })
        fetchDevices()
      } else {
        alert(data.error || 'Failed to update device')
      }
    } catch (error) {
      console.error('Failed to update device:', error)
      alert('Failed to update device')
    }
  }

  const handleDeleteDevice = async () => {
    if (!selectedDevice) return

    try {
      const res = await fetch(`/api/devices?id=${selectedDevice.id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setDeleteDeviceDialog(false)
        setSelectedDevice(null)
        fetchDevices()
      } else {
        alert(data.error || 'Failed to delete device')
      }
    } catch (error) {
      console.error('Failed to delete device:', error)
      alert('Failed to delete device')
    }
  }

  const handleViewBoxes = async (device: Device, sync: boolean = false) => {
    setSelectedDevice(device)
    setLoadingBoxes(true)
    setViewBoxesDialog(true)
    setSyncResult(null)
    setSyncMessage(null)

    try {
      const res = await fetch(`/api/devices/${device.id}/boxes?sync=${sync}`)
      const data = await res.json()
      if (data.success) {
        setBoxes(data.boxes)
        if (sync && data.syncResult) {
          setSyncResult(data.syncResult)
          if (data.syncResult.synced) {
            setSyncMessage(`✓ Synced! ${data.syncResult.boxesUpdated} boxes updated. Device ${data.syncResult.deviceOnline ? 'online' : 'offline'}.`)
          } else if (data.syncResult.error) {
            setSyncMessage(`✗ Sync failed: ${data.syncResult.error}`)
          } else {
            setSyncMessage(`✗ Sync failed - no response from device`)
          }
        } else if (sync) {
          setSyncMessage(`✗ Sync failed - check device credentials`)
        }
      } else {
        setBoxes([])
        if (sync) {
          setSyncMessage(`✗ Sync failed: ${data.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Failed to fetch boxes:', error)
      setBoxes([])
      if (sync) {
        setSyncMessage(`✗ Sync failed: Network error`)
      }
    } finally {
      setLoadingBoxes(false)
    }
  }

  const handleSyncDevice = async (device: Device) => {
    setSyncingDevice(device.id)
    try {
      const res = await fetch(`/api/devices/${device.id}/boxes?sync=true`)
      const data = await res.json()
      if (data.success) {
        // Update device in list
        const availableCount = data.boxes?.filter((b: BoxWithOrder) => b.status === 'AVAILABLE').length || 0
        setDevices(prev => prev.map(d =>
          d.id === device.id
            ? { 
                ...d, 
                status: data.syncResult?.deviceOnline ? 'ONLINE' : 'OFFLINE',
                availableBoxes: availableCount
              }
            : d
        ))
        // Show result
        if (data.syncResult?.synced) {
          alert(`✓ Synced! ${data.syncResult.boxesUpdated} boxes updated. Device ${data.syncResult.deviceOnline ? 'online' : 'offline'}.`)
        } else if (data.syncResult?.error) {
          alert(`✗ Sync failed: ${data.syncResult.error}`)
        }
      }
    } catch (error) {
      console.error('Failed to sync device:', error)
      alert('Failed to sync device')
    } finally {
      setSyncingDevice(null)
    }
  }

  const handleOpenBoxFromGrid = async (boxNumber: number) => {
    if (!selectedDevice) return

    setOpeningBox(true)
    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          deviceId: selectedDevice.deviceId,
          boxNo: boxNumber
        })
      })
      const data = await res.json()

      if (data.success) {
        alert(`Box #${boxNumber} opened successfully!`)
      } else {
        alert(data.error || 'Failed to open box')
      }
    } catch (error) {
      console.error('Failed to open box:', error)
      alert('Failed to open box')
    } finally {
      setOpeningBox(false)
    }
  }

  const handleViewLogs = async (deviceId: string, boxNumber?: number) => {
    setLoadingLogs(true)
    setLogsDialog(true)
    try {
      const url = boxNumber 
        ? `/api/devices/${deviceId}/logs?boxNumber=${boxNumber}&limit=50`
        : `/api/devices/${deviceId}/logs?limit=50`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setBoxLogs(data.logs || [])
      } else {
        setBoxLogs([])
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      setBoxLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Devices</h2>
          <p className="text-gray-500">Manage your smart locker devices</p>
        </div>
        <Button onClick={() => setAddDeviceDialog(true)} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase">
          <Plus className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading devices...</div>
      ) : devices.length === 0 ? (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="py-8 text-center text-gray-500">
            No devices found. Add your first locker device to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <Card key={device.id} className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-[#111111] uppercase">
                    {device.name}
                    <Badge className={device.status === "ONLINE" ? "bg-[#FFD439] text-[#111111] ml-2" : "bg-red-500 text-white ml-2"}>
                      {device.status === "ONLINE" ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
                      {device.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 text-gray-500">{device.location || 'No location set'}</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleSyncDevice(device)}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${syncingDevice === device.id ? 'animate-spin' : ''}`} />
                      Sync Status
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setEditDevice({ id: device.id, name: device.name, location: device.location || '', bestwondAppId: '', bestwondAppSecret: '' }); setSelectedDevice(device); setEditDeviceDialog(true); }}>
                      Edit Device
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => { setSelectedDevice(device); setDeleteDeviceDialog(true); }}>
                      Delete Device
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Device ID</p>
                    <p className="font-mono text-[#111111]">{device.deviceId}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Boxes</p>
                    <p className="font-medium text-[#111111]">{device.availableBoxes} / {device.totalBoxes} available</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  {device.hasCredentials ? (
                    <Badge className="bg-green-100 text-green-700 text-xs"><Shield className="mr-1 h-3 w-3" />Custom API Credentials</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 text-xs">Using Global Credentials</Badge>
                  )}
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-[#FFD439]" style={{ width: `${device.totalBoxes > 0 ? (device.availableBoxes / device.totalBoxes) * 100 : 0}%` }} />
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline" size="sm" className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-100 uppercase" onClick={() => handleViewBoxes(device)}>
                  <Eye className="mr-1 h-3 w-3" />
                  View Boxes
                </Button>
                <Button size="sm" className="flex-1 bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={() => { setSelectedDevice(device); setOpenBoxDialog(true) }}>
                  Open Box
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Open Box Dialog */}
      <Dialog open={openBoxDialog} onOpenChange={setOpenBoxDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Open Box</DialogTitle>
            <DialogDescription className="text-gray-500">Select a box to open remotely via Bestwond API</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Device</Label>
              <Select value={selectedDevice?.deviceId || ""} onValueChange={(val) => setSelectedDevice(devices.find(d => d.deviceId === val) || null)}>
                <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {devices.filter(d => d.status === "ONLINE").map(d => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>{d.name} ({d.deviceId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Box Number</Label>
              <Input type="number" placeholder="Enter box number (e.g., 1, 2, 3...)" className="border-gray-200" value={selectedBox} onChange={(e) => setSelectedBox(e.target.value)} />
            </div>
            {openBoxResult && (
              <div className={`p-3 rounded-lg ${openBoxResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {openBoxResult.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => { setOpenBoxDialog(false); setOpenBoxResult(null); setSelectedBox(''); setSelectedDevice(null); }}>Cancel</Button>
            <Button
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
              onClick={handleOpenBox}
              disabled={openingBox || !selectedDevice || !selectedBox}
            >
              {openingBox ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Opening...
                </>
              ) : (
                'Open Box'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={addDeviceDialog} onOpenChange={(open) => { 
        setAddDeviceDialog(open); 
        if (!open) { 
          setVerifiedDevice(null); 
          setVerifyError(null); 
          setDiscoveredDevices([]);
          setDiscoverError(null);
        } 
      }}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Add New Device</DialogTitle>
            <DialogDescription className="text-gray-500">Enter your Bestwond credentials to discover devices linked to your account</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto">
            {/* Bestwond Credentials Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-[#111111]" />
                <Label className="text-[#111111] font-medium text-sm">Bestwond API Credentials</Label>
              </div>
              <p className="text-xs text-gray-500 mb-3">Enter your Bestwond App ID and Secret to discover devices linked to your account.</p>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-[#111111] uppercase text-xs">App ID</Label>
                  <Input 
                    placeholder="e.g., bw_86b83996147111f" 
                    className="border-gray-200 bg-white text-sm" 
                    value={newDevice.bestwondAppId} 
                    onChange={(e) => { 
                      setNewDevice({...newDevice, bestwondAppId: e.target.value}); 
                      setVerifiedDevice(null); 
                      setVerifyError(null);
                      setDiscoveredDevices([]);
                    }} 
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[#111111] uppercase text-xs">App Secret</Label>
                  <Input 
                    type="password"
                    placeholder="Enter App Secret" 
                    className="border-gray-200 bg-white text-sm" 
                    value={newDevice.bestwondAppSecret} 
                    onChange={(e) => { 
                      setNewDevice({...newDevice, bestwondAppSecret: e.target.value}); 
                      setVerifiedDevice(null); 
                      setVerifyError(null);
                      setDiscoveredDevices([]);
                    }} 
                  />
                </div>
                <Button 
                  className="w-full bg-[#111111] text-white hover:bg-gray-800 uppercase text-sm"
                  onClick={handleDiscoverDevices}
                  disabled={discoveringDevices || !newDevice.bestwondAppId || !newDevice.bestwondAppSecret}
                >
                  {discoveringDevices ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Discover Devices
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Discovered Devices List */}
            {discoveredDevices.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-blue-800 font-medium text-sm mb-2">✓ Found {discoveredDevices.length} device(s) linked to your account:</p>
                <div className="grid gap-2 max-h-32 overflow-y-auto">
                  {discoveredDevices.map((device) => (
                    <button
                      key={device.device_number}
                      className={`w-full text-left p-2 rounded border transition-all ${
                        newDevice.deviceId === device.device_number 
                          ? 'bg-blue-100 border-blue-400' 
                          : 'bg-white border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => handleSelectDiscoveredDevice(device.device_number)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{device.device_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${device.online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {device.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      {device.box_count && <span className="text-xs text-gray-500">{device.box_count} boxes</span>}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-2">Click a device to select it, or enter a different ID below.</p>
              </div>
            )}

            {/* Discovery Error */}
            {discoverError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                ⚠ {discoverError}
              </div>
            )}

            {/* Manual Device ID Entry */}
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Device ID</Label>
              <div className="relative">
                <Input 
                  placeholder="e.g., 2100018247" 
                  className={`border-gray-200 ${verifyingDevice ? 'pr-10' : ''} ${verifiedDevice ? 'border-green-500 bg-green-50' : verifyError ? 'border-red-500 bg-red-50' : ''}`} 
                  value={newDevice.deviceId} 
                  onChange={(e) => { setNewDevice({...newDevice, deviceId: e.target.value}); setVerifiedDevice(null); setVerifyError(null); }} 
                />
                {verifyingDevice && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
                {verifiedDevice && !verifyingDevice && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                )}
              </div>
              {verifyingDevice && <p className="text-xs text-gray-500 mt-1">Verifying device with Bestwond API...</p>}
            </div>

            {/* Verification Result */}
            {verifyError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                ✗ {verifyError}
              </div>
            )}
            {verifiedDevice && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="text-green-800 font-medium">✓ Device Verified</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">Status:</span> <span className={verifiedDevice.online ? 'text-green-600' : 'text-red-600'}>{verifiedDevice.online ? 'Online' : 'Offline'}</span></div>
                  <div><span className="text-gray-500">Boxes:</span> {verifiedDevice.totalBoxes}</div>
                  <div><span className="text-gray-500">Available:</span> {verifiedDevice.availableBoxes}</div>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Device Name</Label>
              <Input placeholder="e.g., Locker 2" className="border-gray-200" value={newDevice.name} onChange={(e) => setNewDevice({...newDevice, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Location</Label>
              <Input placeholder="e.g., UTech Campus, Kingston" className="border-gray-200" value={newDevice.location} onChange={(e) => setNewDevice({...newDevice, location: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Total Boxes</Label>
              <Input type="number" placeholder="24" className="border-gray-200" value={newDevice.totalBoxes} onChange={(e) => setNewDevice({...newDevice, totalBoxes: parseInt(e.target.value) || 24})} />
              {verifiedDevice && <p className="text-xs text-gray-500">Auto-filled from API ({verifiedDevice.totalBoxes} boxes detected)</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setAddDeviceDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleAddDevice} disabled={!verifiedDevice}>Add Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Device Dialog */}
      <Dialog open={editDeviceDialog} onOpenChange={setEditDeviceDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Edit Device</DialogTitle>
            <DialogDescription className="text-gray-500">Update device information and API credentials</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Device Name</Label>
              <Input placeholder="e.g., Locker 1" className="border-gray-200" value={editDevice.name} onChange={(e) => setEditDevice({...editDevice, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Location</Label>
              <Input placeholder="e.g., UTech Campus, Kingston" className="border-gray-200" value={editDevice.location} onChange={(e) => setEditDevice({...editDevice, location: e.target.value})} />
            </div>
            
            {/* Bestwond Credentials Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-[#111111]" />
                <Label className="text-[#111111] font-medium text-sm">Bestwond API Credentials</Label>
              </div>
              <p className="text-xs text-gray-500 mb-3">Update credentials for this device. Leave empty to keep existing or use global settings.</p>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-[#111111] uppercase text-xs">App ID</Label>
                  <Input 
                    placeholder="e.g., bw_57c12404463d11e" 
                    className="border-gray-200 bg-white text-sm" 
                    value={editDevice.bestwondAppId} 
                    onChange={(e) => setEditDevice({...editDevice, bestwondAppId: e.target.value})} 
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[#111111] uppercase text-xs">App Secret</Label>
                  <Input 
                    type="password"
                    placeholder="Enter new App Secret" 
                    className="border-gray-200 bg-white text-sm" 
                    value={editDevice.bestwondAppSecret} 
                    onChange={(e) => setEditDevice({...editDevice, bestwondAppSecret: e.target.value})} 
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setEditDeviceDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleEditDevice}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Device Dialog */}
      <Dialog open={deleteDeviceDialog} onOpenChange={setDeleteDeviceDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Delete Device</DialogTitle>
            <DialogDescription className="text-gray-500">Are you sure you want to delete this device? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium">{selectedDevice?.name}</p>
              <p className="text-red-600 text-sm">Device ID: {selectedDevice?.deviceId}</p>
              <p className="text-red-600 text-sm">Location: {selectedDevice?.location || 'No location'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setDeleteDeviceDialog(false)}>Cancel</Button>
            <Button variant="destructive" className="uppercase" onClick={handleDeleteDevice}>Delete Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Boxes Dialog */}
      <Dialog open={viewBoxesDialog} onOpenChange={setViewBoxesDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-[#111111] uppercase">{selectedDevice?.name} - Boxes</DialogTitle>
                <DialogDescription className="text-gray-500">{selectedDevice?.location || 'No location'}</DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => selectedDevice && handleViewBoxes(selectedDevice, true)} disabled={loadingBoxes}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingBoxes ? 'animate-spin' : ''}`} />
                Sync with Hardware
              </Button>
            </div>
          </DialogHeader>

          {/* Sync Result Feedback */}
          {syncMessage && (
            <div className={`p-4 rounded-lg text-sm font-medium ${syncResult?.synced ? 'bg-green-100 border-2 border-green-400 text-green-800' : 'bg-red-100 border-2 border-red-400 text-red-800'}`}>
              {syncMessage}
            </div>
          )}

          <div className="py-4 overflow-auto max-h-[60vh]">
            {loadingBoxes ? (
              <div className="text-center py-8 text-gray-500">Loading boxes...</div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {boxes.map((box) => {
                  // Determine display status
                  const isOccupied = box.status === 'OCCUPIED'
                  const hasOrder = !!box.order
                  
                  return (
                    <div
                      key={box.boxNumber}
                      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:scale-105 ${
                        box.status === 'AVAILABLE'
                          ? 'bg-green-50 border-green-300 hover:border-green-500'
                          : box.status === 'OCCUPIED'
                          ? 'bg-yellow-50 border-yellow-300 hover:border-yellow-500'
                          : 'bg-gray-50 border-gray-300'
                      }`}
                      onClick={() => { setSelectedBoxInfo(box); setBoxDetailDialog(true); }}
                    >
                      <div className="text-center">
                        <div className="font-bold text-[#111111]">{box.boxNumber}</div>
                        <div className={`text-xs ${box.status === 'AVAILABLE' ? 'text-green-600' : box.status === 'OCCUPIED' ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {box.status === 'AVAILABLE' ? 'Empty' : box.status === 'OCCUPIED' ? 'Occupied' : box.status}
                        </div>
                        {/* Show box size if available */}
                        {box.size && (
                          <div className="text-[10px] text-gray-400 mt-0.5">{box.size}</div>
                        )}
                        {/* Show indicator for unknown packages */}
                        {isOccupied && !hasOrder && (
                          <div className="text-[10px] text-orange-600 font-medium mt-0.5">Unknown</div>
                        )}
                      </div>
                      {hasOrder && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border-2 border-white" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="flex items-center gap-4 text-sm text-gray-500 mr-auto">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-400 rounded" /> Available</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-400 rounded" /> Occupied</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-300 rounded" /> Other</div>
            </div>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => selectedDevice && handleViewLogs(selectedDevice.id)}>
              <Clock className="mr-2 h-4 w-4" />
              View Logs
            </Button>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setViewBoxesDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Detail Dialog */}
      <Dialog open={boxDetailDialog} onOpenChange={setBoxDetailDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Box #{selectedBoxInfo?.boxNumber}</DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedBoxInfo?.status === 'AVAILABLE' ? 'Available for use' : `Status: ${selectedBoxInfo?.status}`}
              {selectedBoxInfo?.size && ` • Size: ${selectedBoxInfo.size}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedBoxInfo?.order ? (
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="font-medium text-yellow-800">Package Stored</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p><span className="text-gray-500">Order:</span> {selectedBoxInfo.order.orderNumber}</p>
                    <p><span className="text-gray-500">Tracking Code:</span> <span className="font-mono">{selectedBoxInfo.order.trackingCode}</span></p>
                    <p><span className="text-gray-500">Customer:</span> {selectedBoxInfo.order.customerName}</p>
                    <p><span className="text-gray-500">Phone:</span> {selectedBoxInfo.order.customerPhone}</p>
                    <p><span className="text-gray-500">Status:</span> {selectedBoxInfo.order.status}</p>
                    <p><span className="text-gray-500">Created:</span> {formatDate(selectedBoxInfo.order.createdAt)}</p>
                    {selectedBoxInfo.size && <p><span className="text-gray-500">Box Size:</span> {selectedBoxInfo.size}</p>}
                  </div>
                </div>
                <Button
                  className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                  onClick={() => { handleOpenBoxFromGrid(selectedBoxInfo.boxNumber); }}
                  disabled={openingBox}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Open This Box
                </Button>
              </div>
            ) : selectedBoxInfo?.status === 'OCCUPIED' ? (
              <div className="space-y-3">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="font-medium text-orange-800">Unknown Package</p>
                  <p className="text-sm text-orange-700 mt-2">
                    This box is occupied according to the locker hardware, but no order record was found in the system.
                  </p>
                  <p className="text-xs text-orange-600 mt-2">
                    This may happen if a package was placed directly without creating an order, or the order was deleted.
                  </p>
                </div>
                <Button
                  className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                  onClick={() => { handleOpenBoxFromGrid(selectedBoxInfo!.boxNumber); }}
                  disabled={openingBox}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Open This Box
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-800">This box is empty and available for use</p>
                  {selectedBoxInfo?.size && (
                    <p className="text-sm text-green-600 mt-1">Size: {selectedBoxInfo.size}</p>
                  )}
                </div>
                <Button
                  className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                  onClick={() => { handleOpenBoxFromGrid(selectedBoxInfo!.boxNumber); }}
                  disabled={openingBox}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Open This Box
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setBoxDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Logs Dialog */}
      <Dialog open={logsDialog} onOpenChange={setLogsDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Box Usage Logs</DialogTitle>
            <DialogDescription className="text-gray-500">{selectedDevice?.name} - Recent activity</DialogDescription>
          </DialogHeader>
          <div className="py-4 overflow-auto max-h-[60vh]">
            {loadingLogs ? (
              <div className="text-center py-8 text-gray-500">Loading logs...</div>
            ) : boxLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No logs found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Box</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boxLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">#{log.boxNumber}</TableCell>
                      <TableCell>
                        <Badge className={log.action === 'OPEN' ? 'bg-green-100 text-green-700' : log.action === 'CLOSE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{log.orderNo || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500">{formatDate(log.occurredAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setLogsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Orders content
function OrdersContent() {
  const [orders, setOrders] = React.useState<Order[]>([])
  const [devices, setDevices] = React.useState<Device[]>([])
  const [couriers, setCouriers] = React.useState<{id: string; name: string; code: string}[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [dropoffDialog, setDropoffDialog] = React.useState(false)
  const [dropoffForm, setDropoffForm] = React.useState({ customerName: '', customerPhone: '', deviceId: '', courierName: '', courierId: '' })
  const [creatingOrder, setCreatingOrder] = React.useState(false)
  const [newOrder, setNewOrder] = React.useState<{
    orderNumber: string
    trackingCode: string
    boxNumber: number
    bestwondDeviceId: string
    deviceId: string
    requiresBoxOpen: boolean
  } | null>(null)
  const [confirmDialog, setConfirmDialog] = React.useState(false)
  const [openingBox, setOpeningBox] = React.useState(false)
  const [selectedOrder, setSelectedOrder] = React.useState<Order | null>(null)
  const [orderDetailsDialog, setOrderDetailsDialog] = React.useState(false)
  const [pickupDialog, setPickupDialog] = React.useState(false)
  const [cashPaymentDialog, setCashPaymentDialog] = React.useState(false)
  const [processingAction, setProcessingAction] = React.useState(false)
  const [paymentDialog, setPaymentDialog] = React.useState(false)
  const [selectedOrderForPayment, setSelectedOrderForPayment] = React.useState<Order | null>(null)
  const [paymentQRCode, setPaymentQRCode] = React.useState<string | null>(null)
  const [paymentUrl, setPaymentUrl] = React.useState<string | null>(null)
  const [creatingPayment, setCreatingPayment] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, devicesRes, couriersRes] = await Promise.all([
        fetch(`/api/orders?status=${statusFilter !== 'all' ? statusFilter : ''}&search=${searchTerm}`),
        fetch('/api/devices'),
        fetch('/api/couriers')
      ])
      const ordersData = await ordersRes.json()
      const devicesData = await devicesRes.json()
      const couriersData = await couriersRes.json()
      if (ordersData.success && ordersData.data.length > 0) setOrders(ordersData.data)
      else setOrders(mockOrders)
      if (devicesData.success && devicesData.data.length > 0) setDevices(devicesData.data)
      else setDevices(mockDevices)
      if (couriersData.success && couriersData.data.length > 0) setCouriers(couriersData.data)
      else setCouriers([])
    } catch (error) {
      console.error('Failed to fetch:', error)
      setOrders(mockOrders)
      setDevices(mockDevices)
      setCouriers([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchTerm])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDropoff = async () => {
    if (!dropoffForm.customerName || !dropoffForm.customerPhone) {
      alert('Customer name and phone are required')
      return
    }

    setCreatingOrder(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dropoffForm,
          sendSms: true,
        })
      })
      const data = await res.json()
      
      if (data.success) {
        // Show confirmation dialog with box number
        setNewOrder({
          orderNumber: data.data.orderNumber,
          trackingCode: data.data.trackingCode,
          boxNumber: data.data.boxNumber,
          bestwondDeviceId: data.data.bestwondDeviceId,
          deviceId: data.data.deviceId,
          requiresBoxOpen: data.data.requiresBoxOpen,
        })
        setDropoffDialog(false)
        setConfirmDialog(true)
        setDropoffForm({ customerName: '', customerPhone: '', deviceId: '', courierName: '', courierId: '' })
      } else if (data.suggestions) {
        // Show alternative locations
        alert(`${data.error}\n\nAvailable at: ${data.suggestions.map((s: {deviceName: string; location: string}) => `${s.deviceName} (${s.availableBoxes} boxes)`).join(', ')}`)
      } else {
        alert(data.error || 'Failed to create drop-off')
      }
    } catch (error) {
      console.error('Failed to create drop-off:', error)
      alert('Failed to create drop-off')
    } finally {
      setCreatingOrder(false)
    }
  }

  const handleOpenBox = async () => {
    if (!newOrder) return
    
    setOpeningBox(true)
    try {
      // Open the box via lockers API
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          deviceId: newOrder.bestwondDeviceId,
          boxNo: newOrder.boxNumber,
        })
      })
      const data = await res.json()
      
      if (data.success) {
        // Confirm drop-off
        await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm_dropoff',
            trackingCode: newOrder.trackingCode,
          })
        })
        
        setConfirmDialog(false)
        setNewOrder(null)
        fetchData()
      } else {
        alert(data.error || 'Failed to open box')
      }
    } catch (error) {
      console.error('Failed to open box:', error)
      alert('Failed to open box')
    } finally {
      setOpeningBox(false)
    }
  }

  const handleConfirmWithoutOpening = async () => {
    if (!newOrder) return
    
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_dropoff',
          trackingCode: newOrder.trackingCode,
        })
      })
      
      setConfirmDialog(false)
      setNewOrder(null)
      fetchData()
    } catch (error) {
      console.error('Failed to confirm:', error)
    }
  }

  // Staff action handlers
  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order)
    setOrderDetailsDialog(true)
  }

  const handleStaffOpenBox = async (order: Order) => {
    if (!order.deviceId) {
      alert('No device assigned to this order')
      return
    }

    setProcessingAction(true)
    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          deviceId: order.bestwondDeviceId || order.deviceId,
          boxNo: order.boxNumber,
        })
      })
      const data = await res.json()
      
      if (data.success) {
        alert(`Box #${order.boxNumber} opened successfully!`)
      } else {
        alert(data.error || 'Failed to open box')
      }
    } catch (error) {
      console.error('Failed to open box:', error)
      alert('Failed to open box')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleStaffPickup = async (order: Order) => {
    setSelectedOrder(order)
    setPickupDialog(true)
  }

  const handleConfirmPickup = async (paymentMethod: 'FREE' | 'CASH' | 'CARD') => {
    if (!selectedOrder) return

    setProcessingAction(true)
    try {
      const res = await fetch('/api/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: selectedOrder.trackingCode,
          paymentMethod: paymentMethod === 'FREE' ? null : paymentMethod,
          staffOverride: 'staff',
        })
      })
      const data = await res.json()

      if (data.success) {
        setPickupDialog(false)
        setCashPaymentDialog(false)
        setSelectedOrder(null)
        fetchData()
        alert('Pickup confirmed successfully!')
      } else if (data.requiresPayment) {
        // Show payment dialog
        setPickupDialog(false)
        setCashPaymentDialog(true)
      } else {
        alert(data.error || 'Failed to confirm pickup')
      }
    } catch (error) {
      console.error('Failed to confirm pickup:', error)
      alert('Failed to confirm pickup')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleCashPayment = async (order: Order) => {
    setSelectedOrder(order)
    setCashPaymentDialog(true)
  }

  const handleCreatePayment = async (order: Order) => {
    setCreatingPayment(true)
    setSelectedOrderForPayment(order)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'storage_fee',
          orderId: order.id,
          amount: order.storageFee,
          passFeeToCustomer: true,
        }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setPaymentQRCode(data.data.qrCodeDataUrl)
        setPaymentUrl(data.data.paymentUrl)
        setPaymentDialog(true)
      } else {
        alert(data.error || 'Failed to create payment')
      }
    } catch (error) {
      console.error('Failed to create payment:', error)
      alert('Failed to create payment')
    } finally {
      setCreatingPayment(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      STORED: "bg-[#FFD439] text-[#111111]",
      READY: "bg-[#111111] text-white",
      PICKED_UP: "bg-green-500 text-white",
      PENDING: "bg-blue-500 text-white",
      ABANDONED: "bg-red-500 text-white",
    }
    return styles[status] || "bg-gray-200 text-[#111111]"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Orders</h2>
          <p className="text-gray-500">Manage package drop-offs and pickups</p>
        </div>
        <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={() => setDropoffDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Drop-off
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search by name, code, or order number..." className="pl-10 border-gray-200 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] border-gray-200 bg-white"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="STORED">Stored</SelectItem>
            <SelectItem value="READY">Ready</SelectItem>
            <SelectItem value="PICKED_UP">Picked Up</SelectItem>
            <SelectItem value="ABANDONED">Abandoned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No orders found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200">
                  <TableHead className="text-gray-500 uppercase">Order #</TableHead>
                  <TableHead className="text-gray-500 uppercase">Customer</TableHead>
                  <TableHead className="text-gray-500 uppercase">Tracking Code</TableHead>
                  <TableHead className="text-gray-500 uppercase">Location</TableHead>
                  <TableHead className="text-gray-500 uppercase">Days</TableHead>
                  <TableHead className="text-gray-500 uppercase">Storage Fee</TableHead>
                  <TableHead className="text-gray-500 uppercase">Status</TableHead>
                  <TableHead className="text-right text-gray-500 uppercase">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="border-gray-200">
                    <TableCell className="font-mono text-sm text-[#111111]">{order.orderNumber}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-[#111111]">{order.customerName}</p>
                        <p className="text-sm text-gray-500">{order.customerPhone}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-[#111111]">{order.trackingCode}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-[#111111]">{order.deviceName || 'Not assigned'}</p>
                        <p className="text-sm text-gray-500">{order.boxNumber ? `Box #${order.boxNumber}` : ''}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#111111]">{order.storageDays} days</TableCell>
                    <TableCell className="font-medium text-[#111111]">{formatCurrency(order.storageFee)}</TableCell>
                    <TableCell><Badge className={getStatusBadge(order.status)}>{order.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4 text-gray-500" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-gray-200">
                          <DropdownMenuLabel className="text-[#111111] uppercase text-xs">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-gray-100" />
                          <DropdownMenuItem className="text-[#111111] cursor-pointer" onClick={() => handleViewOrder(order)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {(order.status === 'STORED' || order.status === 'READY') && (
                            <>
                              <DropdownMenuItem className="text-[#111111] cursor-pointer" onClick={() => handleStaffOpenBox(order)}>
                                <Lock className="mr-2 h-4 w-4" />
                                Open Box #{order.boxNumber}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-[#111111] cursor-pointer" onClick={() => handleStaffPickup(order)}>
                                <Package className="mr-2 h-4 w-4" />
                                Mark as Picked Up
                              </DropdownMenuItem>
                              {order.currentStorageFee > 0 && (
                                <DropdownMenuItem className="text-[#111111] cursor-pointer" onClick={() => handleCashPayment(order)}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Accept Cash Payment
                                </DropdownMenuItem>
                              )}
                              {order.storageFee > 0 && (
                                <DropdownMenuItem className="text-[#111111] cursor-pointer" onClick={() => handleCreatePayment(order)} disabled={creatingPayment}>
                                  <CreditCard className="mr-2 h-4 w-4" />
                                  Pay Online (Generate QR)
                                </DropdownMenuItem>
                              )}
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
        </CardContent>
      </Card>

      {/* Drop-off Dialog */}
      <Dialog open={dropoffDialog} onOpenChange={setDropoffDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">New Drop-off</DialogTitle>
            <DialogDescription className="text-gray-500">Store a package in a smart locker</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Customer Name *</Label>
              <Input placeholder="Enter customer name" className="border-gray-200" value={dropoffForm.customerName} onChange={(e) => setDropoffForm({...dropoffForm, customerName: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Phone Number *</Label>
              <Input placeholder="876-XXX-XXXX" className="border-gray-200" value={dropoffForm.customerPhone} onChange={(e) => setDropoffForm({...dropoffForm, customerPhone: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Select Locker</Label>
              <Select value={dropoffForm.deviceId} onValueChange={(v) => setDropoffForm({...dropoffForm, deviceId: v})}>
                <SelectTrigger className="border-gray-200"><SelectValue placeholder="Any available locker" /></SelectTrigger>
                <SelectContent>
                  {devices.filter(d => d.status === "ONLINE" && d.availableBoxes > 0).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.availableBoxes} available)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Courier (Optional)</Label>
              <Select value={dropoffForm.courierId} onValueChange={(v) => {
                const courier = couriers.find(c => c.id === v);
                setDropoffForm({...dropoffForm, courierId: v, courierName: courier?.name || ''})
              }}>
                <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select courier" /></SelectTrigger>
                <SelectContent>
                  {couriers.length > 0 ? (
                    couriers.map(courier => (
                      <SelectItem key={courier.id} value={courier.id}>{courier.name}</SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="Knutsford Express">Knutsford Express</SelectItem>
                      <SelectItem value="ZipMail">ZipMail</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setDropoffDialog(false)}>Cancel</Button>
            <Button 
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" 
              onClick={handleDropoff}
              disabled={creatingOrder}
            >
              {creatingOrder ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Drop-off'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Drop-off Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Drop-off Created!</DialogTitle>
            <DialogDescription className="text-gray-500">Place the package in the locker</DialogDescription>
          </DialogHeader>
          {newOrder && (
            <div className="py-4">
              <div className="bg-[#FFD439]/20 rounded-lg p-4 mb-4 text-center">
                <p className="text-gray-600 text-sm uppercase mb-1">Box Number</p>
                <p className="text-4xl font-bold text-[#111111]">#{newOrder.boxNumber}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500">Order</p>
                  <p className="font-mono text-[#111111]">{newOrder.orderNumber}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pickup Code</p>
                  <p className="font-mono font-bold text-[#111111]">{newOrder.trackingCode}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Click "Open Box" to unlock the locker door. The customer will receive an SMS with their pickup code.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2">
            <Button 
              className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" 
              onClick={handleOpenBox}
              disabled={openingBox}
            >
              {openingBox ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Opening Box...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Open Box #{newOrder?.boxNumber}
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              className="w-full border-gray-300 text-gray-700 uppercase"
              onClick={handleConfirmWithoutOpening}
            >
              Confirm Without Opening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={orderDetailsDialog} onOpenChange={setOrderDetailsDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Order Number</p>
                  <p className="font-mono text-[#111111]">{selectedOrder.orderNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Tracking Code</p>
                  <p className="font-mono font-bold text-[#111111]">{selectedOrder.trackingCode}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Customer</p>
                <p className="font-medium text-[#111111]">{selectedOrder.customerName}</p>
                <p className="text-sm text-gray-500">{selectedOrder.customerPhone}</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Location</p>
                <p className="text-[#111111]">{selectedOrder.deviceName || 'Not assigned'}</p>
                {selectedOrder.boxNumber && (
                  <p className="text-sm text-gray-500">Box #{selectedOrder.boxNumber}</p>
                )}
              </div>
              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Storage Days</p>
                  <p className="text-[#111111]">{selectedOrder.storageDays} days</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Storage Fee</p>
                  <p className="font-medium text-[#111111]">{formatCurrency(selectedOrder.storageFee)}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <Badge className={getStatusBadge(selectedOrder.status)}>{selectedOrder.status.replace("_", " ")}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setOrderDetailsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pickup Confirmation Dialog */}
      <Dialog open={pickupDialog} onOpenChange={setPickupDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Confirm Pickup</DialogTitle>
            <DialogDescription className="text-gray-500">Verify customer identity and confirm package pickup</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Customer</p>
                <p className="font-medium text-[#111111]">{selectedOrder.customerName}</p>
                <p className="text-sm text-gray-500">{selectedOrder.customerPhone}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Box</p>
                  <p className="font-medium text-[#111111]">#{selectedOrder.boxNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Storage Fee</p>
                  <p className="font-medium text-[#111111]">{formatCurrency(selectedOrder.storageFee)}</p>
                </div>
              </div>
              {selectedOrder.storageFee > 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Payment Required:</strong> This order has a storage fee of {formatCurrency(selectedOrder.storageFee)}. 
                    Accept payment before confirming pickup.
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Free Pickup:</strong> No storage fee required.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2">
            {selectedOrder?.storageFee && selectedOrder.storageFee > 0 ? (
              <>
                <Button 
                  className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                  onClick={() => handleConfirmPickup('CASH')}
                  disabled={processingAction}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Accept Cash Payment
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full border-gray-300 text-gray-700 uppercase"
                  onClick={() => handleConfirmPickup('CARD')}
                  disabled={processingAction}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Accept Card Payment
                </Button>
              </>
            ) : (
              <Button 
                className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                onClick={() => handleConfirmPickup('FREE')}
                disabled={processingAction}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Confirm Free Pickup
              </Button>
            )}
            <Button 
              variant="ghost" 
              className="w-full text-gray-500 uppercase"
              onClick={() => setPickupDialog(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Payment Dialog */}
      <Dialog open={cashPaymentDialog} onOpenChange={setCashPaymentDialog}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Accept Cash Payment</DialogTitle>
            <DialogDescription className="text-gray-500">Confirm cash received and complete pickup</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="bg-[#FFD439]/20 rounded-lg p-6 text-center">
                <p className="text-xs text-gray-500 uppercase mb-2">Amount Due</p>
                <p className="text-4xl font-bold text-[#111111]">{formatCurrency(selectedOrder.storageFee)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Order Info</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Customer</p>
                    <p className="text-[#111111]">{selectedOrder.customerName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Box</p>
                    <p className="text-[#111111]">#{selectedOrder.boxNumber}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2">
            <Button 
              className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
              onClick={() => handleConfirmPickup('CASH')}
              disabled={processingAction}
            >
              {processingAction ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirm Cash Received
                </>
              )}
            </Button>
            <Button 
              variant="ghost" 
              className="w-full text-gray-500 uppercase"
              onClick={() => setCashPaymentDialog(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment QR Code Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Pay Storage Fee</DialogTitle>
            <DialogDescription className="text-gray-500">
              Order: {selectedOrderForPayment?.orderNumber} - Amount: ${selectedOrderForPayment?.storageFee}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {paymentQRCode ? (
              <>
                <img src={paymentQRCode} alt="Payment QR Code" className="w-64 h-64 rounded-lg border border-gray-200" />
                <p className="text-sm text-gray-500 mt-4 text-center">Scan this QR code with your banking app to pay</p>
                {paymentUrl && (
                  <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="mt-4 text-sm text-blue-600 hover:underline">
                    Or click here to pay online
                  </a>
                )}
              </>
            ) : (
              <div className="text-center text-gray-500">Loading payment...</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Customers content
function CustomersContent() {
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")

  const fetchCustomers = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers?search=${searchTerm}`)
      const data = await res.json()
      if (data.success && data.data.length > 0) setCustomers(data.data)
      else setCustomers(mockCustomers)
    } catch (error) {
      console.error('Failed to fetch customers:', error)
      setCustomers(mockCustomers)
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  React.useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Customers</h2>
          <p className="text-gray-500">Manage your customer accounts</p>
        </div>
        <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"><Plus className="mr-2 h-4 w-4" />Add Customer</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Search customers..." className="pl-10 max-w-md border-gray-200 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No customers found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200">
                  <TableHead className="text-gray-500 uppercase">Customer</TableHead>
                  <TableHead className="text-gray-500 uppercase">Phone</TableHead>
                  <TableHead className="text-gray-500 uppercase">Email</TableHead>
                  <TableHead className="text-gray-500 uppercase">Total Orders</TableHead>
                  <TableHead className="text-gray-500 uppercase">Active Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id} className="border-gray-200">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="bg-[#FFD439]"><AvatarFallback className="text-[#111111] font-bold">{customer.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
                        <span className="font-medium text-[#111111]">{customer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#111111]">{customer.phone}</TableCell>
                    <TableCell className="text-[#111111]">{customer.email}</TableCell>
                    <TableCell className="text-[#111111]">{customer.totalOrders}</TableCell>
                    <TableCell><Badge className="bg-[#FFD439] text-[#111111]">{customer.activeOrders}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Payments content
function PaymentsContent() {
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [loading, setLoading] = React.useState(true)

  const fetchPayments = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments')
      const data = await res.json()
      if (data.success && data.data.length > 0) setPayments(data.data)
      else setPayments(mockPayments)
    } catch (error) {
      console.error('Failed to fetch payments:', error)
      setPayments(mockPayments)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      COMPLETED: "bg-green-500 text-white",
      PENDING: "bg-[#FFD439] text-[#111111]",
      FAILED: "bg-red-500 text-white",
    }
    return styles[status] || "bg-gray-200 text-[#111111]"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Payments</h2>
          <p className="text-gray-500">Track payments and transactions</p>
        </div>
        <Button variant="outline" className="border-[#FFD439] text-[#111111] uppercase font-bold"><CreditCard className="mr-2 h-4 w-4" />DimePay Connected</Button>
      </div>
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-[#111111] uppercase">Recent Transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No payments found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200">
                  <TableHead className="text-gray-500 uppercase">Order #</TableHead>
                  <TableHead className="text-gray-500 uppercase">Customer</TableHead>
                  <TableHead className="text-gray-500 uppercase">Amount</TableHead>
                  <TableHead className="text-gray-500 uppercase">Method</TableHead>
                  <TableHead className="text-gray-500 uppercase">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} className="border-gray-200">
                    <TableCell className="font-mono text-sm text-[#111111]">{payment.orderId}</TableCell>
                    <TableCell className="font-medium text-[#111111]">{payment.customerName}</TableCell>
                    <TableCell className="font-medium text-[#111111]">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className="border-gray-300 text-gray-600">{payment.method}</Badge></TableCell>
                    <TableCell><Badge className={getStatusBadge(payment.status)}>{payment.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Express API content - Courier storage and pickup workflow
interface ExpressOrder {
  order_no: string;
  box_size: string;
  box_name?: string;
  save_code: string;
  pick_code: string;
  status: string;
  save_time?: string;
  pick_time?: string;
}

function ExpressContent() {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedDevice, setSelectedDevice] = React.useState<Device | null>(null)
  
  // Create order form
  const [orderNo, setOrderNo] = React.useState('')
  const [boxSize, setBoxSize] = React.useState<'S' | 'M' | 'L' | 'XL'>('S')
  const [creatingOrder, setCreatingOrder] = React.useState(false)
  const [createdOrder, setCreatedOrder] = React.useState<ExpressOrder | null>(null)
  
  // Open box with code
  const [actionCode, setActionCode] = React.useState('')
  const [actionType, setActionType] = React.useState<'save' | 'take'>('save')
  const [openingBox, setOpeningBox] = React.useState(false)
  const [openResult, setOpenResult] = React.useState<{success: boolean; message: string} | null>(null)
  
  // Active orders
  const [activeOrders, setActiveOrders] = React.useState<ExpressOrder[]>([])
  const [loadingOrders, setLoadingOrders] = React.useState(false)
  
  // Order lookup
  const [lookupOrderNo, setLookupOrderNo] = React.useState('')
  const [lookingUpOrder, setLookingUpOrder] = React.useState(false)
  const [lookedUpOrder, setLookedUpOrder] = React.useState<ExpressOrder | null>(null)
  const [lookupError, setLookupError] = React.useState<string | null>(null)

  const fetchDevices = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      if (data.success && data.data.length > 0) {
        setDevices(data.data)
        if (data.data.length > 0) {
          setSelectedDevice(data.data[0])
        }
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Generate order number
  const generateOrderNo = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `EXP-${timestamp}-${random}`
  }

  // Create save order
  const handleCreateOrder = async () => {
    if (!selectedDevice || !orderNo || !boxSize) {
      return
    }

    setCreatingOrder(true)
    setCreatedOrder(null)

    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-save-order',
          deviceId: selectedDevice.deviceId,
          order_no: orderNo,
          box_size: boxSize,
        })
      })
      const data = await res.json()

      if (data.success && data.order) {
        setCreatedOrder(data.order)
        // Add to active orders
        setActiveOrders(prev => [...prev, data.order])
      } else {
        alert(data.error || 'Failed to create order')
      }
    } catch (error) {
      console.error('Failed to create order:', error)
      alert('Failed to create order')
    } finally {
      setCreatingOrder(false)
    }
  }

  // Open box with action code
  const handleOpenWithCode = async () => {
    if (!selectedDevice || !actionCode || !boxSize) {
      return
    }

    setOpeningBox(true)
    setOpenResult(null)

    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'express-save-take',
          deviceId: selectedDevice.deviceId,
          box_size: boxSize,
          action_code: actionCode,
          action_type: actionType,
        })
      })
      const data = await res.json()

      if (data.success) {
        setOpenResult({ success: true, message: data.message || `Box opened successfully!` })
        // Clear code after success
        setTimeout(() => {
          setActionCode('')
          setOpenResult(null)
        }, 3000)
      } else {
        setOpenResult({ success: false, message: data.error || 'Failed to open box' })
      }
    } catch (error) {
      console.error('Failed to open box:', error)
      setOpenResult({ success: false, message: 'Failed to open box' })
    } finally {
      setOpeningBox(false)
    }
  }

  // Lookup order by order number (from Bestwond API)
  const handleLookupOrder = async () => {
    if (!selectedDevice || !lookupOrderNo) {
      return
    }

    setLookingUpOrder(true)
    setLookedUpOrder(null)
    setLookupError(null)

    try {
      const res = await fetch('/api/lockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-order-info',
          deviceId: selectedDevice.deviceId,
          order_no: lookupOrderNo,
        })
      })
      const data = await res.json()

      if (data.success && data.order) {
        setLookedUpOrder(data.order)
      } else {
        setLookupError(data.error || 'Order not found')
      }
    } catch (error) {
      console.error('Failed to lookup order:', error)
      setLookupError('Failed to lookup order')
    } finally {
      setLookingUpOrder(false)
    }
  }

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <Zap className="inline-block mr-2 h-8 w-8 text-[#FFD439]" />
            Express Storage
          </h2>
          <p className="text-gray-500">Courier drop-off and customer pickup using save/pick codes</p>
        </div>
        <Button onClick={() => { setOrderNo(generateOrderNo()); setCreatedOrder(null); }} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase">
          <Plus className="mr-2 h-4 w-4" />
          New Order
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading devices...</div>
      ) : devices.length === 0 ? (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="py-8 text-center text-gray-500">
            No devices found. Add a device first to use Express storage.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Create Order */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
                <Package className="h-5 w-5" />
                Create Storage Order
              </CardTitle>
              <CardDescription>Generate save/pick codes for courier drop-off</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Device Selection */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">Select Device</Label>
                <Select value={selectedDevice?.deviceId || ""} onValueChange={(val) => setSelectedDevice(devices.find(d => d.deviceId === val) || null)}>
                  <SelectTrigger className="border-gray-200">
                    <SelectValue placeholder="Select device" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(d => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.name} ({d.deviceId}) - {d.availableBoxes}/{d.totalBoxes} available
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Order Number */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">Order Number</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="EXP-XXXXX-XXXX" 
                    className="border-gray-200 font-mono" 
                    value={orderNo} 
                    onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
                  />
                  <Button variant="outline" onClick={() => setOrderNo(generateOrderNo())}>
                    Generate
                  </Button>
                </div>
              </div>

              {/* Box Size */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">Box Size</Label>
                <Select value={boxSize} onValueChange={(val) => setBoxSize(val as 'S' | 'M' | 'L' | 'XL')}>
                  <SelectTrigger className="border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">Small (S)</SelectItem>
                    <SelectItem value="M">Medium (M)</SelectItem>
                    <SelectItem value="L">Large (L)</SelectItem>
                    <SelectItem value="XL">Extra Large (XL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                onClick={handleCreateOrder}
                disabled={creatingOrder || !orderNo || !selectedDevice}
              >
                {creatingOrder ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Generate Codes
                  </>
                )}
              </Button>

              {/* Created Order Result */}
              {createdOrder && (
                <div className="mt-4 p-4 bg-green-50 border-2 border-green-400 rounded-lg">
                  <p className="text-green-800 font-bold text-lg mb-3">✓ Order Created!</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border">
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Save Code (Courier)</p>
                        <p className="text-2xl font-mono font-bold text-[#111111]">{createdOrder.save_code}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdOrder.save_code)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border">
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Pick Code (Customer)</p>
                        <p className="text-2xl font-mono font-bold text-[#111111]">{createdOrder.pick_code}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdOrder.pick_code)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Order: <span className="font-mono">{createdOrder.order_no}</span></p>
                      <p>Box: {createdOrder.box_name || 'Auto-assigned'} | Size: {createdOrder.box_size}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Open with Code */}
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Open Box with Code
              </CardTitle>
              <CardDescription>Courier store or customer pickup using 6-digit code</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Action Type */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">Action Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={actionType === 'save' ? 'default' : 'outline'}
                    className={actionType === 'save' ? 'bg-[#FFD439] text-[#111111] font-bold' : 'border-gray-300'}
                    onClick={() => setActionType('save')}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Courier Store
                  </Button>
                  <Button 
                    variant={actionType === 'take' ? 'default' : 'outline'}
                    className={actionType === 'take' ? 'bg-[#FFD439] text-[#111111] font-bold' : 'border-gray-300'}
                    onClick={() => setActionType('take')}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Customer Pickup
                  </Button>
                </div>
              </div>

              {/* Box Size for this action */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">Box Size</Label>
                <Select value={boxSize} onValueChange={(val) => setBoxSize(val as 'S' | 'M' | 'L' | 'XL')}>
                  <SelectTrigger className="border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">Small (S)</SelectItem>
                    <SelectItem value="M">Medium (M)</SelectItem>
                    <SelectItem value="L">Large (L)</SelectItem>
                    <SelectItem value="XL">Extra Large (XL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Code */}
              <div className="space-y-2">
                <Label className="text-[#111111] uppercase text-sm">
                  {actionType === 'save' ? 'Save Code (from order)' : 'Pick Code (for customer)'}
                </Label>
                <Input 
                  placeholder="Enter 6-digit code" 
                  className="border-gray-200 text-2xl font-mono text-center tracking-widest"
                  maxLength={6}
                  value={actionCode}
                  onChange={(e) => setActionCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>

              <Button 
                className="w-full bg-[#111111] text-white hover:bg-gray-800 font-bold uppercase"
                onClick={handleOpenWithCode}
                disabled={openingBox || actionCode.length !== 6 || !selectedDevice}
              >
                {openingBox ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Open Box
                  </>
                )}
              </Button>

              {/* Result */}
              {openResult && (
                <div className={`p-4 rounded-lg ${openResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className={openResult.success ? 'text-green-700' : 'text-red-700'}>
                    {openResult.success ? '✓' : '✗'} {openResult.message}
                  </p>
                </div>
              )}

              {/* Quick Code Buttons */}
              {createdOrder && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-gray-500 uppercase mb-2">Quick Actions for {createdOrder.order_no}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      className="border-gray-300"
                      onClick={() => { setActionCode(createdOrder.save_code); setActionType('save'); }}
                    >
                      <Package className="mr-2 h-4 w-4" />
                      Store ({createdOrder.save_code})
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-gray-300"
                      onClick={() => { setActionCode(createdOrder.pick_code); setActionType('take'); }}
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Pickup ({createdOrder.pick_code})
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Order Lookup Section */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
            <Search className="h-5 w-5" />
            Lookup Order by Order Number
          </CardTitle>
          <CardDescription>Query order details from Bestwond (including orders created before this system)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Device Selection */}
            <div className="space-y-2">
              <Label className="text-[#111111] uppercase text-sm">Select Device</Label>
              <Select value={selectedDevice?.deviceId || ""} onValueChange={(val) => setSelectedDevice(devices.find(d => d.deviceId === val) || null)}>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.name} ({d.deviceId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Order Number Input */}
            <div className="space-y-2">
              <Label className="text-[#111111] uppercase text-sm">Order Number</Label>
              <Input 
                placeholder="Enter order number" 
                className="border-gray-200 font-mono" 
                value={lookupOrderNo} 
                onChange={(e) => setLookupOrderNo(e.target.value)}
              />
            </div>
            
            {/* Lookup Button */}
            <div className="space-y-2">
              <Label className="text-[#111111] uppercase text-sm">&nbsp;</Label>
              <Button 
                className="w-full bg-[#111111] text-white hover:bg-gray-800 font-bold uppercase"
                onClick={handleLookupOrder}
                disabled={lookingUpOrder || !lookupOrderNo || !selectedDevice}
              >
                {lookingUpOrder ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Lookup Order
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Lookup Error */}
          {lookupError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">✗ {lookupError}</p>
              <p className="text-red-600 text-sm mt-1">
                This could mean: the order doesn't exist, was created with different credentials, 
                or has already been completed.
              </p>
            </div>
          )}
          
          {/* Lookup Result */}
          {lookedUpOrder && (
            <div className="mt-4 p-4 bg-green-50 border-2 border-green-400 rounded-lg">
              <p className="text-green-800 font-bold text-lg mb-3">✓ Order Found!</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Order Number</p>
                  <p className="text-lg font-mono font-bold text-[#111111]">{lookedUpOrder.order_no}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Status</p>
                  <p className="text-lg font-bold text-[#111111]">{lookedUpOrder.status}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Box</p>
                  <p className="text-lg font-bold text-[#111111]">{lookedUpOrder.box_name || 'Not assigned'} ({lookedUpOrder.box_size})</p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Save Code (Courier)</p>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-mono font-bold text-[#111111]">{lookedUpOrder.save_code}</p>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(lookedUpOrder.save_code)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Pick Code (Customer)</p>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-mono font-bold text-[#111111]">{lookedUpOrder.pick_code}</p>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(lookedUpOrder.pick_code)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <p className="text-xs text-gray-500 uppercase">Stored At</p>
                  <p className="text-lg font-bold text-[#111111]">{lookedUpOrder.save_time ? new Date(lookedUpOrder.save_time).toLocaleString() : 'Not stored yet'}</p>
                </div>
                {lookedUpOrder.pick_time && (
                  <div className="bg-white p-4 rounded-lg border md:col-span-2">
                    <p className="text-xs text-gray-500 uppercase">Picked Up At</p>
                    <p className="text-lg font-bold text-green-600">{new Date(lookedUpOrder.pick_time).toLocaleString()}</p>
                  </div>
                )}
              </div>
              
              {/* Quick Actions */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 uppercase mb-2">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    className="border-gray-300"
                    onClick={() => { 
                      setActionCode(lookedUpOrder.save_code); 
                      setActionType('save');
                      setBoxSize(lookedUpOrder.box_size as 'S' | 'M' | 'L' | 'XL');
                    }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Store ({lookedUpOrder.save_code})
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-gray-300"
                    onClick={() => { 
                      setActionCode(lookedUpOrder.pick_code); 
                      setActionType('take');
                      setBoxSize(lookedUpOrder.box_size as 'S' | 'M' | 'L' | 'XL');
                    }}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Pickup ({lookedUpOrder.pick_code})
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#111111] uppercase">How Express Storage Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-[#111111]">1</span>
              </div>
              <p className="font-medium text-[#111111]">Create Order</p>
              <p className="text-sm text-gray-500 mt-1">Generate unique save and pick codes</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-[#111111]">2</span>
              </div>
              <p className="font-medium text-[#111111]">Courier Stores</p>
              <p className="text-sm text-gray-500 mt-1">Courier enters save code to open box</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-[#111111]">3</span>
              </div>
              <p className="font-medium text-[#111111]">Customer Picks Up</p>
              <p className="text-sm text-gray-500 mt-1">Customer enters pick code to retrieve</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-[#111111]">4</span>
              </div>
              <p className="font-medium text-[#111111]">Complete</p>
              <p className="text-sm text-gray-500 mt-1">Box freed for next order</p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm">
              <strong>Tip:</strong> This Express API method uses order codes instead of direct box control. 
              It's more secure for courier operations and provides automatic tracking. The locker device 
              manages box assignment automatically based on the box size you select.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Settings content
interface SettingsData {
  business: { brandName: string; location: string; partners: string; phone: string; email: string };
  storage: { freeDays: string; tier1Fee: string; tier2Fee: string; tier3Fee: string; maxDays: string };
  bestwond: { appId: string; appSecret: string; deviceId: string; baseUrl: string; enabled: string };
  textbee: { apiKey: string; deviceId: string; enabled: string; senderName: string };
  email: { enabled: string; host: string; port: string; secure: string; user: string; password: string; fromEmail: string; fromName: string };
  dimepay: { 
    // API Key format (alternative)
    apiKey: string; 
    merchantId: string; 
    // Client ID format (preferred)
    sandbox_clientId: string; 
    sandbox_secretKey: string; 
    live_clientId: string; 
    live_secretKey: string; 
    // Common settings
    sandboxMode: string; 
    enabled: string; 
    passFeeToCustomer: string; 
    passFeeToCourier: string; 
    feePercentage: string; 
    fixedFee: string 
  };
  notifications: { smsEnabled: string; emailEnabled: string; whatsappEnabled: string; pickupReminder: string; abandonedWarning: string };
}

function SettingsContent() {
  const [settings, setSettings] = React.useState<SettingsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, { success: boolean; message: string }>>({});
  const [showSecrets, setShowSecrets] = React.useState<Record<string, boolean>>({});

  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (category: string, categorySettings: Record<string, string>) => {
    setSaving(category);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, settings: categorySettings })
      });
      const data = await res.json();
      if (data.success) {
        // Show success feedback
        setTestResults(prev => ({ ...prev, [category]: { success: true, message: 'Settings saved!' } }));
        setTimeout(() => setTestResults(prev => {
          const newResults = { ...prev };
          delete newResults[category];
          return newResults;
        }), 3000);
      } else {
        setTestResults(prev => ({ ...prev, [category]: { success: false, message: data.error || 'Failed to save' } }));
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setTestResults(prev => ({ ...prev, [category]: { success: false, message: 'Failed to save settings' } }));
    } finally {
      setSaving(null);
    }
  };

  const handleTestConnection = async (service: string) => {
    setTesting(service);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const serviceStatus = data.services?.find((s: { name: string }) => s.name.toLowerCase().includes(service));
      if (serviceStatus) {
        setTestResults(prev => ({
          ...prev,
          [`test_${service}`]: {
            success: serviceStatus.status === 'online',
            message: serviceStatus.message || (serviceStatus.status === 'online' ? 'Connected!' : 'Connection failed')
          }
        }));
      } else {
        setTestResults(prev => ({
          ...prev,
          [`test_${service}`]: { success: false, message: 'Service not found in status check' }
        }));
      }
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [`test_${service}`]: { success: false, message: 'Failed to test connection' }
      }));
    } finally {
      setTesting(null);
    }
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const maskValue = (value: string, show: boolean) => {
    if (!value) return '';
    if (show) return value;
    if (value.length <= 8) return '••••••••';
    return value.slice(0, 4) + '••••••••' + value.slice(-4);
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="text-center py-8 text-red-500">Failed to load settings</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Settings</h2>
        <p className="text-gray-500">Configure your Pickup smart locker system</p>
      </div>

      <div className="grid gap-6">
        {/* Business Settings */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Business Settings
            </CardTitle>
            <CardDescription>General business information</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Brand Name</Label>
                <Input
                  value={settings.business.brandName}
                  onChange={(e) => setSettings({
                    ...settings,
                    business: { ...settings.business, brandName: e.target.value }
                  })}
                  className="border-gray-200"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Location</Label>
                <Input
                  value={settings.business.location}
                  onChange={(e) => setSettings({
                    ...settings,
                    business: { ...settings.business, location: e.target.value }
                  })}
                  className="border-gray-200"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Phone</Label>
                <Input
                  value={settings.business.phone}
                  onChange={(e) => setSettings({
                    ...settings,
                    business: { ...settings.business, phone: e.target.value }
                  })}
                  className="border-gray-200"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Email</Label>
                <Input
                  value={settings.business.email}
                  onChange={(e) => setSettings({
                    ...settings,
                    business: { ...settings.business, email: e.target.value }
                  })}
                  className="border-gray-200"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Partners</Label>
              <Input
                value={settings.business.partners}
                onChange={(e) => setSettings({
                  ...settings,
                  business: { ...settings.business, partners: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.business && (
              <span className={testResults.business.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.business.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('business', settings.business)}
              disabled={saving === 'business'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'business' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* Storage Fees */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Storage Fees (JMD)
            </CardTitle>
            <CardDescription>Configure storage fee tiers</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Free Storage Days</Label>
              <Input
                type="number"
                value={settings.storage.freeDays}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, freeDays: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Max Storage Days</Label>
              <Input
                type="number"
                value={settings.storage.maxDays}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, maxDays: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Tier 1 Fee (Days 4-7)</Label>
              <Input
                type="number"
                value={settings.storage.tier1Fee}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, tier1Fee: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Tier 2 Fee (Days 8-14)</Label>
              <Input
                type="number"
                value={settings.storage.tier2Fee}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, tier2Fee: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Tier 3 Fee (Days 15+)</Label>
              <Input
                type="number"
                value={settings.storage.tier3Fee}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, tier3Fee: e.target.value }
                })}
                className="border-gray-200"
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.storage && (
              <span className={testResults.storage.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.storage.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('storage', settings.storage)}
              disabled={saving === 'storage'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'storage' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* Bestwond Locker API */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Bestwond Locker API
            </CardTitle>
            <CardDescription>Configure locker hardware integration</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-[#111111]">Status</p>
                <p className="text-sm text-gray-500">Connection status</p>
              </div>
              <div className="flex items-center gap-2">
                {testResults.test_bestwond && (
                  <span className={testResults.test_bestwond.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                    {testResults.test_bestwond.message}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection('bestwond')}
                  disabled={testing === 'bestwond'}
                  className="border-gray-300"
                >
                  {testing === 'bestwond' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">App ID</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.bestwond_appId ? 'text' : 'password'}
                    value={settings.bestwond.appId}
                    onChange={(e) => setSettings({
                      ...settings,
                      bestwond: { ...settings.bestwond, appId: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="bw_xxxxx"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleShowSecret('bestwond_appId')}
                    className="px-2"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">App Secret</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.bestwond_appSecret ? 'text' : 'password'}
                    value={settings.bestwond.appSecret}
                    onChange={(e) => setSettings({
                      ...settings,
                      bestwond: { ...settings.bestwond, appSecret: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="Enter secret"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleShowSecret('bestwond_appSecret')}
                    className="px-2"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Device ID</Label>
                <Input
                  value={settings.bestwond.deviceId}
                  onChange={(e) => setSettings({
                    ...settings,
                    bestwond: { ...settings.bestwond, deviceId: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="2100012858"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Base URL</Label>
                <Input
                  value={settings.bestwond.baseUrl}
                  onChange={(e) => setSettings({
                    ...settings,
                    bestwond: { ...settings.bestwond, baseUrl: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="https://api.bestwond.com"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.bestwond && (
              <span className={testResults.bestwond.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.bestwond.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('bestwond', settings.bestwond)}
              disabled={saving === 'bestwond'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'bestwond' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* TextBee SMS API */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              TextBee SMS API
            </CardTitle>
            <CardDescription>Configure SMS notifications</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-[#111111]">Status</p>
                <p className="text-sm text-gray-500">SMS gateway connection</p>
              </div>
              <div className="flex items-center gap-2">
                {testResults.test_textbee && (
                  <span className={testResults.test_textbee.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                    {testResults.test_textbee.message}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection('textbee')}
                  disabled={testing === 'textbee'}
                  className="border-gray-300"
                >
                  {testing === 'textbee' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.textbee_apiKey ? 'text' : 'password'}
                    value={settings.textbee.apiKey}
                    onChange={(e) => setSettings({
                      ...settings,
                      textbee: { ...settings.textbee, apiKey: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="Enter API key"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleShowSecret('textbee_apiKey')}
                    className="px-2"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Device ID</Label>
                <Input
                  value={settings.textbee.deviceId}
                  onChange={(e) => setSettings({
                    ...settings,
                    textbee: { ...settings.textbee, deviceId: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="TextBee device ID"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Sender Name</Label>
                <Input
                  value={settings.textbee.senderName}
                  onChange={(e) => setSettings({
                    ...settings,
                    textbee: { ...settings.textbee, senderName: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="PickupJA"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.textbee && (
              <span className={testResults.textbee.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.textbee.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('textbee', settings.textbee)}
              disabled={saving === 'textbee'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'textbee' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* Email Notifications */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Notifications
            </CardTitle>
            <CardDescription>Configure email notification settings (SMTP)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-[#111111]">Status</p>
                <p className="text-sm text-gray-500">Email gateway connection</p>
              </div>
              <div className="flex items-center gap-2">
                {testResults.test_email && (
                  <span className={testResults.test_email.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                    {testResults.test_email.message}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection('email')}
                  disabled={testing === 'email'}
                  className="border-gray-300"
                >
                  {testing === 'email' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-[#111111]">Enable Email Notifications</p>
                <p className="text-sm text-gray-500">Send email notifications to customers</p>
              </div>
              <select
                value={settings.email.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  email: { ...settings.email, enabled: e.target.value }
                })}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">SMTP Host</Label>
                <Input
                  value={settings.email.host}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, host: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">SMTP Port</Label>
                <Input
                  value={settings.email.port}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, port: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="587"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Username</Label>
                <Input
                  value={settings.email.user}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, user: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="your-email@gmail.com"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Password</Label>
                <div className="flex gap-2">
                  <Input
                    type={showSecrets.email_password ? 'text' : 'password'}
                    value={settings.email.password}
                    onChange={(e) => setSettings({
                      ...settings,
                      email: { ...settings.email, password: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="Enter password"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleShowSecret('email_password')}
                    className="px-2"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">From Email</Label>
                <Input
                  value={settings.email.fromEmail}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, fromEmail: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="noreply@pickupja.com"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">From Name</Label>
                <Input
                  value={settings.email.fromName}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, fromName: e.target.value }
                  })}
                  className="border-gray-200"
                  placeholder="Pickup Jamaica"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Use TLS/SSL</Label>
                <select
                  value={settings.email.secure}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, secure: e.target.value }
                  })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                >
                  <option value="true">Yes (Recommended)</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.email && (
              <span className={testResults.email.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.email.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('email', settings.email)}
              disabled={saving === 'email'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'email' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* DimePay Payment API */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              DimePay Payment API
            </CardTitle>
            <CardDescription>Configure payment processing</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-[#111111]">Status</p>
                <p className="text-sm text-gray-500">Payment gateway connection</p>
              </div>
              <div className="flex items-center gap-2">
                {testResults.test_dimepay && (
                  <span className={testResults.test_dimepay.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                    {testResults.test_dimepay.message}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection('dimepay')}
                  disabled={testing === 'dimepay'}
                  className="border-gray-300"
                >
                  {testing === 'dimepay' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>

            {/* API Credentials Section */}
            <div className="border-b border-gray-200 pb-4">
              <h4 className="font-medium text-[#111111] mb-3 uppercase text-sm">API Credentials</h4>
              <p className="text-xs text-gray-500 mb-3">
                DimePay supports two credential formats. Use whichever your account provides.
              </p>
              
              {/* Option 1: API Key Format */}
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <h5 className="font-medium text-[#111111] mb-2 text-sm">Option 1: API Key + Merchant ID</h5>
                <p className="text-xs text-gray-500 mb-2">API Key should start with sk_</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.dimepay_apiKey ? 'text' : 'password'}
                        value={settings.dimepay.apiKey || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          dimepay: { ...settings.dimepay, apiKey: e.target.value }
                        })}
                        className="border-gray-200 flex-1"
                        placeholder="sk_..."
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleShowSecret('dimepay_apiKey')}
                        className="px-2"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">Merchant ID</Label>
                    <Input
                      value={settings.dimepay.merchantId || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        dimepay: { ...settings.dimepay, merchantId: e.target.value }
                      })}
                      className="border-gray-200"
                      placeholder="Enter merchant ID"
                    />
                  </div>
                </div>
              </div>
              
              {/* Option 2: Client ID Format */}
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h5 className="font-medium text-[#111111] mb-2 text-sm">Option 2: Client ID + Secret Key (Sandbox)</h5>
                <p className="text-xs text-gray-500 mb-2">Client ID should start with ck_test_</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">Sandbox Client ID</Label>
                    <Input
                      value={settings.dimepay.sandbox_clientId || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        dimepay: { ...settings.dimepay, sandbox_clientId: e.target.value }
                      })}
                      className="border-gray-200"
                      placeholder="ck_test_..."
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">Sandbox Secret Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.dimepay_sandbox_secretKey ? 'text' : 'password'}
                        value={settings.dimepay.sandbox_secretKey || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          dimepay: { ...settings.dimepay, sandbox_secretKey: e.target.value }
                        })}
                        className="border-gray-200 flex-1"
                        placeholder="Enter secret key"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleShowSecret('dimepay_sandbox_secretKey')}
                        className="px-2"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Live Credentials */}
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <h5 className="font-medium text-[#111111] mb-2 text-sm">Option 2: Client ID + Secret Key (Live)</h5>
                <p className="text-xs text-gray-500 mb-2">Client ID should start with ck_live_</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">Live Client ID</Label>
                    <Input
                      value={settings.dimepay.live_clientId || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        dimepay: { ...settings.dimepay, live_clientId: e.target.value }
                      })}
                      className="border-gray-200"
                      placeholder="ck_live_..."
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[#111111] uppercase text-xs">Live Secret Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecrets.dimepay_live_secretKey ? 'text' : 'password'}
                        value={settings.dimepay.live_secretKey || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          dimepay: { ...settings.dimepay, live_secretKey: e.target.value }
                        })}
                        className="border-gray-200 flex-1"
                        placeholder="Enter secret key"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleShowSecret('dimepay_live_secretKey')}
                        className="px-2"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Environment Mode Section */}
            <div className="border-b border-gray-200 pb-4">
              <h4 className="font-medium text-[#111111] mb-3 uppercase text-sm">Environment Mode</h4>
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-[#111111]">Current Mode</p>
                    <p className="text-xs text-gray-500">
                      {settings.dimepay.sandboxMode === 'true' 
                        ? 'Using Sandbox credentials (ck_test_) - No real charges' 
                        : 'Using Live credentials (ck_live_) - Real transactions'}
                    </p>
                  </div>
                  <Button
                    variant={settings.dimepay.sandboxMode === 'true' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const newSandboxMode = settings.dimepay.sandboxMode === 'true' ? 'false' : 'true';
                      setSettings({
                        ...settings,
                        dimepay: { 
                          ...settings.dimepay, 
                          sandboxMode: newSandboxMode
                        }
                      });
                    }}
                    className={settings.dimepay.sandboxMode === 'true' ? 'bg-yellow-500 text-black hover:bg-yellow-600' : 'bg-green-500 text-white hover:bg-green-600'}
                  >
                    {settings.dimepay.sandboxMode === 'true' ? 'SANDBOX' : 'LIVE'}
                  </Button>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> DimePay uses the same base URL (https://api.dimepay.com) for both environments. 
                    The environment is determined by which credentials are used based on the mode setting above.
                  </p>
                </div>
              </div>
            </div>

            {/* Fee Settings Section */}
            <div className="border-b border-gray-200 pb-4">
              <h4 className="font-medium text-[#111111] mb-3 uppercase text-sm">Fee Settings</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label className="text-[#111111] uppercase text-xs">Fee Percentage (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.dimepay.feePercentage}
                    onChange={(e) => setSettings({
                      ...settings,
                      dimepay: { ...settings.dimepay, feePercentage: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="2.5"
                  />
                  <p className="text-xs text-gray-500">Percentage fee charged by DimePay (default: 2.5%)</p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-[#111111] uppercase text-xs">Fixed Fee (JMD)</Label>
                  <Input
                    type="number"
                    value={settings.dimepay.fixedFee}
                    onChange={(e) => setSettings({
                      ...settings,
                      dimepay: { ...settings.dimepay, fixedFee: e.target.value }
                    })}
                    className="border-gray-200"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500">Fixed fee per transaction (default: $30 JMD)</p>
                </div>
              </div>
            </div>

            {/* Fee Pass-through Settings */}
            <div>
              <h4 className="font-medium text-[#111111] mb-3 uppercase text-sm">Fee Pass-through</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-[#111111] text-sm">Pass Fee to Customer</p>
                    <p className="text-xs text-gray-500">Add DimePay fee to storage fee payments</p>
                  </div>
                  <Button
                    variant={settings.dimepay.passFeeToCustomer === 'true' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSettings({
                      ...settings,
                      dimepay: { ...settings.dimepay, passFeeToCustomer: settings.dimepay.passFeeToCustomer === 'true' ? 'false' : 'true' }
                    })}
                    className={settings.dimepay.passFeeToCustomer === 'true' ? 'bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90' : 'border-gray-300'}
                  >
                    {settings.dimepay.passFeeToCustomer === 'true' ? 'ON' : 'OFF'}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-[#111111] text-sm">Pass Fee to Courier</p>
                    <p className="text-xs text-gray-500">Add DimePay fee to courier top-up payments</p>
                  </div>
                  <Button
                    variant={settings.dimepay.passFeeToCourier === 'true' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSettings({
                      ...settings,
                      dimepay: { ...settings.dimepay, passFeeToCourier: settings.dimepay.passFeeToCourier === 'true' ? 'false' : 'true' }
                    })}
                    className={settings.dimepay.passFeeToCourier === 'true' ? 'bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90' : 'border-gray-300'}
                  >
                    {settings.dimepay.passFeeToCourier === 'true' ? 'ON' : 'OFF'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.dimepay && (
              <span className={testResults.dimepay.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.dimepay.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('dimepay', settings.dimepay)}
              disabled={saving === 'dimepay'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'dimepay' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>

        {/* Notifications */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notification Settings
            </CardTitle>
            <CardDescription>Configure automated notifications</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Pickup Reminder (hours)</Label>
              <Input
                type="number"
                value={settings.notifications.pickupReminder}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: { ...settings.notifications, pickupReminder: e.target.value }
                })}
                className="border-gray-200"
              />
              <p className="text-xs text-gray-500">Send reminder after X hours</p>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Abandoned Warning (days)</Label>
              <Input
                type="number"
                value={settings.notifications.abandonedWarning}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: { ...settings.notifications, abandonedWarning: e.target.value }
                })}
                className="border-gray-200"
              />
              <p className="text-xs text-gray-500">Warn before item is abandoned</p>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {testResults.notifications && (
              <span className={testResults.notifications.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResults.notifications.message}
              </span>
            )}
            <Button
              onClick={() => handleSave('notifications', settings.notifications)}
              disabled={saving === 'notifications'}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
            >
              {saving === 'notifications' ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// Couriers content
function CouriersContent() {
  const [couriers, setCouriers] = React.useState<Courier[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addDialog, setAddDialog] = React.useState(false)
  const [addFundsDialog, setAddFundsDialog] = React.useState(false)
  const [editDialog, setEditDialog] = React.useState(false)
  const [deleteDialog, setDeleteDialog] = React.useState(false)
  const [selectedCourier, setSelectedCourier] = React.useState<Courier | null>(null)
  const [addFundsAmount, setAddFundsAmount] = React.useState("")
  const [processing, setProcessing] = React.useState(false)
  const [newCourier, setNewCourier] = React.useState({ name: '', code: '', contactPerson: '', phone: '', email: '', creditLimit: 0 })
  const [editCourier, setEditCourier] = React.useState({ id: '', name: '', code: '', contactPerson: '', phone: '', email: '', address: '' })
  const [topupDialog, setTopupDialog] = React.useState(false)
  const [selectedCourierForTopup, setSelectedCourierForTopup] = React.useState<Courier | null>(null)
  const [topupAmount, setTopupAmount] = React.useState('')
  const [topupQRCode, setTopupQRCode] = React.useState<string | null>(null)
  const [topupUrl, setTopupUrl] = React.useState<string | null>(null)
  const [processingTopup, setProcessingTopup] = React.useState(false)

  const fetchCouriers = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/couriers')
      const data = await res.json()
      if (data.success && data.data.length > 0) setCouriers(data.data)
      else setCouriers([])
    } catch (error) {
      console.error('Failed to fetch couriers:', error)
      setCouriers([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchCouriers()
  }, [fetchCouriers])

  const handleAddCourier = async () => {
    if (!newCourier.name || !newCourier.code) {
      alert('Name and code are required')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch('/api/couriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCourier)
      })
      const data = await res.json()
      if (data.success) {
        setAddDialog(false)
        setNewCourier({ name: '', code: '', contactPerson: '', phone: '', email: '', creditLimit: 0 })
        fetchCouriers()
      } else {
        alert(data.error || 'Failed to add courier')
      }
    } catch (error) {
      console.error('Failed to add courier:', error)
      alert('Failed to add courier')
    } finally {
      setProcessing(false)
    }
  }

  const handleEditCourier = async () => {
    if (!editCourier.name || !editCourier.code) {
      alert('Name and code are required')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch('/api/couriers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editCourier.id,
          action: 'edit',
          name: editCourier.name,
          code: editCourier.code,
          contactPerson: editCourier.contactPerson,
          phone: editCourier.phone,
          email: editCourier.email,
          address: editCourier.address,
        })
      })
      const data = await res.json()
      if (data.success) {
        setEditDialog(false)
        setEditCourier({ id: '', name: '', code: '', contactPerson: '', phone: '', email: '', address: '' })
        fetchCouriers()
        alert('Courier updated successfully!')
      } else {
        alert(data.error || 'Failed to update courier')
      }
    } catch (error) {
      console.error('Failed to update courier:', error)
      alert('Failed to update courier')
    } finally {
      setProcessing(false)
    }
  }

  const handleDeleteCourier = async () => {
    if (!selectedCourier) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/couriers?id=${selectedCourier.id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setDeleteDialog(false)
        setSelectedCourier(null)
        fetchCouriers()
        alert('Courier deleted successfully!')
      } else {
        alert(data.error || 'Failed to delete courier')
      }
    } catch (error) {
      console.error('Failed to delete courier:', error)
      alert('Failed to delete courier')
    } finally {
      setProcessing(false)
    }
  }

  const handleAddFunds = async () => {
    if (!selectedCourier || !addFundsAmount) return
    setProcessing(true)
    try {
      const res = await fetch('/api/couriers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCourier.id,
          action: 'add_balance',
          amount: parseFloat(addFundsAmount)
        })
      })
      const data = await res.json()
      if (data.success) {
        setAddFundsDialog(false)
        setSelectedCourier(null)
        setAddFundsAmount("")
        fetchCouriers()
        alert(data.message)
      } else {
        alert(data.error || 'Failed to add funds')
      }
    } catch (error) {
      console.error('Failed to add funds:', error)
      alert('Failed to add funds')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: "bg-green-500 text-white",
      INACTIVE: "bg-gray-400 text-white",
      SUSPENDED: "bg-red-500 text-white",
    }
    return styles[status] || "bg-gray-200 text-[#111111]"
  }

  const handleCourierTopup = async () => {
    if (!selectedCourierForTopup || !topupAmount) return
    
    setProcessingTopup(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'courier_topup',
          courierId: selectedCourierForTopup.id,
          courierName: selectedCourierForTopup.name,
          amount: parseFloat(topupAmount),
        }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setTopupQRCode(data.data.qrCodeDataUrl)
        setTopupUrl(data.data.paymentUrl)
      } else {
        alert(data.error || 'Failed to create top-up payment')
      }
    } catch (error) {
      console.error('Failed to create top-up:', error)
      alert('Failed to create top-up payment')
    } finally {
      setProcessingTopup(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Couriers</h2>
          <p className="text-gray-500">Manage courier partners and prepaid accounts</p>
        </div>
        <Button onClick={() => setAddDialog(true)} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase">
          <Plus className="mr-2 h-4 w-4" />
          Add Courier
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading couriers...</div>
      ) : (
        <Card className="bg-white border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200">
                <TableHead className="text-gray-500 uppercase text-xs">Name</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Code</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Contact</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Status</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Balance</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Credit Limit</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Orders</TableHead>
                <TableHead className="text-gray-500 uppercase text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {couriers.map((courier) => (
                <TableRow key={courier.id} className="border-gray-200">
                  <TableCell className="font-medium text-[#111111]">{courier.name}</TableCell>
                  <TableCell className="font-mono text-xs">{courier.code}</TableCell>
                  <TableCell className="text-sm">
                    {courier.contactPerson && <div>{courier.contactPerson}</div>}
                    {courier.phone && <div className="text-gray-500 text-xs">{courier.phone}</div>}
                  </TableCell>
                  <TableCell><Badge className={getStatusBadge(courier.status)}>{courier.status}</Badge></TableCell>
                  <TableCell className="font-bold text-[#111111]">{formatCurrency(courier.balance)}</TableCell>
                  <TableCell>{formatCurrency(courier.creditLimit)}</TableCell>
                  <TableCell>{courier._count?.orders || 0}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelectedCourier(courier); setAddFundsDialog(true); }}>
                          <DollarSign className="mr-2 h-4 w-4" />
                          Add Funds
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelectedCourierForTopup(courier); setTopupDialog(true); setTopupQRCode(null); setTopupUrl(null); setTopupAmount(''); }}>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Top-up via DimePay
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={(e) => { 
                          e.preventDefault(); 
                          setEditCourier({ 
                            id: courier.id, 
                            name: courier.name, 
                            code: courier.code, 
                            contactPerson: courier.contactPerson || '', 
                            phone: courier.phone || '', 
                            email: courier.email || '', 
                            address: '' 
                          }); 
                          setEditDialog(true); 
                        }}>
                          Edit Courier
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onSelect={(e) => { e.preventDefault(); setSelectedCourier(courier); setDeleteDialog(true); }}>
                          Delete Courier
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Courier Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Add New Courier</DialogTitle>
            <DialogDescription className="text-gray-500">Register a new courier partner</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Name *</Label>
                <Input placeholder="e.g., Knutsford Express" className="border-gray-200" value={newCourier.name} onChange={(e) => setNewCourier({...newCourier, name: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Code *</Label>
                <Input placeholder="e.g., KE" className="border-gray-200" value={newCourier.code} onChange={(e) => setNewCourier({...newCourier, code: e.target.value.toUpperCase()})} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Contact Person</Label>
              <Input placeholder="Contact name" className="border-gray-200" value={newCourier.contactPerson} onChange={(e) => setNewCourier({...newCourier, contactPerson: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Phone</Label>
                <Input placeholder="876-XXX-XXXX" className="border-gray-200" value={newCourier.phone} onChange={(e) => setNewCourier({...newCourier, phone: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Email</Label>
                <Input placeholder="email@example.com" className="border-gray-200" value={newCourier.email} onChange={(e) => setNewCourier({...newCourier, email: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Credit Limit (JMD)</Label>
              <Input type="number" placeholder="0" className="border-gray-200" value={newCourier.creditLimit || ''} onChange={(e) => setNewCourier({...newCourier, creditLimit: parseFloat(e.target.value) || 0})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleAddCourier} disabled={processing}>Add Courier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Funds Dialog */}
      <Dialog open={addFundsDialog} onOpenChange={setAddFundsDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Add Funds to Prepaid Account</DialogTitle>
            <DialogDescription className="text-gray-500">{selectedCourier?.name} - Current Balance: {formatCurrency(selectedCourier?.balance || 0)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Amount (JMD)</Label>
              <Input type="number" placeholder="Enter amount" className="border-gray-200" value={addFundsAmount} onChange={(e) => setAddFundsAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => { setAddFundsDialog(false); setSelectedCourier(null); setAddFundsAmount("") }}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleAddFunds} disabled={processing || !addFundsAmount}>
              {processing ? 'Processing...' : 'Add Funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Courier Top-up Dialog */}
      <Dialog open={topupDialog} onOpenChange={setTopupDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Top-up Courier Account</DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedCourierForTopup?.name} - Current Balance: ${selectedCourierForTopup?.balance?.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {!topupQRCode ? (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topupAmount">Top-up Amount (JMD)</Label>
                <Input
                  id="topupAmount"
                  type="number"
                  placeholder="Enter amount"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4">
              <img src={topupQRCode} alt="Top-up QR Code" className="w-64 h-64 rounded-lg border border-gray-200" />
              <p className="text-sm text-gray-500 mt-4 text-center">Scan to complete payment</p>
              {topupUrl && (
                <a href={topupUrl} target="_blank" rel="noopener noreferrer" className="mt-4 text-sm text-blue-600 hover:underline">
                  Or click here to pay online
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            {!topupQRCode ? (
              <>
                <Button variant="outline" onClick={() => setTopupDialog(false)}>Cancel</Button>
                <Button 
                  className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold"
                  onClick={handleCourierTopup}
                  disabled={!topupAmount || processingTopup}
                >
                  {processingTopup ? 'Processing...' : 'Generate Payment QR'}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => { setTopupDialog(false); setTopupQRCode(null); setTopupUrl(null); setTopupAmount(''); }}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Courier Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Edit Courier</DialogTitle>
            <DialogDescription className="text-gray-500">Update courier information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Name *</Label>
                <Input 
                  placeholder="Courier name" 
                  className="border-gray-200" 
                  value={editCourier.name} 
                  onChange={(e) => setEditCourier({...editCourier, name: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Code *</Label>
                <Input 
                  placeholder="e.g., KE" 
                  className="border-gray-200" 
                  value={editCourier.code} 
                  onChange={(e) => setEditCourier({...editCourier, code: e.target.value.toUpperCase()})} 
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Contact Person</Label>
              <Input 
                placeholder="Contact name" 
                className="border-gray-200" 
                value={editCourier.contactPerson} 
                onChange={(e) => setEditCourier({...editCourier, contactPerson: e.target.value})} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Phone</Label>
                <Input 
                  placeholder="876-XXX-XXXX" 
                  className="border-gray-200" 
                  value={editCourier.phone} 
                  onChange={(e) => setEditCourier({...editCourier, phone: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-[#111111] uppercase text-sm">Email</Label>
                <Input 
                  placeholder="email@example.com" 
                  className="border-gray-200" 
                  value={editCourier.email} 
                  onChange={(e) => setEditCourier({...editCourier, email: e.target.value})} 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleEditCourier} disabled={processing}>
              {processing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Courier Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Delete Courier</DialogTitle>
            <DialogDescription className="text-gray-500">
              Are you sure you want to delete <strong>{selectedCourier?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Couriers with existing orders cannot be deleted. You can suspend them instead.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => { setDeleteDialog(false); setSelectedCourier(null); }}>Cancel</Button>
            <Button variant="destructive" className="uppercase" onClick={handleDeleteCourier} disabled={processing}>
              {processing ? 'Deleting...' : 'Delete Courier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// SMS & Alerts content
function SMSContent() {
  const [activeTab, setActiveTab] = React.useState('history')
  const [smsHistory, setSmsHistory] = React.useState<Array<{id: string; to: string; message: string; status: string; cost?: number; segments?: number; templateKey?: string; createdAt: string}>>([])
  const [templates, setTemplates] = React.useState<Array<{id: string; key: string; name: string; description?: string; template: string; variables: string[]; isActive: boolean}>>([])
  const [queueStats, setQueueStats] = React.useState({ pending: 0, sent: 0, delivered: 0, failed: 0, totalCost: 0 })
  const [loading, setLoading] = React.useState(true)
  const [testDialog, setTestDialog] = React.useState(false)
  const [templateDialog, setTemplateDialog] = React.useState(false)
  const [editingTemplate, setEditingTemplate] = React.useState<{id: string; key: string; name: string; description: string; template: string} | null>(null)
  const [testPhone, setTestPhone] = React.useState("")
  const [testMessage, setTestMessage] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [smsStats, setSmsStats] = React.useState({
    sentToday: 0,
    totalSent: 0,
    totalFailed: 0,
    textBeeTotal: 0,
    totalCost: 0,
    todayCost: 0
  })
  const [deviceInfo, setDeviceInfo] = React.useState<{
    online: boolean;
    brand: string;
    model: string;
  } | null>(null)
  const [smsSettings, setSmsSettings] = React.useState({
    signature: '- Pickup Jamaica',
    costPerSms: '5',
    maxRetries: '3'
  })
  // Marketing state
  const [marketingCampaigns, setMarketingCampaigns] = React.useState<Array<{
    id: string;
    name: string;
    message: string;
    targetSegment: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    status: string;
    createdAt: string;
  }>>([])
  const [marketingStats, setMarketingStats] = React.useState({
    totalCampaigns: 0,
    totalSent: 0,
    totalRecipients: 0
  })
  const [marketingSegments, setMarketingSegments] = React.useState<Array<{
    id: string;
    name: string;
    count: number;
  }>>([])
  const [newCampaign, setNewCampaign] = React.useState({
    name: '',
    message: '',
    targetSegment: 'all_customers',
    customPhones: ''
  })
  const [previewData, setPreviewData] = React.useState<{
    totalRecipients: number;
    recipients: Array<{ phone: string; name: string }>;
  } | null>(null)
  const [showPreview, setShowPreview] = React.useState(false)
  const [sendingCampaign, setSendingCampaign] = React.useState(false)

  const fetchSMSData = React.useCallback(async () => {
    setLoading(true)
    try {
      console.log('Fetching SMS data...')
      const [smsRes, templatesRes, queueRes, settingsRes, segmentsRes, campaignsRes, statsRes] = await Promise.all([
        fetch('/api/sms'),
        fetch('/api/sms/templates'),
        fetch('/api/sms/queue'),
        fetch('/api/settings'),
        fetch('/api/sms/marketing?segments=list'),
        fetch('/api/sms/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history' }) }),
        fetch('/api/sms/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stats' }) }),
      ])

      console.log('API responses received:', {
        sms: smsRes.status,
        templates: templatesRes.status,
        queue: queueRes.status,
        settings: settingsRes.status
      })

      const smsData = await smsRes.json()
      const templatesData = await templatesRes.json()
      const queueData = await queueRes.json()
      const settingsData = await settingsRes.json()
      const segmentsData = await segmentsRes.json()
      const campaignsData = await campaignsRes.json()
      const statsData = await statsRes.json()

      console.log('SMS data:', smsData)
      console.log('Templates data:', templatesData)
      console.log('Queue data:', queueData)

      if (smsData.success) {
        setSmsHistory(smsData.history || [])
        setSmsStats(smsData.stats || { sentToday: 0, totalSent: 0, totalFailed: 0, textBeeTotal: 0, totalCost: 0, todayCost: 0 })
        setDeviceInfo(smsData.device || null)
        console.log('SMS state updated:', smsData.history?.length, 'messages')
      } else {
        console.error('SMS API returned error:', smsData.error)
      }

      if (templatesData.success) {
        setTemplates(templatesData.templates || [])
        console.log('Templates updated:', templatesData.templates?.length, 'templates')
      } else {
        console.error('Templates API returned error:', templatesData.error)
      }

      if (queueData.success) {
        setQueueStats(queueData.stats || { pending: 0, sent: 0, delivered: 0, failed: 0, totalCost: 0 })
      }

      if (settingsData.success) {
        setSmsSettings(settingsData.data?.sms || { signature: '- Pickup Jamaica', costPerSms: '5', maxRetries: '3' })
      }

      // Marketing data
      if (segmentsData.success && segmentsData.data?.segments) {
        setMarketingSegments(segmentsData.data.segments)
      }
      if (campaignsData.success && campaignsData.data) {
        setMarketingCampaigns(campaignsData.data)
      }
      if (statsData.success && statsData.data) {
        setMarketingStats({
          totalCampaigns: statsData.data.totalCampaigns || 0,
          totalSent: statsData.data.totalSent || 0,
          totalRecipients: statsData.data.totalRecipients || 0
        })
      }
    } catch (error) {
      console.error('Failed to fetch SMS data:', error)
    } finally {
      setLoading(false)
      console.log('Loading complete')
    }
  }, [])

  React.useEffect(() => {
    fetchSMSData()
  }, [fetchSMSData])

  const handleSendTest = async () => {
    if (!testPhone || !testMessage) {
      alert('Phone and message are required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: testPhone, message: testMessage })
      })
      const data = await res.json()
      if (data.success) {
        alert(`SMS sent successfully! Cost: $${data.estimatedCost || 0} JMD (${data.segments || 1} segment${data.segments > 1 ? 's' : ''})`)
        setTestDialog(false)
        setTestPhone("")
        setTestMessage("")
        fetchSMSData()
      } else {
        alert(data.error || 'Failed to send SMS')
      }
    } catch (error) {
      console.error('Failed to send SMS:', error)
      alert('Failed to send SMS')
    } finally {
      setSending(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    
    // Validate required fields
    if (!editingTemplate.key || !editingTemplate.name || !editingTemplate.template) {
      alert('Template Key, Name, and Message are required')
      return
    }
    
    try {
      const isNew = !editingTemplate.id
      const res = await fetch('/api/sms/templates', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTemplate)
      })
      const data = await res.json()
      if (data.success) {
        alert(isNew ? 'Template created!' : 'Template updated!')
        setTemplateDialog(false)
        setEditingTemplate(null)
        fetchSMSData()
      } else {
        alert(data.error || 'Failed to save template')
      }
    } catch (error) {
      console.error('Failed to save template:', error)
      alert('Failed to save template')
    }
  }

  const handleRetryMessage = async (id: string) => {
    try {
      const res = await fetch('/api/sms/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', messageId: id })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Retry ${data.retried > 0 ? 'successful' : 'failed'}`)
        fetchSMSData()
      }
    } catch (error) {
      console.error('Failed to retry:', error)
    }
  }

  const handleDeleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return
    try {
      await fetch(`/api/sms/queue?id=${id}`, { method: 'DELETE' })
      fetchSMSData()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleSaveSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'sms', settings: smsSettings })
      })
      alert('Settings saved!')
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  // Marketing handlers
  const handlePreviewCampaign = async () => {
    if (!newCampaign.targetSegment) {
      alert('Please select a target segment')
      return
    }
    setSendingCampaign(true)
    try {
      const res = await fetch('/api/sms/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          targetSegment: newCampaign.targetSegment,
          customPhones: newCampaign.targetSegment === 'custom' ? newCampaign.customPhones.split(',').map(p => p.trim()) : undefined
        })
      })
      const data = await res.json()
      if (data.success) {
        setPreviewData(data.data)
        setShowPreview(true)
      } else {
        alert(data.error || 'Failed to preview')
      }
    } catch (error) {
      console.error('Preview error:', error)
      alert('Failed to preview')
    } finally {
      setSendingCampaign(false)
    }
  }

  const handleSendCampaign = async () => {
    if (!newCampaign.name || !newCampaign.message) {
      alert('Campaign name and message are required')
      return
    }
    if (!confirm(`Send campaign "${newCampaign.name}" to ${previewData?.totalRecipients || 0} recipients?`)) return

    setSendingCampaign(true)
    try {
      const res = await fetch('/api/sms/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          campaignName: newCampaign.name,
          message: newCampaign.message,
          targetSegment: newCampaign.targetSegment,
          customPhones: newCampaign.targetSegment === 'custom' ? newCampaign.customPhones.split(',').map(p => p.trim()) : undefined
        })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Campaign sent! ${data.data.sent} messages sent, ${data.data.failed} failed`)
        setNewCampaign({ name: '', message: '', targetSegment: 'all_customers', customPhones: '' })
        setPreviewData(null)
        setShowPreview(false)
        fetchSMSData()
      } else {
        alert(data.error || 'Failed to send campaign')
      }
    } catch (error) {
      console.error('Send campaign error:', error)
      alert('Failed to send campaign')
    } finally {
      setSendingCampaign(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DELIVERED: "bg-green-500 text-white",
      SENT: "bg-green-500 text-white",
      PENDING: "bg-yellow-500 text-white",
      FAILED: "bg-red-500 text-white",
    }
    return styles[status] || "bg-gray-200 text-[#111111]"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>SMS & Alerts</h2>
          <p className="text-gray-500">Manage SMS notifications via TextBee</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchSMSData} variant="outline" className="border-gray-300">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setTestDialog(true)} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase">
            <MessageSquare className="mr-2 h-4 w-4" />
            Send Test SMS
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#111111]">{smsStats.sentToday}</p>
            <p className="text-xs text-gray-500">${smsStats.todayCost} JMD</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Total (TextBee)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{smsStats.textBeeTotal}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{smsStats.totalFailed}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#111111]">${smsStats.totalCost}</p>
            <p className="text-xs text-gray-500">JMD</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Device</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${deviceInfo?.online ? 'bg-green-500' : 'bg-red-500'}`} />
              <p className="text-xs font-bold text-[#111111]">
                {deviceInfo ? `${deviceInfo.brand}` : 'Offline'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100">
          <TabsTrigger value="history" className="data-[state=active]:bg-white">History</TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-white">Templates</TabsTrigger>
          <TabsTrigger value="queue" className="data-[state=active]:bg-white">Queue</TabsTrigger>
          <TabsTrigger value="marketing" className="data-[state=active]:bg-white">Marketing</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-white">Settings</TabsTrigger>
        </TabsList>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">Recent Messages</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : smsHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No SMS messages sent yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-500 uppercase text-xs">To</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Message</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Status</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Cost</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smsHistory.map((sms) => (
                      <TableRow key={sms.id} className="border-gray-200">
                        <TableCell className="font-mono text-xs text-[#111111]">{sms.to}</TableCell>
                        <TableCell className="text-xs text-[#111111] max-w-xs truncate">{sms.message}</TableCell>
                        <TableCell><Badge className={getStatusBadge(sms.status)}>{sms.status}</Badge></TableCell>
                        <TableCell className="text-xs">${sms.cost || 0}</TableCell>
                        <TableCell className="text-xs text-gray-500">{formatDate(sms.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[#111111] uppercase">SMS Templates</CardTitle>
                  <CardDescription>Customize message templates with variables like {`{{customerName}}`}, {`{{trackingCode}}`}</CardDescription>
                </div>
                <Button 
                  size="sm" 
                  className="bg-[#FFD439] text-[#111111]"
                  onClick={() => {
                    setEditingTemplate({ id: '', key: '', name: '', description: '', template: '' })
                    setTemplateDialog(true)
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No templates yet</p>
                  <Button className="mt-4 bg-[#FFD439] text-[#111111]" onClick={() => {
                    setEditingTemplate({ id: '', key: '', name: '', description: '', template: '' })
                    setTemplateDialog(true)
                  }}>Create First Template</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-[#111111]">{template.name}</h4>
                          <p className="text-xs text-gray-500">{template.description}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingTemplate({
                            id: template.id,
                            key: template.key,
                            name: template.name,
                            description: template.description || '',
                            template: template.template
                          })
                          setTemplateDialog(true)
                        }}>Edit</Button>
                      </div>
                      <pre className="text-xs bg-gray-50 p-3 rounded whitespace-pre-wrap font-mono">{template.template}</pre>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {template.variables?.map((v: string) => (
                          <span key={v} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">{`{{${v}}}`}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">SMS Queue</CardTitle>
              <CardDescription>View and manage pending, failed, and sent messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <p className="text-2xl font-bold text-yellow-600">{queueStats.pending}</p>
                  <p className="text-xs text-gray-600">Pending</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <p className="text-2xl font-bold text-green-600">{queueStats.sent}</p>
                  <p className="text-xs text-gray-600">Sent</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <p className="text-2xl font-bold text-blue-600">{queueStats.delivered}</p>
                  <p className="text-xs text-gray-600">Delivered</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <p className="text-2xl font-bold text-red-600">{queueStats.failed}</p>
                  <p className="text-xs text-gray-600">Failed</p>
                </div>
              </div>
              {smsHistory.filter(s => s.status === 'FAILED' || s.status === 'PENDING').length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-300 mb-2" />
                  <p>No pending or failed messages</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">To</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smsHistory.filter(s => s.status === 'FAILED' || s.status === 'PENDING').map((sms) => (
                      <TableRow key={sms.id}>
                        <TableCell className="text-xs">{sms.to}</TableCell>
                        <TableCell><Badge className={getStatusBadge(sms.status)}>{sms.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleRetryMessage(sms.id)}>Retry</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteMessage(sms.id)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Tab */}
        <TabsContent value="marketing">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-600 uppercase">Total Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-[#111111]">{marketingStats.totalCampaigns}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-600 uppercase">Total Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{marketingStats.totalSent}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-600 uppercase">Recipients</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-600">{marketingStats.totalRecipients}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#111111] uppercase">Send Marketing SMS</CardTitle>
                <CardDescription>Broadcast SMS to customer segments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Campaign Name</Label>
                  <Input
                    placeholder="e.g., March Promotion"
                    className="border-gray-200"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Target Segment</Label>
                  <Select
                    value={newCampaign.targetSegment}
                    onValueChange={(value) => setNewCampaign({ ...newCampaign, targetSegment: value })}
                  >
                    <SelectTrigger className="border-gray-200">
                      <SelectValue placeholder="Select target audience" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {marketingSegments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name} ({segment.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newCampaign.targetSegment === 'custom' && (
                  <div className="grid gap-2">
                    <Label className="text-sm font-medium">Custom Phone Numbers</Label>
                    <p className="text-xs text-gray-500">Comma-separated phone numbers</p>
                    <textarea
                      className="w-full min-h-[60px] p-3 border border-gray-200 rounded-md text-sm"
                      placeholder="876-555-0101, 876-555-0202, ..."
                      value={newCampaign.customPhones}
                      onChange={(e) => setNewCampaign({ ...newCampaign, customPhones: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Message</Label>
                  <p className="text-xs text-gray-500">Use {"{name}"} to personalize with customer name</p>
                  <textarea
                    className="w-full min-h-[100px] p-3 border border-gray-200 rounded-md text-sm"
                    placeholder="Hi {name}! Check out our new services at Pickup Jamaica. Visit us today!"
                    value={newCampaign.message}
                    onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">{newCampaign.message.length} chars | ~{Math.ceil(newCampaign.message.length / 153) || 1} segment(s)</p>
                </div>

                {/* Preview Results */}
                {showPreview && previewData && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#111111]">Preview: {previewData.totalRecipients} recipients</span>
                      <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>Hide</Button>
                    </div>
                    <div className="max-h-40 overflow-y-auto text-xs text-gray-600">
                      {previewData.recipients.slice(0, 20).map((r, i) => (
                        <span key={i} className="inline-block bg-white px-2 py-1 m-0.5 rounded border">
                          {r.name} ({r.phone})
                        </span>
                      ))}
                      {previewData.totalRecipients > 20 && (
                        <span className="text-gray-400 ml-2">+{previewData.totalRecipients - 20} more...</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <Button
                    className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                    onClick={handlePreviewCampaign}
                    disabled={sendingCampaign}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Preview Recipients
                  </Button>
                  <Button
                    className="bg-[#111111] text-white hover:bg-gray-800 font-bold uppercase"
                    onClick={handleSendCampaign}
                    disabled={sendingCampaign || !previewData}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {sendingCampaign ? 'Sending...' : 'Send Campaign'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#111111] uppercase">Campaign History</CardTitle>
                <CardDescription>View past marketing campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                {marketingCampaigns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                    <p>No campaigns sent yet</p>
                    <p className="text-xs">Create your first marketing campaign above</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-200">
                        <TableHead className="text-xs uppercase text-gray-500">Name</TableHead>
                        <TableHead className="text-xs uppercase text-gray-500">Segment</TableHead>
                        <TableHead className="text-xs uppercase text-gray-500">Recipients</TableHead>
                        <TableHead className="text-xs uppercase text-gray-500">Sent/Failed</TableHead>
                        <TableHead className="text-xs uppercase text-gray-500">Status</TableHead>
                        <TableHead className="text-xs uppercase text-gray-500">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {marketingCampaigns.map((campaign) => (
                        <TableRow key={campaign.id} className="border-gray-200">
                          <TableCell className="font-medium text-[#111111]">{campaign.name}</TableCell>
                          <TableCell className="text-sm">{campaign.targetSegment}</TableCell>
                          <TableCell className="text-sm">{campaign.totalRecipients}</TableCell>
                          <TableCell className="text-sm">
                            <span className="text-green-600">{campaign.sentCount}</span>
                            {campaign.failedCount > 0 && (
                              <span className="text-red-600"> / {campaign.failedCount}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              campaign.status === 'SENT' ? 'bg-green-500 text-white' :
                              campaign.status === 'FAILED' ? 'bg-red-500 text-white' :
                              campaign.status === 'SENDING' ? 'bg-yellow-500 text-white' :
                              'bg-gray-200 text-[#111111]'
                            }>
                              {campaign.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">{formatDate(campaign.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">SMS Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label className="text-sm font-medium">Business Signature</Label>
                  <p className="text-xs text-gray-500 mb-2">Appended to all SMS messages. Use {`{{signature}}`} in templates.</p>
                  <Input 
                    value={smsSettings.signature} 
                    onChange={(e) => setSmsSettings({...smsSettings, signature: e.target.value})}
                    placeholder="- Pickup Jamaica"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Cost Per SMS (JMD)</Label>
                  <p className="text-xs text-gray-500 mb-2">Used for cost tracking and reporting</p>
                  <Input 
                    type="number"
                    value={smsSettings.costPerSms} 
                    onChange={(e) => setSmsSettings({...smsSettings, costPerSms: e.target.value})}
                    placeholder="5"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Max Retries</Label>
                  <p className="text-xs text-gray-500 mb-2">Number of retry attempts for failed messages</p>
                  <Input 
                    type="number"
                    value={smsSettings.maxRetries} 
                    onChange={(e) => setSmsSettings({...smsSettings, maxRetries: e.target.value})}
                    placeholder="3"
                  />
                </div>
              </div>
              <Button onClick={handleSaveSettings} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold">
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Test SMS Dialog */}
      <Dialog open={testDialog} onOpenChange={setTestDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Send Test SMS</DialogTitle>
            <DialogDescription className="text-gray-500">Send a test message via TextBee</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Phone Number</Label>
              <Input placeholder="876-XXX-XXXX" className="border-gray-200" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Message</Label>
              <textarea 
                className="border border-gray-200 rounded-md p-2 text-sm"
                rows={4}
                placeholder="Test message" 
                value={testMessage} 
                onChange={(e) => setTestMessage(e.target.value)} 
              />
              <p className="text-xs text-gray-500">{testMessage.length} chars | ~{Math.ceil(testMessage.length / 153) || 1} segment(s)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setTestDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleSendTest} disabled={sending}>
              {sending ? 'Sending...' : 'Send SMS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Template Dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">
              {editingTemplate?.id ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Template Key *</Label>
                <Input 
                  value={editingTemplate.key} 
                  onChange={(e) => setEditingTemplate({...editingTemplate, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})} 
                  placeholder="e.g., welcome_message"
                  disabled={!!editingTemplate.id}
                />
                <p className="text-xs text-gray-500">Unique identifier for this template (lowercase, no spaces)</p>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Template Name *</Label>
                <Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})} placeholder="e.g., Welcome Message" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Description</Label>
                <Input value={editingTemplate.description} onChange={(e) => setEditingTemplate({...editingTemplate, description: e.target.value})} placeholder="When this template is used" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Message Template *</Label>
                <textarea 
                  className="border border-gray-200 rounded-md p-2 text-sm font-mono"
                  rows={8}
                  value={editingTemplate.template} 
                  onChange={(e) => setEditingTemplate({...editingTemplate, template: e.target.value})} 
                  placeholder="Hi {{customerName}}, your package is ready..."
                />
                <p className="text-xs text-gray-500">Use {`{{variableName}}`} for dynamic content. Use {`{{signature}}`} for business signature.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111]" onClick={handleSaveTemplate}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Activity Content - Shows occupied boxes, activity logs, and order lookup
function ActivityContent() {
  const [loading, setLoading] = React.useState(true)
  const [occupiedBoxes, setOccupiedBoxes] = React.useState<Array<{
    deviceId: string;
    deviceName: string;
    boxName: string;
    boxSize: string;
    orderNo: string;
    saveTime: string | null;
    pickCode?: string;
  }>>([])
  const [activityLogs, setActivityLogs] = React.useState<Array<{
    taskId: number;
    deviceId: string;
    deviceName: string;
    boxName: string;
    action: string;
    actionTime: string;
    remark: string;
  }>>([])
  const [activeTab, setActiveTab] = React.useState('occupied')
  
  // Order lookup states
  const [lookupOrderNo, setLookupOrderNo] = React.useState('')
  const [lookingUp, setLookingUp] = React.useState(false)
  const [lookupResult, setLookupResult] = React.useState<{
    found: boolean;
    order?: {
      orderNo: string;
      boxName: string;
      boxSize: string;
      saveTime: string;
      pickTime?: string;
      status: string;
    };
    logs?: Array<{
      action: string;
      actionTime: string;
      remark: string;
    }>;
    message?: string;
  } | null>(null)

  const fetchActivityData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/activity?logs=true')
      const data = await res.json()
      if (data.success) {
        setOccupiedBoxes(data.occupiedBoxes || [])
        setActivityLogs(data.activityLogs || [])
      }
    } catch (error) {
      console.error('Failed to fetch activity data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchActivityData()
  }, [fetchActivityData])

  // Lookup order by order number
  const handleLookupOrder = async () => {
    if (!lookupOrderNo.trim()) return
    
    setLookingUp(true)
    setLookupResult(null)
    
    try {
      const res = await fetch('/api/activity?logs=true')
      const data = await res.json()
      
      if (data.success) {
        // Search in occupied boxes
        const foundOccupied = data.occupiedBoxes?.find(
          (box: { orderNo: string }) => box.orderNo === lookupOrderNo.trim()
        )
        
        // Search in activity logs for this order
        const orderLogs = data.activityLogs?.filter(
          (log: { remark: string }) => log.remark?.includes(lookupOrderNo.trim())
        )
        
        if (foundOccupied) {
          setLookupResult({
            found: true,
            order: {
              orderNo: foundOccupied.orderNo,
              boxName: foundOccupied.boxName,
              boxSize: foundOccupied.boxSize,
              saveTime: foundOccupied.saveTime || '',
              status: 'STORED',
            },
            logs: orderLogs?.map((log: { action: string; actionTime: string; remark: string }) => ({
              action: log.action,
              actionTime: log.actionTime,
              remark: log.remark,
            })),
          })
        } else if (orderLogs && orderLogs.length > 0) {
          // Order was found in logs but not currently stored
          setLookupResult({
            found: true,
            order: {
              orderNo: lookupOrderNo.trim(),
              boxName: orderLogs[0].boxName,
              boxSize: 'Unknown',
              saveTime: orderLogs.find((l: { action: string }) => l.action === 'save')?.actionTime || '',
              pickTime: orderLogs.find((l: { action: string }) => l.action === 'take')?.actionTime,
              status: 'COLLECTED',
            },
            logs: orderLogs.map((log: { action: string; actionTime: string; remark: string }) => ({
              action: log.action,
              actionTime: log.actionTime,
              remark: log.remark,
            })),
          })
        } else {
          setLookupResult({
            found: false,
            message: `Order "${lookupOrderNo}" not found. It may not exist in the system or may have been created before this system was in use.`,
          })
        }
      }
    } catch (error) {
      console.error('Failed to lookup order:', error)
      setLookupResult({
        found: false,
        message: 'Failed to search for order. Please try again.',
      })
    } finally {
      setLookingUp(false)
    }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleString('en-JM', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getActionBadge = (action: string) => {
    const styles: Record<string, string> = {
      save: 'bg-green-100 text-green-700 border-green-200',
      take: 'bg-blue-100 text-blue-700 border-blue-200',
      open: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    }
    return (
      <Badge variant="outline" className={styles[action] || 'bg-gray-100 text-gray-700'}>
        {action.toUpperCase()}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Activity & Logs
          </h2>
          <p className="text-gray-500">View occupied boxes, activity history, and search orders</p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchActivityData} 
          disabled={loading}
          className="border-gray-300"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Order Lookup Card */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#111111] uppercase flex items-center gap-2">
            <Search className="h-5 w-5" />
            Order Lookup
          </CardTitle>
          <CardDescription>Search for an order by order number (e.g., 16650, DH-20250225-001)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter order number..."
              value={lookupOrderNo}
              onChange={(e) => setLookupOrderNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookupOrder()}
              className="border-gray-200 max-w-md"
            />
            <Button 
              onClick={handleLookupOrder} 
              disabled={lookingUp || !lookupOrderNo.trim()}
              className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold"
            >
              {lookingUp ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {lookupResult && (
            <div className={`mt-4 p-4 rounded-lg ${lookupResult.found ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              {lookupResult.found ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-bold text-green-700">Order Found</span>
                    <Badge className={lookupResult.order?.status === 'STORED' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}>
                      {lookupResult.order?.status}
                    </Badge>
                  </div>
                  {lookupResult.order && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 uppercase text-xs">Order No</p>
                        <p className="font-mono font-bold">{lookupResult.order.orderNo}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 uppercase text-xs">Box</p>
                        <p className="font-bold">{lookupResult.order.boxName} ({lookupResult.order.boxSize})</p>
                      </div>
                      <div>
                        <p className="text-gray-500 uppercase text-xs">Stored</p>
                        <p>{formatTime(lookupResult.order.saveTime)}</p>
                      </div>
                      {lookupResult.order.pickTime && (
                        <div>
                          <p className="text-gray-500 uppercase text-xs">Collected</p>
                          <p>{formatTime(lookupResult.order.pickTime)}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {lookupResult.logs && lookupResult.logs.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-600 mb-2">Activity History:</p>
                      <div className="space-y-1">
                        {lookupResult.logs.map((log, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            {getActionBadge(log.action)}
                            <span className="text-gray-500">{formatTime(log.actionTime)}</span>
                            {log.remark && <span className="text-gray-400">- {log.remark}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="text-yellow-700">{lookupResult.message}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Occupied/Logs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100">
          <TabsTrigger value="occupied" className="data-[state=active]:bg-[#FFD439] data-[state=active]:text-[#111111]">
            <Package className="h-4 w-4 mr-2" />
            Occupied Boxes ({occupiedBoxes.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-[#FFD439] data-[state=active]:text-[#111111]">
            <Clock className="h-4 w-4 mr-2" />
            Activity Logs ({activityLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="occupied" className="mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">Currently Occupied Boxes</CardTitle>
              <CardDescription>Boxes with packages stored (from Bestwond lockers)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : occupiedBoxes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No occupied boxes found</p>
                  <p className="text-sm text-gray-400 mt-1">All boxes are empty or no devices are configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-500 uppercase">Device</TableHead>
                      <TableHead className="text-gray-500 uppercase">Box</TableHead>
                      <TableHead className="text-gray-500 uppercase">Size</TableHead>
                      <TableHead className="text-gray-500 uppercase">Order No</TableHead>
                      <TableHead className="text-gray-500 uppercase">Stored At</TableHead>
                      <TableHead className="text-gray-500 uppercase">Pick Code</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occupiedBoxes.map((box, idx) => (
                      <TableRow key={idx} className="border-gray-200">
                        <TableCell className="font-medium text-[#111111]">{box.deviceName}</TableCell>
                        <TableCell>
                          <Badge className="bg-[#FFD439] text-[#111111]">{box.boxName}</Badge>
                        </TableCell>
                        <TableCell>{box.boxSize}</TableCell>
                        <TableCell className="font-mono text-sm">{box.orderNo}</TableCell>
                        <TableCell className="text-sm text-gray-600">{formatTime(box.saveTime || '')}</TableCell>
                        <TableCell className="font-mono">{box.pickCode || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">Activity History</CardTitle>
              <CardDescription>Historical box activity from Bestwond lockers</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No activity logs found</p>
                  <p className="text-sm text-gray-400 mt-1">Activity will appear here when boxes are used</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-500 uppercase">Time</TableHead>
                      <TableHead className="text-gray-500 uppercase">Device</TableHead>
                      <TableHead className="text-gray-500 uppercase">Box</TableHead>
                      <TableHead className="text-gray-500 uppercase">Action</TableHead>
                      <TableHead className="text-gray-500 uppercase">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityLogs.slice(0, 100).map((log, idx) => (
                      <TableRow key={idx} className="border-gray-200">
                        <TableCell className="text-sm text-gray-600">{formatTime(log.actionTime)}</TableCell>
                        <TableCell className="font-medium text-[#111111]">{log.deviceName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-gray-300">{log.boxName}</Badge>
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="text-sm text-gray-500">{log.remark || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Email Content
function EmailContent() {
  const [activeTab, setActiveTab] = React.useState('history')
  const [emailHistory, setEmailHistory] = React.useState<Array<{id: string; to: string; subject: string; status: string; templateKey?: string; error?: string; createdAt: string}>>([])
  const [templates, setTemplates] = React.useState<Array<{id: string; key: string; name: string; description?: string; subject: string; body: string; variables: string[]; isActive: boolean}>>([])
  const [loading, setLoading] = React.useState(true)
  const [testDialog, setTestDialog] = React.useState(false)
  const [templateDialog, setTemplateDialog] = React.useState(false)
  const [editingTemplate, setEditingTemplate] = React.useState<{id: string; key: string; name: string; description: string; subject: string; body: string} | null>(null)
  const [testEmail, setTestEmail] = React.useState("")
  const [testSubject, setTestSubject] = React.useState("")
  const [testBody, setTestBody] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [emailStats, setEmailStats] = React.useState({
    sentToday: 0,
    totalSent: 0,
    totalFailed: 0,
  })
  const [emailConfig, setEmailConfig] = React.useState<{
    enabled: boolean;
    configured: boolean;
    host: string;
    user: string;
  }>({ enabled: false, configured: false, host: '', user: '' })
  const [emailSettings, setEmailSettings] = React.useState({
    enabled: 'false',
    host: '',
    port: '587',
    secure: 'true',
    user: '',
    password: '',
    fromEmail: 'noreply@pickupja.com',
    fromName: 'Pickup Jamaica',
  })
  const [testingConnection, setTestingConnection] = React.useState(false)
  const [connectionStatus, setConnectionStatus] = React.useState<'idle' | 'success' | 'error'>('idle')

  const fetchEmailData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [emailRes, templatesRes, settingsRes] = await Promise.all([
        fetch('/api/email'),
        fetch('/api/email/templates'),
        fetch('/api/settings')
      ])

      const emailData = await emailRes.json()
      const templatesData = await templatesRes.json()
      const settingsData = await settingsRes.json()

      if (emailData.success) {
        setEmailHistory(emailData.history || [])
        setEmailStats(emailData.stats || { sentToday: 0, totalSent: 0, totalFailed: 0 })
        setEmailConfig(emailData.config || { enabled: false, configured: false, host: '', user: '' })
      }

      if (templatesData.success) {
        setTemplates(templatesData.templates || [])
      }

      if (settingsData.success) {
        setEmailSettings(settingsData.data?.email || {
          enabled: 'false',
          host: '',
          port: '587',
          secure: 'true',
          user: '',
          password: '',
          fromEmail: 'noreply@pickupja.com',
          fromName: 'Pickup Jamaica',
        })
      }
    } catch (error) {
      console.error('Failed to fetch email data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchEmailData()
  }, [fetchEmailData])

  const handleSendTest = async () => {
    if (!testEmail || !testSubject || !testBody) {
      alert('Email, subject, and body are required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', to: testEmail, subject: testSubject, html: testBody })
      })
      const data = await res.json()
      if (data.success) {
        alert('Email sent successfully!')
        setTestDialog(false)
        setTestEmail("")
        setTestSubject("")
        setTestBody("")
        fetchEmailData()
      } else {
        alert(data.error || 'Failed to send email')
      }
    } catch (error) {
      console.error('Failed to send email:', error)
      alert('Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return

    if (!editingTemplate.key || !editingTemplate.name || !editingTemplate.subject || !editingTemplate.body) {
      alert('Template Key, Name, Subject, and Body are required')
      return
    }

    try {
      const isNew = !editingTemplate.id
      const res = await fetch('/api/email/templates', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTemplate)
      })
      const data = await res.json()
      if (data.success) {
        alert(isNew ? 'Template created!' : 'Template updated!')
        setTemplateDialog(false)
        setEditingTemplate(null)
        fetchEmailData()
      } else {
        alert(data.error || 'Failed to save template')
      }
    } catch (error) {
      console.error('Failed to save template:', error)
      alert('Failed to save template')
    }
  }

  const handleSaveSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'email', settings: emailSettings })
      })
      alert('Email settings saved!')
      fetchEmailData()
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus('idle')
    try {
      const res = await fetch('/api/email/send')
      const data = await res.json()
      if (data.success) {
        setConnectionStatus('success')
      } else {
        setConnectionStatus('error')
      }
    } catch {
      setConnectionStatus('error')
    } finally {
      setTestingConnection(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DELIVERED: "bg-green-500 text-white",
      SENT: "bg-green-500 text-white",
      PENDING: "bg-yellow-500 text-white",
      FAILED: "bg-red-500 text-white",
    }
    return styles[status] || "bg-gray-200 text-[#111111]"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>Email Notifications</h2>
          <p className="text-gray-500">Configure SMTP and manage email templates</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchEmailData} variant="outline" className="border-gray-300">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setTestDialog(true)} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" disabled={!emailConfig.configured}>
            <Mail className="mr-2 h-4 w-4" />
            Send Test Email
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {!emailConfig.configured && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Email not configured</p>
                <p className="text-sm text-yellow-600">Configure SMTP settings in the Settings tab to enable email notifications</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#111111]">{emailStats.sentToday}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Total Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{emailStats.totalSent}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{emailStats.totalFailed}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 uppercase">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${emailConfig.configured ? (emailConfig.enabled ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'}`} />
              <p className="text-xs font-bold text-[#111111]">
                {!emailConfig.configured ? 'Not Configured' : (emailConfig.enabled ? 'Enabled' : 'Disabled')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-100">
          <TabsTrigger value="history" className="data-[state=active]:bg-white">History</TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-white">Templates</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-white">SMTP Settings</TabsTrigger>
        </TabsList>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">Recent Emails</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : emailHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No emails sent yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-500 uppercase text-xs">To</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Subject</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Status</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Template</TableHead>
                      <TableHead className="text-gray-500 uppercase text-xs">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailHistory.map((email) => (
                      <TableRow key={email.id} className="border-gray-200">
                        <TableCell className="text-xs text-[#111111]">{email.to}</TableCell>
                        <TableCell className="text-xs text-[#111111] max-w-xs truncate">{email.subject}</TableCell>
                        <TableCell><Badge className={getStatusBadge(email.status)}>{email.status}</Badge></TableCell>
                        <TableCell className="text-xs text-gray-500">{email.templateKey || '-'}</TableCell>
                        <TableCell className="text-xs text-gray-500">{formatDate(email.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[#111111] uppercase">Email Templates</CardTitle>
                  <CardDescription>Customize email templates with variables like {`{{customerName}}`}, {`{{trackingCode}}`}</CardDescription>
                </div>
                <Button
                  size="sm"
                  className="bg-[#FFD439] text-[#111111]"
                  onClick={() => {
                    setEditingTemplate({ id: '', key: '', name: '', description: '', subject: '', body: '' })
                    setTemplateDialog(true)
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No templates yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-[#111111]">{template.name}</h4>
                          <p className="text-xs text-gray-500">{template.description}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingTemplate({
                            id: template.id,
                            key: template.key,
                            name: template.name,
                            description: template.description || '',
                            subject: template.subject,
                            body: template.body
                          })
                          setTemplateDialog(true)
                        }}>Edit</Button>
                      </div>
                      <p className="text-sm font-medium text-gray-700">Subject: {template.subject}</p>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {template.variables?.map((v: string) => (
                          <span key={v} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{`{{${v}}}`}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[#111111] uppercase">SMTP Settings</CardTitle>
              <CardDescription>Configure your email server settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Enable Email Notifications</Label>
                    <p className="text-xs text-gray-500">Turn on/off email sending</p>
                  </div>
                  <select
                    className="border border-gray-200 rounded-md p-2"
                    value={emailSettings.enabled}
                    onChange={(e) => setEmailSettings({...emailSettings, enabled: e.target.value})}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">SMTP Host</Label>
                    <Input
                      value={emailSettings.host}
                      onChange={(e) => setEmailSettings({...emailSettings, host: e.target.value})}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Port</Label>
                    <Input
                      value={emailSettings.port}
                      onChange={(e) => setEmailSettings({...emailSettings, port: e.target.value})}
                      placeholder="587"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Username</Label>
                    <Input
                      value={emailSettings.user}
                      onChange={(e) => setEmailSettings({...emailSettings, user: e.target.value})}
                      placeholder="your-email@gmail.com"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Password</Label>
                    <Input
                      type="password"
                      value={emailSettings.password}
                      onChange={(e) => setEmailSettings({...emailSettings, password: e.target.value})}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">From Email</Label>
                    <Input
                      value={emailSettings.fromEmail}
                      onChange={(e) => setEmailSettings({...emailSettings, fromEmail: e.target.value})}
                      placeholder="noreply@pickupja.com"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">From Name</Label>
                    <Input
                      value={emailSettings.fromName}
                      onChange={(e) => setEmailSettings({...emailSettings, fromName: e.target.value})}
                      placeholder="Pickup Jamaica"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="secure"
                    checked={emailSettings.secure === 'true'}
                    onChange={(e) => setEmailSettings({...emailSettings, secure: e.target.checked ? 'true' : 'false'})}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="secure" className="text-sm font-medium">Use SSL/TLS</Label>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveSettings} className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold">
                    Save Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !emailSettings.host || !emailSettings.user}
                  >
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>

                {connectionStatus === 'success' && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                    ✓ SMTP connection successful!
                  </div>
                )}
                {connectionStatus === 'error' && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                    ✗ SMTP connection failed. Check your settings.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Test Email Dialog */}
      <Dialog open={testDialog} onOpenChange={setTestDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">Send Test Email</DialogTitle>
            <DialogDescription className="text-gray-500">Send a test email to verify SMTP configuration</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Email Address</Label>
              <Input placeholder="test@example.com" className="border-gray-200" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Subject</Label>
              <Input placeholder="Test Email" className="border-gray-200" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#111111] uppercase text-sm">Message (HTML)</Label>
              <textarea
                className="border border-gray-200 rounded-md p-2 text-sm"
                rows={6}
                placeholder="<h1>Test Email</h1><p>This is a test email from Pickup Jamaica.</p>"
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-300 text-gray-700 uppercase" onClick={() => setTestDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={handleSendTest} disabled={sending}>
              {sending ? 'Sending...' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Template Dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="bg-white border-gray-200 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#111111] uppercase">
              {editingTemplate?.id ? 'Edit Email Template' : 'Create New Email Template'}
            </DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Template Key *</Label>
                  <Input
                    value={editingTemplate.key}
                    onChange={(e) => setEditingTemplate({...editingTemplate, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})}
                    placeholder="e.g., welcome_email"
                    disabled={!!editingTemplate.id}
                  />
                  <p className="text-xs text-gray-500">Unique identifier (lowercase, no spaces)</p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Template Name *</Label>
                  <Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})} placeholder="e.g., Welcome Email" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Description</Label>
                <Input value={editingTemplate.description} onChange={(e) => setEditingTemplate({...editingTemplate, description: e.target.value})} placeholder="When this template is used" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Subject *</Label>
                <Input value={editingTemplate.subject} onChange={(e) => setEditingTemplate({...editingTemplate, subject: e.target.value})} placeholder="e.g., Your package is ready! - Code: {{trackingCode}}" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Email Body (HTML) *</Label>
                <textarea
                  className="border border-gray-200 rounded-md p-2 text-sm font-mono"
                  rows={12}
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({...editingTemplate, body: e.target.value})}
                  placeholder="<html><body><h1>Hi {{customerName}}</h1><p>Your package is ready...</p></body></html>"
                />
                <p className="text-xs text-gray-500">Use {`{{variableName}}`} for dynamic content. Available: {`{{customerName}}`}, {`{{trackingCode}}`}, {`{{location}}`}, {`{{brandName}}`}, {`{{year}}`}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button className="bg-[#FFD439] text-[#111111]" onClick={handleSaveTemplate}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main page content (uses useSearchParams)
function PageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") || "dashboard"

  const handleNavigate = (newTab: string) => {
    router.push(`/dashboard?tab=${newTab}`)
  }

  return (
    <AppLayout activeTab={tab} onNavigate={handleNavigate}>
      <Tabs value={tab} className="w-full">
        <TabsContent value="dashboard" className="mt-0"><DashboardContent onNavigate={handleNavigate} /></TabsContent>
        <TabsContent value="devices" className="mt-0"><DevicesContent /></TabsContent>
        <TabsContent value="express" className="mt-0"><ExpressContent /></TabsContent>
        <TabsContent value="activity" className="mt-0"><ActivityContent /></TabsContent>
        <TabsContent value="orders" className="mt-0"><OrdersContent /></TabsContent>
        <TabsContent value="customers" className="mt-0"><CustomersContent /></TabsContent>
        <TabsContent value="couriers" className="mt-0"><CouriersContent /></TabsContent>
        <TabsContent value="payments" className="mt-0"><PaymentsContent /></TabsContent>
        <TabsContent value="sms" className="mt-0"><SMSContent /></TabsContent>
        <TabsContent value="email" className="mt-0"><EmailContent /></TabsContent>
        <TabsContent value="settings" className="mt-0"><SettingsContent /></TabsContent>
      </Tabs>
    </AppLayout>
  )
}

// Main page component with Suspense boundary
export default function Page() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Package className="h-8 w-8 text-[#111111]" />
            </div>
            <p className="text-[#111111] font-bold uppercase">Loading...</p>
          </div>
        </div>
      }>
        <PageContent />
      </Suspense>
    </AuthGuard>
  )
}
