import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  AlertTriangle, 
  FileText, 
  DollarSign,
  Calendar,
  Building2
} from "lucide-react";
import Header from "@/components/Header";
import { format } from "date-fns";

interface ReportMetrics {
  totalInvoices: number;
  totalValue: string;
  pendingApproval: number;
  processedToday: number;
  avgProcessingTime: number;
  topVendors: Array<{
    name: string;
    count: number;
    totalValue: string;
  }>;
  monthlyTrends: Array<{
    month: string;
    count: number;
    value: string;
  }>;
}

export default function Reports() {
  const { data: dashboardStats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: topIssues = [] } = useQuery({
    queryKey: ["/api/dashboard/top-issues"],
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
  });

  // Calculate additional metrics from invoices data
  const calculateMetrics = () => {
    if (!invoices.length) return null;

    const totalValue = invoices.reduce((sum: number, inv: any) => {
      const amount = parseFloat(inv.totalAmount || "0");
      return sum + amount;
    }, 0);

    const vendorCounts = invoices.reduce((acc: any, inv: any) => {
      const vendor = inv.vendorName || "Unknown";
      if (!acc[vendor]) {
        acc[vendor] = { count: 0, totalValue: 0 };
      }
      acc[vendor].count++;
      acc[vendor].totalValue += parseFloat(inv.totalAmount || "0");
      return acc;
    }, {});

    const topVendors = Object.entries(vendorCounts)
      .map(([name, data]: [string, any]) => ({
        name,
        count: data.count,
        totalValue: `$${data.totalValue.toFixed(2)}`,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalValue: `$${totalValue.toFixed(2)}`,
      topVendors,
    };
  };

  const metrics = calculateMetrics();

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600 mt-2">Invoice processing insights and trends</p>
          </div>
          <Button className="flex items-center space-x-2">
            <Download size={16} />
            <span>Export Report</span>
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardStats?.totalInvoices || 0}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics?.totalValue || "$0.00"}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardStats?.pendingApproval || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Processed Today</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardStats?.processedToday || 0}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="text-orange-600" size={20} />
                <span>Top Issues This Month</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topIssues.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No issues detected</p>
                ) : (
                  topIssues.map((issue: any, index: number) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{issue.issueType}</p>
                        <p className="text-sm text-gray-600">{issue.description}</p>
                      </div>
                      <Badge variant="secondary">{issue.count}</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Vendors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="text-blue-600" size={20} />
                <span>Top Vendors</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!metrics?.topVendors || metrics.topVendors.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No vendor data available</p>
                ) : (
                  metrics.topVendors.map((vendor, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{vendor.name}</p>
                        <p className="text-sm text-gray-600">{vendor.count} invoices</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">{vendor.totalValue}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="text-green-600" size={20} />
              <span>Recent Invoice Activity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invoices.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No recent activity</p>
              ) : (
                invoices.slice(0, 10).map((invoice: any) => (
                  <div key={invoice.id} className="flex justify-between items-center p-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <FileText className="text-blue-600" size={16} />
                      <div>
                        <p className="font-medium text-gray-900">{invoice.fileName}</p>
                        <p className="text-sm text-gray-600">
                          {invoice.vendorName || "Unknown vendor"} • {formatDate(invoice.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {invoice.currency} {parseFloat(invoice.totalAmount || "0").toFixed(2)}
                      </p>
                      <Badge 
                        className={
                          invoice.status === "processed" 
                            ? "bg-green-100 text-green-800"
                            : invoice.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}