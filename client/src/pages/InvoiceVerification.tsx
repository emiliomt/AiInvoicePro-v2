
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Search,
  FileText,
  User,
  DollarSign,
  Calendar,
  Filter
} from "lucide-react";
import Header from "@/components/Header";

interface Invoice {
  id: number;
  fileName: string;
  invoiceNumber?: string;
  vendorName?: string;
  totalAmount?: string;
  invoiceDate?: string;
  status: string;
  verificationStatus?: string;
  createdAt: string;
  extractedData?: any;
}

export default function InvoiceVerification() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const response = await fetch("/api/invoices?includeMatches=true");
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
  });

  const getVerificationStatusBadge = (status?: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle size={12} className="mr-1" />Verified</Badge>;
      case "flagged":
        return <Badge className="bg-red-100 text-red-800"><XCircle size={12} className="mr-1" />Flagged</Badge>;
      case "needs_review":
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertTriangle size={12} className="mr-1" />Needs Review</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const formatCurrency = (amount?: string) => {
    if (!amount) return "—";
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = !searchTerm || 
      invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesVerification = verificationFilter === "all" || 
      (invoice.verificationStatus || "pending") === verificationFilter;
    
    // Only show invoices that have been matched to projects (have extractedData with project info)
    const hasProjectMatch = invoice.extractedData && 
      (invoice.extractedData.projectName || invoice.extractedData.projectId);
    
    return matchesSearch && matchesStatus && matchesVerification && hasProjectMatch;
  });

  const verificationStats = {
    total: invoices.length,
    verified: invoices.filter(inv => inv.verificationStatus === "verified").length,
    flagged: invoices.filter(inv => inv.verificationStatus === "flagged").length,
    needsReview: invoices.filter(inv => inv.verificationStatus === "needs_review").length,
    pending: invoices.filter(inv => !inv.verificationStatus || inv.verificationStatus === "pending").length
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
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-2">
                <Shield className="text-blue-600" size={32} />
                <span>Invoice Verification</span>
              </h1>
              <p className="text-gray-600 mt-2">
                Review and verify invoice authenticity and compliance status
              </p>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                  <p className="text-3xl font-bold text-gray-900">{verificationStats.total.toLocaleString()}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Verified</p>
                  <p className="text-3xl font-bold text-green-600">{verificationStats.verified.toLocaleString()}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Flagged</p>
                  <p className="text-3xl font-bold text-red-600">{verificationStats.flagged.toLocaleString()}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Needs Review</p>
                  <p className="text-3xl font-bold text-yellow-600">{verificationStats.needsReview.toLocaleString()}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-3xl font-bold text-gray-600">{verificationStats.pending.toLocaleString()}</p>
                </div>
                <Shield className="h-8 w-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Section */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Search size={16} className="text-gray-500" />
                <Input
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Filter size={16} className="text-gray-500" />
                <Label>Status:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Label>Verification:</Label>
                <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Verification Status</CardTitle>
            <p className="text-sm text-gray-600">
              Monitor and verify invoice authenticity and compliance across all submissions
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-3 font-medium text-gray-600">Invoice Details</th>
                    <th className="text-left p-3 font-medium text-gray-600">Vendor</th>
                    <th className="text-left p-3 font-medium text-gray-600">Amount</th>
                    <th className="text-left p-3 font-medium text-gray-600">Date</th>
                    <th className="text-left p-3 font-medium text-gray-600">Status</th>
                    <th className="text-left p-3 font-medium text-gray-600">Verification</th>
                    <th className="text-left p-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        {invoices.length === 0 ? "No invoices found." : "No invoices match the selected filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-gray-900">{invoice.fileName}</p>
                            <p className="text-sm text-gray-500">{invoice.invoiceNumber || "—"}</p>
                            {invoice.projectMatches && invoice.projectMatches.length > 0 && (
                              <p className="text-xs text-blue-600 mt-1">
                                Matched to: {invoice.projectMatches[0].project.name}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center">
                            <User size={16} className="text-gray-400 mr-2" />
                            <span className="text-sm text-gray-600">{invoice.vendorName || "—"}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center">
                            <DollarSign size={16} className="text-gray-400 mr-1" />
                            <span className="font-medium">{formatCurrency(invoice.totalAmount)}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center">
                            <Calendar size={16} className="text-gray-400 mr-2" />
                            <span className="text-sm text-gray-600">
                              {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">{getStatusBadge(invoice.status)}</td>
                        <td className="p-3">{getVerificationStatusBadge(invoice.verificationStatus)}</td>
                        <td className="p-3">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.location.href = `/invoice-preview/${invoice.id}`}
                            >
                              <FileText size={14} className="mr-1" />
                              Review
                            </Button>
                            {(!invoice.verificationStatus || invoice.verificationStatus === "pending") && (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                <CheckCircle size={14} className="mr-1" />
                                Verify
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
