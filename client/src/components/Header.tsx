
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileText, Bell, ChevronDown, LogOut, User, Settings, Brain, Bot, Zap, Menu, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";

export default function Header() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const typedUser = user as any;

  const isActiveRoute = (path: string) => {
    return location === path;
  };

  const getLinkClassName = (path: string) => {
    return isActiveRoute(path) 
      ? "text-primary-600 font-semibold text-sm border-b-2 border-primary-600 h-16 flex items-center whitespace-nowrap"
      : "text-gray-600 hover:text-gray-900 h-16 flex items-center transition-colors text-sm font-medium whitespace-nowrap";
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
      return firstName.charAt(0).toUpperCase();
    }
    return 'U';
  };

  const getDisplayName = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) {
      return firstName;
    }
    return 'User';
  };

  const menuItems = [
    {
      title: "Dashboard",
      items: [
        { label: "Overview", href: "/", icon: FileText },
        { label: "AI Learning", href: "/ai-learning", icon: Brain },
      ]
    },
    {
      title: "Invoices",
      items: [
        { label: "All Invoices", href: "/invoices", icon: FileText },
        { label: "Approvals", href: "/approvals", icon: FileText },
      ]
    },
    {
      title: "Information Validation",
      items: [
        { label: "Validation Rules", href: "/validation-rules", icon: Settings },
        { label: "Invoice Verification", href: "/invoice-verification", icon: FileText },
      ]
    },
    {
      title: "Project",
      items: [
        { label: "Project Validation", href: "/project-validation", icon: FileText },
        { label: "Project Matcher", href: "/project-matcher", icon: FileText },
        { label: "Petty Cash", href: "/petty-cash", icon: FileText },
        { label: "Line Item Classification", href: "/line-item-classification", icon: FileText },
      ]
    },
    {
      title: "ERP Automation",
      items: [
        { label: "ERP Connections", href: "/erp-connect", icon: Zap },
        { label: "AI Workflows", href: "/ai-workflow", icon: Bot },
        { label: "ERP Invoice Importer", href: "/invoice-importer", icon: FileText },
      ]
    },
    {
      title: "Purchases",
      items: [
        { label: "Purchase Orders", href: "/purchase-orders", icon: FileText },
        { label: "PO Matching", href: "/po-matching", icon: FileText },
      ]
    },
    {
      title: "Reports",
      items: [
        { label: "Reports", href: "/reports", icon: FileText },
      ]
    },
  ];

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <FileText className="text-white" size={20} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">AnzuDynamics</h1>
            </div>
          </div>

          {isMobile && (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="p-2 text-gray-400 hover:text-gray-600">
                <Bell size={20} />
              </Button>
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2 text-gray-600 hover:text-gray-900">
                    <Menu size={24} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0 bg-white">
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-12 h-12 ring-2 ring-white">
                          <AvatarImage src={typedUser?.profileImageUrl || undefined} />
                          <AvatarFallback className="bg-primary-600 text-white text-lg font-medium">
                            {getInitials(typedUser?.firstName, typedUser?.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {getDisplayName(typedUser?.firstName, typedUser?.lastName)}
                          </h3>
                          <p className="text-sm text-gray-600">{typedUser?.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {menuItems.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="border-b border-gray-200 last:border-b-0">
                          <div className="p-4 bg-gray-50">
                            <h4 className="font-medium text-gray-900 text-sm uppercase tracking-wide">
                              {section.title}
                            </h4>
                          </div>
                          <div className="py-2">
                            {section.items.map((item, itemIndex) => (
                              <Link 
                                key={itemIndex}
                                href={item.href}
                                className={`flex items-center px-6 py-4 text-base transition-colors active:bg-gray-100 ${
                                  isActiveRoute(item.href)
                                    ? 'bg-primary-50 text-primary-600 border-r-4 border-primary-600 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                                }`}
                                onClick={() => setMobileMenuOpen(false)}
                              >
                                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                <ChevronRight className="h-4 w-4 opacity-50 flex-shrink-0" />
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-200 p-4 space-y-1 bg-gray-50">
                      <Link 
                        href="/profile"
                        className="flex items-center px-4 py-3 text-base text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <User className="mr-3 h-5 w-5 flex-shrink-0" />
                        <span className="flex-1">Profile</span>
                      </Link>
                      <Link 
                        href="/settings"
                        className="flex items-center px-4 py-3 text-base text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Settings className="mr-3 h-5 w-5 flex-shrink-0" />
                        <span className="flex-1">Settings</span>
                      </Link>
                      <button 
                        onClick={() => {
                          setMobileMenuOpen(false);
                          window.location.href = '/api/logout';
                        }}
                        className="flex items-center w-full px-4 py-3 text-base text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
                      >
                        <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
                        <span className="flex-1">Sign Out</span>
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          <nav className="hidden md:flex space-x-6 lg:space-x-8 ml-8">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 h-16 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/") || isActiveRoute("/ai-learning")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                  <span>Dashboard</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => window.location.href = '/'}>
                  Overview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/ai-learning'}>
                  <Brain className="mr-2 h-4 w-4" />
                  AI Learning
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Link href="/invoices" className={getLinkClassName("/invoices")}>
              Invoices
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 h-16 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/validation-rules")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                  <span>Information Validation</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => window.location.href = '/validation-rules'}>
                  Validation Rules
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/invoice-verification'}>
                  Invoice Verification
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 h-16 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/project-validation") || isActiveRoute("/project-matcher") || isActiveRoute("/petty-cash") || isActiveRoute("/line-item-classification")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                  <span>Project</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => window.location.href = '/project-validation'}>
                  Project Validation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/project-matcher'}>
                  Project Matcher
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/petty-cash'}>
                  Petty Cash
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/line-item-classification'}>
                  Line Item Classification
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 h-16 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/erp-connect") || isActiveRoute("/invoice-importer")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                  <Bot size={16} className="text-blue-600" />
                  <span>ERP Automation</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => window.location.href = '/erp-connect'}>
                  <Zap size={16} className="mr-2" />
                  ERP Connections
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/invoice-importer'}>
                  <FileText size={16} className="mr-2" />
                  ERP Invoice Importer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 h-16 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/purchase-orders") || isActiveRoute("/po-matching")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                  <span>Purchases</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => window.location.href = '/purchase-orders'}>
                  Purchase Orders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = '/po-matching'}>
                  PO Matching
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/reports" className={getLinkClassName("/reports")}>
              Reports
            </Link>
          </nav>

          {!isMobile && (
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" className="p-2 text-gray-400 hover:text-gray-600">
                <Bell size={20} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-3 hover:bg-gray-50">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={typedUser?.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-gray-300 text-gray-600 text-sm">
                        {getInitials(typedUser?.firstName, typedUser?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm font-medium text-gray-900">
                      {getDisplayName(typedUser?.firstName, typedUser?.lastName)}
                    </span>
                    <ChevronDown className="text-gray-400" size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => window.location.href = '/profile'}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => window.location.href = '/api/logout'}
                    className="text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
