import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  CheckCircle, 
  TrendingUp, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  FileText, 
  Download, 
  MoreHorizontal,
  Eye,
  Clock,
  XCircle
} from "lucide-react";
import Header from "@/components/Header";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: verifiedInvoices = [], isLoading } = useQuery<VerifiedInvoiceProject[]>({
    queryKey: ["/api/verified-invoice-projects"],
    queryFn: async () => {
      const response = await fetch("/api/verified-invoice-projects");
      if (!response.ok) throw new Error("Failed to fetch verified invoices");
      return response.json();
    },
  });

  const processValidationsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/process-approved-validations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to process validations");
      return response.json();
    },
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

  const filteredInvoices = verifiedInvoices.filter(invoice => {
    const matchesSearch = !searchTerm || 
      invoice.invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice.id.toString().includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "verified");
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Verified Invoice-Project Matches
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review verified invoice-project assignments that have been validated
          </p>
        </div>

        {/* Verified Invoices Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Verified</p>
                  <p className="text-2xl font-bold text-green-600">{verifiedInvoices.length}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
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
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Medium Confidence</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 70 && parseFloat(v.matchScore) < 90).length}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
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
              <CheckCircle className="w-4 h-4" />
            )}
            Process New Validations
          </Button>
        </div>

        {/* Verified Invoice-Project Assignments Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              Verified Invoice-Project Matches
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
                  No Verified Matches
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  No verified invoice-project matches found.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium text-gray-700">Invoice Details</th>
                      <th className="text-left p-3 font-medium text-gray-700">Vendor</th>
                      <th className="text-left p-3 font-medium text-gray-700">Amount</th>
                      <th className="text-left p-3 font-medium text-gray-700">Project</th>
                      <th className="text-left p-3 font-medium text-gray-700">Match Score</th>
                      <th className="text-left p-3 font-medium text-gray-700">Approved By</th>
                      <th className="text-left p-3 font-medium text-gray-700">Status</th>
                      <th className="text-left p-3 font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((verifiedInvoice) => (
                      <tr key={verifiedInvoice.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">ID: {verifiedInvoice.invoice.id}</div>
                          <div className="text-sm text-gray-500">
                            {format(new Date(verifiedInvoice.verifiedAt), 'M/d/yyyy')}
                          </div>
                        </td>
                        <td className="p-3 font-medium">
                          {verifiedInvoice.invoice.vendorName || 'Unknown'}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{verifiedInvoice.invoice.currency}</div>
                          <div className="text-sm">{parseFloat(verifiedInvoice.invoice.totalAmount || '0').toLocaleString()}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{verifiedInvoice.project.name}</div>
                          <div className="text-sm text-gray-500">ID: {verifiedInvoice.project.projectId}</div>
                          <div className="text-xs text-gray-400">Supervisor: {verifiedInvoice.project.supervisor}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{parseFloat(verifiedInvoice.matchScore).toFixed(1)}%</div>
                          <div className="text-sm text-green-600">High Confidence</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{verifiedInvoice.approvedBy}</div>
                          <div className="text-sm text-gray-500">
                            {format(new Date(verifiedInvoice.approvedAt), 'M/d/yyyy')}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                              <FileText className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
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
    </div>
  );
}