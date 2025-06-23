import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, CheckCircle, XCircle, AlertTriangle, Clock, Eye, Download, RefreshCw } from "lucide-react";
import Header from "@/components/Header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VerifiedInvoiceProject {
  id: number;
  invoiceId: number;
  projectId: string;
  matchScore: string;
  matchDetails: any;
  approvedBy: string;
  approvedAt: string;
  verifiedAt: string;
  createdAt: string;
  validationResults: any;
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

export default function VerifiedInvoices() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: verifiedInvoices = [], isLoading } = useQuery<VerifiedInvoiceProject[]>({
    queryKey: ["/api/verified-invoice-projects"],
    queryFn: async () => {
      const response = await fetch("/api/verified-invoice-projects");
      if (!response.ok) throw new Error("Failed to fetch verified invoice projects");
      return response.json();
    },
  });

  const processValidationsMutation = useMutation({
    mutationFn: () => apiRequest("/api/process-approved-validations", {
      method: "POST",
    }),
    onSuccess: (data) => {
      toast({
        title: "Processing Complete",
        description: `${data.totalProcessed} validated invoices moved to verified status`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/verified-invoice-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approved-invoice-projects"] });
    },
    onError: (error) => {
      console.error("Processing error:", error);
      toast({
        title: "Processing Failed", 
        description: "Failed to process validated invoices. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredInvoices = verifiedInvoices.filter(assignment => {
    const matchesSearch = !searchTerm || 
      assignment.invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.invoice.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.project.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || assignment.invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-blue-100 text-blue-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "flagged":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Flagged</Badge>;
      case "needs_review":
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Needs Review</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMatchScoreBadge = (score: string) => {
    const numericScore = parseFloat(score);
    if (numericScore >= 90) {
      return <Badge className="bg-green-100 text-green-800">High Confidence</Badge>;
    } else if (numericScore >= 70) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium Confidence</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Low Confidence</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Unresolved Invoice-PO Matches
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review and resolve invoice-purchase order matching conflicts
          </p>
        </div>

        {/* PO Matching Issues Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Unresolved Matches</p>
                  <p className="text-2xl font-bold text-orange-600">{verifiedInvoices.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">High Confidence</p>
                  <p className="text-2xl font-bold text-green-600">
                    {verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 90).length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Needs Review</p>
                  <p className="text-2xl font-bold text-red-600">
                    {verifiedInvoices.filter(v => parseFloat(v.matchScore) < 70).length}
                  </p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            onClick={() => processValidationsMutation.mutate()}
            disabled={processValidationsMutation.isPending}
            className="flex items-center gap-2"
          >
            {processValidationsMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Process New Validations
          </Button>
        </div>

        {/* Verified Invoice-Project Assignments Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              Unresolved Invoice-PO Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                Loading verified invoices...
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No Unresolved Matches
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  All invoice-PO matches have been resolved or there are no pending matches.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice Details</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">ID: {assignment.invoice.id}</div>
                            <div className="text-sm text-gray-500">{assignment.invoice.fileName}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(assignment.invoice.invoiceDate).toLocaleDateString()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{assignment.invoice.vendorName || 'Unknown'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {assignment.invoice.currency} {parseFloat(assignment.invoice.totalAmount || '0').toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{assignment.project.name}</div>
                            <div className="text-sm text-gray-500">{assignment.project.projectId}</div>
                            <div className="text-sm text-gray-500">
                              Supervisor: {assignment.project.supervisor}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">{parseFloat(assignment.matchScore).toFixed(1)}%</div>
                            {getMatchScoreBadge(assignment.matchScore)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{assignment.approvedBy}</div>
                            <div className="text-sm text-gray-500">
                              {new Date(assignment.approvedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge("verified")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}