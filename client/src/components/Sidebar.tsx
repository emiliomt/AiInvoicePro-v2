import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Upload, AlertTriangle, Plus, Download, Settings, Brain } from "lucide-react";

interface PendingApproval {
  id: number;
  invoiceId: number;
  status: string;
  invoice: {
    id: number;
    invoiceNumber: string | null;
    vendorName: string | null;
    totalAmount: string | null;
    createdAt: string;
  };
}

interface Invoice {
  id: number;
  status: string;
  vendorName: string | null;
  totalAmount: string | null;
  createdAt: string;
}

export default function Sidebar() {
  // Get pending approvals
  const { data: pendingApprovals } = useQuery<PendingApproval[]>({
    queryKey: ["/api/approvals/pending"],
  });

  // Get recent invoices for activity
  const { data: recentInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const getActivityIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="text-success-600" size={16} />;
      case 'processing':
      case 'extracted':
        return <Upload className="text-primary-600" size={16} />;
      case 'rejected':
        return <AlertTriangle className="text-warning-600" size={16} />;
      default:
        return <Upload className="text-gray-400" size={16} />;
    }
  };

  const getActivityColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-success-50';
      case 'processing':
      case 'extracted':
        return 'bg-primary-50';
      case 'rejected':
        return 'bg-warning-50';
      default:
        return 'bg-gray-50';
    }
  };

  const getActivityText = (invoice: Invoice) => {
    switch (invoice.status) {
      case 'approved':
        return `Invoice #${invoice.id} approved`;
      case 'processing':
        return `Invoice #${invoice.id} processing`;
      case 'extracted':
        return `Invoice #${invoice.id} data extracted`;
      case 'rejected':
        return `Invoice #${invoice.id} rejected`;
      default:
        return `Invoice #${invoice.id} uploaded`;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  const formatCurrency = (amount: string | null) => {
    if (!amount) return '$0.00';
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Recent Activity */}
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentInvoices?.slice(0, 3).map((invoice) => (
              <div key={invoice.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 ${getActivityColor(invoice.status)} rounded-full flex items-center justify-center flex-shrink-0`}>
                  {getActivityIcon(invoice.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {getActivityText(invoice)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTimeAgo(invoice.createdAt)}
                  </p>
                </div>
              </div>
            ))}

            {(!recentInvoices || recentInvoices.length === 0) && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No recent activity</p>
              </div>
            )}
          </div>
          <Button variant="ghost" className="w-full mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium">
            View All Activity
          </Button>
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">Pending Approvals</CardTitle>
            <Badge variant="secondary" className="bg-warning-100 text-warning-800">
              {pendingApprovals?.length || 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingApprovals?.slice(0, 3).map((approval) => (
              <div key={approval.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {approval.invoice.invoiceNumber || `INV-${approval.invoice.id}`}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(approval.invoice.totalAmount)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  {approval.invoice.vendorName || 'Unknown Vendor'}
                </p>
                <div className="flex space-x-2">
                  <Button size="sm" className="bg-success-600 hover:bg-success-700 text-white text-xs">
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" className="text-xs">
                    Review
                  </Button>
                </div>
              </div>
            ))}

            {(!pendingApprovals || pendingApprovals.length === 0) && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No pending approvals</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Button
              variant="ghost"
              className="w-full justify-start text-left hover:bg-gray-50"
            >
              <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center mr-3">
                <Plus className="text-primary-600" size={16} />
              </div>
              <span className="font-medium text-gray-900">Create Purchase Order</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-left hover:bg-gray-50"
            >
              <div className="w-8 h-8 bg-success-50 rounded-lg flex items-center justify-center mr-3">
                <Download className="text-success-600" size={16} />
              </div>
              <span className="font-medium text-gray-900">Export Reports</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-left hover:bg-gray-50"
              onClick={() => window.location.href = '/validation-rules'}
            >
              <div className="w-8 h-8 bg-warning-50 rounded-lg flex items-center justify-center mr-3">
                <Settings className="text-warning-600" size={16} />
              </div>
              <span className="font-medium text-gray-900">Validation Rules</span>
            </Button>
            
          </div>
        </CardContent>
      </Card>
    </div>
  );
}