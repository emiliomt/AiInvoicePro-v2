import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import PettyCashManager from "@/components/PettyCashManager";
import ThresholdConfig from "@/components/ThresholdConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Recalculate Button Component
function RecalculateButton() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for recalculating petty cash classifications
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/petty-cash/recalculate", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to recalculate petty cash");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Recalculation Complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
    },
    onError: (error: any) => {
      toast({
        title: "Recalculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      onClick={() => recalculateMutation.mutate()}
      disabled={recalculateMutation.isPending}
      variant="outline"
      size="sm"
      className="flex items-center space-x-2"
    >
      <RefreshCw className={`h-4 w-4 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
      <span>
        {recalculateMutation.isPending ? 'Recalculating...' : 'Sync Missing Logs'}
      </span>
    </Button>
  );
}

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

  // Use the same query as ThresholdConfig for synchronized currency data
  const { data: configData } = useQuery({
    queryKey: ['thresholdConfig'],
    queryFn: async () => {
      try {
        const [userSettingsRes, thresholdRes] = await Promise.all([
          fetch('/api/settings/user_preferences').then(res => 
            res.ok ? res.json() : { key: 'user_preferences', value: JSON.stringify({ defaultCurrency: 'USD' }) }
          ),
          fetch('/api/settings/petty_cash_threshold').then(async res => {
            if (res.ok) {
              return res.json();
            } else {
              const createResponse = await fetch('/api/settings/petty_cash_threshold', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: "100" }),
              });
              return createResponse.ok ? createResponse.json() : { key: 'petty_cash_threshold', value: "100" };
            }
          })
        ]);

        const userSettings = JSON.parse(userSettingsRes.value || '{"defaultCurrency": "USD"}');

        return {
          userSettings,
          threshold: thresholdRes
        };
      } catch (error) {
        console.error('Error loading config:', error);
        return {
          userSettings: { defaultCurrency: 'USD' },
          threshold: { key: 'petty_cash_threshold', value: "100" }
        };
      }
    },
    staleTime: 1000, // Short cache time for immediate updates
    refetchOnWindowFocus: true,
  });

  const defaultCurrency = configData?.userSettings?.defaultCurrency || 'USD';

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

  const formatCurrency = useCallback((amount: string | number) => {
    const symbol = getCurrencySymbol(defaultCurrency);
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? `${symbol}0.00` : `${symbol}${num.toLocaleString()} ${defaultCurrency}`;
  }, [defaultCurrency]);

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
            <CardContent className="p-6" key={defaultCurrency}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-3xl font-bold text-purple-600">{formatCurrency(stats?.totalValue || "0")}</p>
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
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">Petty Cash Configuration</span>
              <RecalculateButton />
            </CardTitle>
            <CardDescription>
              Configure currency and threshold settings for petty cash classification
            </CardDescription>
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