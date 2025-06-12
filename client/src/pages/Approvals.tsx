import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, User, Calendar, DollarSign } from "lucide-react";
import Header from "@/components/Header";
import { format } from "date-fns";

interface Approval {
  id: number;
  invoiceId: number;
  status: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  invoice: {
    id: number;
    fileName: string;
    vendorName: string | null;
    invoiceNumber: string | null;
    totalAmount: string | null;
    currency: string;
    invoiceDate: string | null;
  };
}

export default function Approvals() {
  const { data: approvals = [], isLoading } = useQuery<Approval[]>({
    queryKey: ["/api/approvals/pending"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="text-green-600" size={16} />;
      case "rejected": return <XCircle className="text-red-600" size={16} />;
      case "pending": return <Clock className="text-yellow-600" size={16} />;
      default: return <Clock className="text-gray-600" size={16} />;
    }
  };

  const formatAmount = (amount: string | null, currency: string) => {
    if (!amount) return "N/A";
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
    } catch {
      return "Invalid date";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoice Approvals</h1>
          <p className="text-gray-600 mt-2">Review and approve pending invoices</p>
        </div>

        <div className="space-y-6">
          {approvals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No pending approvals</h3>
                <p className="text-gray-600">All invoices have been processed.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {approvals.map((approval) => (
                <Card key={approval.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <CardTitle className="flex items-center space-x-2">
                          {getStatusIcon(approval.status)}
                          <span>Invoice: {approval.invoice.fileName}</span>
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>#{approval.invoice.invoiceNumber || "N/A"}</span>
                          <span>•</span>
                          <span>Submitted {formatDate(approval.createdAt)}</span>
                        </div>
                      </div>
                      <Badge className={getStatusColor(approval.status)}>
                        {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Vendor</p>
                        <p className="text-sm text-gray-900">{approval.invoice.vendorName || "N/A"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Amount</p>
                        <p className="text-sm text-gray-900 flex items-center">
                          <DollarSign size={14} className="mr-1" />
                          {formatAmount(approval.invoice.totalAmount, approval.invoice.currency)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Invoice Date</p>
                        <p className="text-sm text-gray-900 flex items-center">
                          <Calendar size={14} className="mr-1" />
                          {formatDate(approval.invoice.invoiceDate)}
                        </p>
                      </div>
                    </div>

                    {approval.status === "rejected" && approval.rejectionReason && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
                        <p className="text-sm text-red-700 mt-1">{approval.rejectionReason}</p>
                        {approval.rejectedBy && (
                          <p className="text-xs text-red-600 mt-2 flex items-center">
                            <User size={12} className="mr-1" />
                            Rejected by {approval.rejectedBy}
                          </p>
                        )}
                      </div>
                    )}

                    {approval.status === "approved" && approval.approvedBy && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-800 flex items-center">
                          <CheckCircle size={14} className="mr-1" />
                          Approved by {approval.approvedBy}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          on {formatDate(approval.updatedAt)}
                        </p>
                      </div>
                    )}

                    {approval.status === "pending" && (
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" size="sm">
                          View Invoice
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                          <XCircle size={16} className="mr-2" />
                          Reject
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle size={16} className="mr-2" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}