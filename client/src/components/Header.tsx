import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { FileText, Bell, ChevronDown, LogOut, User, Settings, Brain } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Header() {
  const { user } = useAuth();
  const [location] = useLocation();

  // Type the user object properly
  const typedUser = user as any;

  const isActiveRoute = (path: string) => {
    return location === path;
  };

  const getLinkClassName = (path: string) => {
    return isActiveRoute(path) 
      ? "text-primary-600 font-semibold text-sm border-b-2 border-primary-600 pb-4 -mb-[1px] whitespace-nowrap"
      : "text-gray-600 hover:text-gray-900 pb-4 transition-colors text-sm font-medium whitespace-nowrap";
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

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <FileText className="text-white" size={20} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">AnzuDynamics</h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-6 lg:space-x-8">
            <Link href="/" className={getLinkClassName("/")}>
              Dashboard
            </Link>
            <Link href="/invoices" className={getLinkClassName("/invoices")}>
              Invoices
            </Link>

            {/* Information Validation Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 pb-4 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/validation-rules")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600 -mb-[1px]"
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

            {/* Project Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 pb-4 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/project-validation") || isActiveRoute("/project-matcher") || isActiveRoute("/petty-cash") || isActiveRoute("/classification")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600 -mb-[1px]"
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
                <DropdownMenuItem onClick={() => window.location.href = '/classification'}>
                  Line Item Classification
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Purchases Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center space-x-1 pb-4 transition-colors text-sm font-medium whitespace-nowrap ${
                  isActiveRoute("/purchase-orders") || isActiveRoute("/po-matching")
                    ? "text-primary-600 font-semibold border-b-2 border-primary-600 -mb-[1px]"
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

          {/* User Menu */}
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
        </div>
      </div>
    </header>
  );
}