import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import {
  Menu,
  Home,
  FileText,
  CheckCircle,
  Settings,
  BarChart3,
  DollarSign,
  FolderCheck,
  Shield,
  Target,
  FileCheck,
  Zap,
  Brain,
  BookOpen,
  Link as LinkIcon,
  Bot,
  Workflow,
  Download,
  LogOut,
  User,
  ChevronRight
} from "lucide-react";

interface NavigationProps {
  children: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  const menuSections = [
    {
      title: "Main",
      items: [
        { path: "/dashboard", label: "Dashboard", icon: Home },
        { path: "/invoices", label: "Invoices", icon: FileText },
        { path: "/approvals", label: "Approvals", icon: CheckCircle },
        { path: "/reports", label: "Reports", icon: BarChart3 },
      ]
    },
    {
      title: "Processing",
      items: [
        { path: "/petty-cash", label: "Petty Cash", icon: DollarSign },
        { path: "/project-validation", label: "Project Validation", icon: FolderCheck },
        { path: "/validation-rules", label: "Validation Rules", icon: Shield },
        { path: "/po-matching", label: "PO Matching", icon: Target },
        { path: "/purchase-orders", label: "Purchase Orders", icon: FileCheck },
        { path: "/verified-invoices", label: "Verified Invoices", icon: CheckCircle },
        { path: "/invoice-verification", label: "Invoice Verification", icon: Zap },
      ]
    },
    {
      title: "AI & Learning",
      items: [
        { path: "/ai-learning", label: "AI Learning", icon: Brain },
        { path: "/line-item-classification", label: "Line Item Classification", icon: BookOpen },
        { path: "/project-matcher", label: "Project Matcher", icon: Target },
        { path: "/ai-workflow", label: "AI Workflow", icon: Workflow },
      ]
    },
    {
      title: "ERP Automation",
      items: [
        { path: "/erp-connect", label: "ERP Connections", icon: LinkIcon },
        { path: "/rpa-dashboard", label: "RPA Dashboard", icon: Bot },
        { path: "/invoice-importer", label: "Invoice Importer", icon: Download },
      ]
    },
    {
      title: "System",
      items: [
        { path: "/settings", label: "Settings", icon: Settings },
        { path: "/profile", label: "Profile", icon: User },
      ]
    }
  ];

  const isActive = (path: string) => location === path;

  const handleNavigation = (path: string) => {
    setOpen(false);
  };

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="p-6 bg-blue-600 text-white">
                    <h2 className="text-xl font-bold">InvoicePro</h2>
                    <p className="text-blue-100 text-sm mt-1">AI-Powered Invoice Platform</p>
                  </div>

                  {/* User Info */}
                  <div className="p-4 bg-gray-50 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                        {user.firstName?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Menu */}
                  <div className="flex-1 overflow-y-auto py-4">
                    {menuSections.map((section) => (
                      <div key={section.title} className="mb-6">
                        <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          {section.title}
                        </h3>
                        <nav className="space-y-1 px-2">
                          {section.items.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);
                            return (
                              <Link key={item.path} href={item.path}>
                                <a
                                  onClick={() => handleNavigation(item.path)}
                                  className={`
                                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                                    ${active 
                                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600' 
                                      : 'text-gray-700 hover:bg-gray-100'
                                    }
                                  `}
                                >
                                  <Icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="flex-1">{item.label}</span>
                                  {active && <ChevronRight className="h-3 w-3" />}
                                </a>
                              </Link>
                            );
                          })}
                        </nav>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">InvoicePro</h1>
            </div>
          </div>

          {/* Desktop Navigation - Quick Access */}
          <div className="hidden md:flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant={isActive("/dashboard") ? "default" : "ghost"} size="sm">
                <Home className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
            </Link>
            <Link href="/invoices">
              <Button variant={isActive("/invoices") ? "default" : "ghost"} size="sm">
                <FileText className="h-4 w-4 mr-1" />
                Invoices
              </Button>
            </Link>
            <Link href="/invoice-importer">
              <Button variant={isActive("/invoice-importer") ? "default" : "ghost"} size="sm">
                <Download className="h-4 w-4 mr-1" />
                RPA
              </Button>
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              {user.firstName?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
};

export default Navigation;