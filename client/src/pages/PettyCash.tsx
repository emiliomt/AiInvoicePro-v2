import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import PettyCashManager from "@/components/PettyCashManager";
import ThresholdConfig from "@/components/ThresholdConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";

export default function PettyCash() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");

  // Fetch petty cash stats
  const { data: stats } = useQuery({
    queryKey: ["/api/petty-cash"],
    select: (data: any[]) => {
      const pending = data.filter(log => log.status === "pending_approval").length;
      const approved = data.filter(log => log.status === "approved").length;
      const rejected = data.filter(log => log.status === "rejected").length;
      const assigned = data.filter(log => log.costCenter && log.costCenter !== "").length;
      const totalValue = data.reduce((sum, log) => sum + parseFloat(log.invoice.totalAmount || "0"), 0);

      return {
        total: data.length,
        pending,
        approved,
        rejected,
        assigned,
        totalValue: totalValue.toFixed(2),
      };
    },
  });

  // Fetch user settings to get default currency
  const { data: userSettings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const response = await fetch('/api/settings/user_preferences');
      if (!response.ok) {
        return { defaultCurrency: 'USD' }; // Default fallback
      }
      const data = await response.json();
      return JSON.parse(data.value || '{"defaultCurrency": "USD"}');
    },
  });

  const defaultCurrency = userSettings?.defaultCurrency || 'USD';
  
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'MXN': return '$';
      case 'COP': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const formatCurrency = (amount: string | number) => {
    const symbol = getCurrencySymbol(defaultCurrency);
    if (typeof amount === 'string') {
      const num = parseFloat(amount);
      return isNaN(num) ? `${symbol}0.00` : `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Petty Cash Management</h1>
          <p className="text-gray-600 mt-2">
            Manage small invoice approvals and cost center assignments
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Petty Cash</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.total || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-blue-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="text-yellow-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{stats?.approved || 0}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats?.totalValue || "0.00")}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-purple-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Assigned</p>
                  <p className="text-3xl font-bold text-indigo-600">{stats?.assigned || 0}</p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-indigo-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Threshold Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Petty Cash Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <ThresholdConfig />
          </CardContent>
        </Card>

        {/* Tabs for filtering petty cash records */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all" className="flex items-center space-x-2">
              <span>All</span>
              <Badge variant="secondary" className="ml-1">{stats?.total || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center space-x-2">
              <Clock size={16} />
              <span>Pending</span>
              <Badge variant="secondary" className="ml-1">{stats?.pending || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="approved" className="flex items-center space-x-2">
              <CheckCircle size={16} />
              <span>Approved</span>
              <Badge variant="secondary" className="ml-1">{stats?.approved || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="rejected" className="flex items-center space-x-2">
              <XCircle size={16} />
              <span>Rejected</span>
              <Badge variant="secondary" className="ml-1">{stats?.rejected || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="assigned" className="flex items-center space-x-2">
              <DollarSign size={16} />
              <span>Assigned</span>
              <Badge variant="secondary" className="ml-1">{stats?.assigned || 0}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <PettyCashManager showAllLogs={true} />
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            <PettyCashManager showAllLogs={true} filterStatus="pending_approval" />
          </TabsContent>

          <TabsContent value="approved" className="mt-6">
            <PettyCashManager showAllLogs={true} filterStatus="approved" />
          </TabsContent>

          <TabsContent value="rejected" className="mt-6">
            <PettyCashManager showAllLogs={true} filterStatus="rejected" />
          </TabsContent>

          <TabsContent value="assigned" className="mt-6">
            <PettyCashManager showAllLogs={true} filterAssigned={true} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}