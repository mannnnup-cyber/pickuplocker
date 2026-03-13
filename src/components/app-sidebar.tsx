"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Box,
  Settings,
  Users,
  CreditCard,
  Package,
  LayoutDashboard,
  ChevronUp,
  LogOut,
  Home,
  Truck,
  MessageSquare,
  Mail,
  Zap,
  Activity,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"

const navItems = [
  { title: "Dashboard", tab: "dashboard", icon: LayoutDashboard },
  { title: "Devices", tab: "devices", icon: Box },
  { title: "Express", tab: "express", icon: Zap },
  { title: "Activity", tab: "activity", icon: Activity },
  { title: "Orders", tab: "orders", icon: Package },
  { title: "Customers", tab: "customers", icon: Users },
  { title: "Couriers", tab: "couriers", icon: Truck },
  { title: "Payments", tab: "payments", icon: CreditCard },
  { title: "SMS & Alerts", tab: "sms", icon: MessageSquare },
  { title: "Email", tab: "email", icon: Mail },
  { title: "Settings", tab: "settings", icon: Settings },
]

interface AppSidebarProps {
  activeTab: string
  onNavigate: (tab: string) => void
}

function AppSidebar({ activeTab, onNavigate }: AppSidebarProps) {
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  const userInitials = user?.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "AD"
  const userName = user?.name || "Admin User"
  const userRole = user?.role || "ADMIN"

  return (
    <Sidebar className="bg-white border-r border-gray-200">
      <SidebarHeader className="border-b border-gray-200 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img 
            src="/logo-icon.png" 
            alt="Pickup Logo" 
            className="h-14 w-14 object-contain"
          />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-[#111111] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              PICK<span className="text-[#FFD439]">UP</span>
            </span>
            <span className="text-xs text-gray-500">Smart Locker System</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={activeTab === item.tab}
                onClick={() => onNavigate(item.tab)}
                className={`
                  ${activeTab === item.tab 
                    ? 'bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold' 
                    : 'text-gray-600 hover:bg-gray-100 hover:text-[#111111]'}
                  uppercase
                `}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-gray-200 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12 text-gray-600 hover:bg-gray-100">
                  <Avatar className="h-8 w-8 bg-[#FFD439]">
                    <AvatarFallback className="text-[#111111] font-bold">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-[#111111]">{userName}</span>
                    <span className="text-xs text-gray-500">{userRole}</span>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width] bg-white border-gray-200">
                <DropdownMenuItem className="text-gray-600 hover:bg-gray-100">
                  <Settings className="mr-2 h-4 w-4" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-200" />
                <DropdownMenuItem className="text-red-600 hover:bg-gray-100 cursor-pointer" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
  activeTab: string
  onNavigate: (tab: string) => void
}

export function AppLayout({ children, activeTab, onNavigate }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar activeTab={activeTab} onNavigate={onNavigate} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-6">
          <SidebarTrigger className="text-[#111111]" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-[#111111] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>Smart Locker Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#111111]">
                <Home className="mr-2 h-4 w-4" />
                View Site
              </Button>
            </Link>
            <Button size="sm" className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase" onClick={() => onNavigate("orders")}>
              <Package className="mr-2 h-4 w-4" />
              New Drop-off
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 bg-gray-100">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
