
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle, XCircle, AlertTriangle, Clock, Eye, Download } from "lucide-react";
import { useState } from "react";

interface ApprovedInvoiceProject {
  id: number;
  invoiceId: number;
  projectId: string;
  matchScore: string;
  matchDetails: any;
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
  invoice: {
    id: number;
    fileName: string;
    vendorName: string;
    totalAmount: string;
    currency: string;
    invoiceDate: string;
    status: string;
  };
  project: {
    projectId: string;
    name: string;
    address: string;
    city: string;
    supervisor: string;
  };
}

export default function InvoiceVerification() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");

  const { data: approvedAssignments = [], isLoading } = useQuery<ApprovedInvoiceProject[]>({
    queryKey: ["/api/approved-invoice-projects"],
    queryFn: async () => {
      const response = await fetch("/api/approved-invoice-projects");
      if (!response.ok) throw new Error("Failed to fetch approved invoice projects");
      return response.json();
    },
  });

  const { data: allInvoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const response = await fetch("/api/invoices");
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
  });

  // Calculate stats
  const totalInvoices = allInvoices.length;
  const verifiedInvoices = approvedAssignments.length;
  const flaggedInvoices = allInvoices.filter((inv: any) => inv.status === "rejected").length;
  const needsReviewInvoices = allInvoices.filter((inv: any) => 
    inv.status === "extracted" || inv.status === "pending"
  ).length;
  const pendingInvoices = allInvoices.filter((inv: any) => inv.status === "processing").length;

  // Filter approved assignments
  const filteredAssignments = approvedAssignments.filter((assignment) => {
    const matchesSearch = 
      assignment.invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.projectId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || assignment.invoice.status === statusFilter;
    const matchesVerification = verificationFilter === "all" || verificationFilter === "verified";

    return matchesSearch && matchesStatus && matchesVerification;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Flagged</Badge>;
      case "extracted":
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Needs Review</Badge>;
      case "processing":
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getVerificationBadge = (matchScore: string) => {
    const score = parseFloat(matchScore);
    if (score >= 90) {
      return <Badge variant="default" className="bg-green-100 text-green-800">High Confidence</Badge>;
    } else if (score >= 70) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Medium Confidence</Badge>;
    } else {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800">Low Confidence</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading verification data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoice Verification Status</h1>
          <p className="text-muted-foreground">
            Monitor and verify invoice authenticity and compliance across all submissions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold">{totalInvoices}</div>
              <div className="text-blue-600">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z"/>
                </svg>
              </div>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">Total Invoices</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-green-600">{verifiedInvoices}</div>
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">Verified</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-red-600">{flaggedInvoices}</div>
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">Flagged</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-yellow-600">{needsReviewInvoices}</div>
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">Needs Review</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold text-gray-600">{pendingInvoices}</div>
              <Clock className="w-6 h-6 text-gray-600" />
            </div>
            <div className="ml-auto text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Verified</SelectItem>
                  <SelectItem value="rejected">Flagged</SelectItem>
                  <SelectItem value="extracted">Needs Review</SelectItem>
                  <SelectItem value="processing">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approved Invoice-Project Assignments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Approved Invoice-Project Assignments</CardTitle>
          <CardDescription>
            Invoices that have been successfully matched and approved for specific projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {approvedAssignments.length === 0 
                ? "No approved invoice-project assignments found."
                : "No assignments match the selected filters."
              }
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Invoice Details</th>
                    <th className="text-left p-4 font-medium">Vendor</th>
                    <th className="text-left p-4 font-medium">Amount</th>
                    <th className="text-left p-4 font-medium">Project</th>
                    <th className="text-left p-4 font-medium">Match Score</th>
                    <th className="text-left p-4 font-medium">Approved By</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => (
                    <tr key={assignment.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{assignment.invoice.fileName}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {assignment.invoice.id}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {assignment.invoice.invoiceDate 
                              ? new Date(assignment.invoice.invoiceDate).toLocaleDateString()
                              : "No date"
                            }
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">
                          {assignment.invoice.vendorName || "Unknown Vendor"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">
                          {assignment.invoice.totalAmount 
                            ? `${assignment.invoice.currency || 'USD'} ${parseFloat(assignment.invoice.totalAmount).toLocaleString()}`
                            : "N/A"
                          }
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{assignment.project.name}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {assignment.projectId}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {assignment.project.supervisor && `Supervisor: ${assignment.project.supervisor}`}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="font-medium">{parseFloat(assignment.matchScore).toFixed(1)}%</div>
                          {getVerificationBadge(assignment.matchScore)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="text-sm">{assignment.approvedBy}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(assignment.approvedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {getStatusBadge(assignment.invoice.status)}
                      </td>
                      <td className="p-4">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/invoices/${assignment.invoice.id}`, '_blank')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Download or view more details
                              console.log('View details for assignment:', assignment.id);
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
