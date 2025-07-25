import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, CheckCircle, XCircle, AlertTriangle, Clock, Eye, Download, RefreshCw, FileCheck } from "lucide-react";
import Header from "@/components/Header";
import { CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

interface ValidationResults {
  totalInvoices: number;
  verified: number;
  flagged: number;
  needsReview: number;
  pending: number;
  invoiceValidations: Array<{
    invoiceId: number;
    fileName: string;
    vendorName: string;
    isValid: boolean;
    violations: Array<{
      field: string;
      ruleType: string;
      message: string;
      severity: string;
    }>;
  }>;
}

export default function InvoiceVerification() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [selectedInvoiceForValidation, setSelectedInvoiceForValidation] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: approvedAssignments = [], isLoading } = useQuery<ApprovedInvoiceProject[]>({
    queryKey: ["/api/approved-invoice-projects"],
    queryFn: async () => {
      const response = await fetch("/api/approved-invoice-projects");
      if (!response.ok) throw new Error("Failed to fetch approved invoice projects");
      return response.json();
    },
  });

  const { data: validationResults, isLoading: isValidationLoading } = useQuery<ValidationResults>({
    queryKey: ["/api/validation-rules/validate-all"],
    queryFn: async () => {
      const response = await fetch("/api/validation-rules/validate-all");
      if (!response.ok) throw new Error("Failed to fetch validation results");
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

  const handleValidationClick = async (invoice: any) => {
    try {
      // First validate the invoice data directly instead of using the problematic endpoint
      const validationData = {
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        taxAmount: invoice.taxAmount,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency
      };

      const response = await fetch('/api/validation-rules/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationData),
      });

      if (!response.ok) {
        throw new Error(`Validation request failed: ${response.status}`);
      }

      const validationResult = await response.json();

      // Get the current validation rules to show which ones were applied
      const rulesResponse = await fetch('/api/validation-rules');
      const allRules = rulesResponse.ok ? await rulesResponse.json() : [];

      setSelectedInvoiceForValidation({
        ...invoice,
        validationResults: {
          ...validationResult,
          rulesApplied: allRules.length,
          appliedRules: allRules.map((rule: any) => rule.name)
        }
      });
      setShowValidationDialog(true);
    } catch (error) {
      console.error("Validation error:", error);
      toast({
        title: "Error",
        description: "Failed to fetch validation results. Please try again.",
        variant: "destructive",
      });
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
    <div className="min-h-screen bg-gray-50"
      // Add a bottom padding to account for the mobile navigation
    >
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Validation Results Section */}
        {validationResults && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Validation Results Summary</CardTitle>
              <CardDescription>
                Shows how invoices perform against configured validation rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{validationResults.verified}</div>
                  <div className="text-sm text-gray-600">Passed All Rules</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{validationResults.flagged}</div>
                  <div className="text-sm text-gray-600">Critical Violations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{validationResults.needsReview}</div>
                  <div className="text-sm text-gray-600">Needs Review</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{validationResults.pending}</div>
                  <div className="text-sm text-gray-600">Pending</div>
                </div>
              </div>

              {validationResults.invoiceValidations && validationResults.invoiceValidations.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Detailed Validation Results</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {validationResults.invoiceValidations.map((validation) => (
                      <div key={validation.invoiceId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{validation.fileName}</div>
                          <div className="text-sm text-gray-600">{validation.vendorName}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {validation.isValid ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Valid
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              {validation.violations.length} Issue{validation.violations.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {validation.violations.length > 0 && (
                            <div className="text-xs text-gray-500">
                              {validation.violations.map(v => v.severity).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                            <div className="font-medium">ID: {assignment.invoice.id}</div>
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
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleValidationClick(assignment.invoice)}
                              title="View Validation Results"
                            >
                              <FileCheck className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Download or view more details
                                console.log('View details for assignment:', assignment.id);
                              }}
                              title="Download Details"
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

        {/* Validation Results Dialog */}
        <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Validation Results</DialogTitle>
              <DialogDescription>
                Detailed validation results for {selectedInvoiceForValidation?.fileName}
              </DialogDescription>
            </DialogHeader>
            {selectedInvoiceForValidation && (
              <div className="space-y-6">
                {/* Invoice Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Invoice ID</label>
                    <p className="text-sm text-gray-900 mt-1">{selectedInvoiceForValidation.id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Vendor</label>
                    <p className="text-sm text-gray-900 mt-1">{selectedInvoiceForValidation.vendorName || "Unknown"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Amount</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {selectedInvoiceForValidation.currency || 'COP'} {selectedInvoiceForValidation.totalAmount ? parseFloat(selectedInvoiceForValidation.totalAmount).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <div className="mt-1">
                      {getStatusBadge(selectedInvoiceForValidation.status)}
                    </div>
                  </div>
                </div>

                {/* Validation Results */}
                {selectedInvoiceForValidation.validationResults ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium">Validation Status</h4>
                      <div className="flex items-center space-x-2">
                        {selectedInvoiceForValidation.validationResults.isValid ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            All Rules Passed
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-4 h-4 mr-1" />
                            {selectedInvoiceForValidation.validationResults.violations?.length || 0} Violation(s)
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Rule Violations */}
                    {selectedInvoiceForValidation.validationResults.violations && selectedInvoiceForValidation.validationResults.violations.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="font-medium text-red-600">Rule Violations</h5>
                        {selectedInvoiceForValidation.validationResults.violations.map((violation: any, index: number) => (
                          <div key={index} className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-lg">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h6 className="font-medium text-red-800">{violation.field}</h6>
                                <p className="text-sm text-red-700 mt-1">{violation.message}</p>
                                <div className="flex items-center mt-2 space-x-2">
                                  <Badge variant="outline" className="text-xs">
                                    {violation.ruleType}
                                  </Badge>
                                  <Badge variant={violation.severity === 'critical' ? 'destructive' : violation.severity === 'warning' ? 'secondary' : 'outline'} className="text-xs">
                                    {violation.severity}
                                  </Badge>
                                </div>
                              </div>
                              <XCircle className="w-5 h-5 text-red-500 mt-1" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Passed Rules */}
                    {selectedInvoiceForValidation.validationResults.passedRules && selectedInvoiceForValidation.validationResults.passedRules.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="font-medium text-green-600">Passed Rules</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedInvoiceForValidation.validationResults.passedRules.map((rule: any, index: number) => (
                            <div key={index} className="border-l-4 border-green-400 bg-green-50 p-3 rounded-r-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h6 className="font-medium text-green-800 text-sm">{rule.field}</h6>
                                  <p className="text-xs text-green-700">{rule.ruleType}</p>
                                </div>
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Information */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Validation Date:</span>
                          <p className="text-gray-900">{new Date().toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Rules Applied:</span>
                          <p className="text-gray-900">
                            {selectedInvoiceForValidation.validationResults?.rulesApplied || 0} rule(s)
                          </p>
                        </div>
                      </div>
                      {selectedInvoiceForValidation.validationResults?.appliedRules && 
                       selectedInvoiceForValidation.validationResults.appliedRules.length > 0 && (
                        <div className="mt-3">
                          <span className="font-medium text-gray-700 text-sm">Applied Rules:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedInvoiceForValidation.validationResults.appliedRules.map((ruleName: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {ruleName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-600">No validation results available for this invoice.</p>
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
                    Close
                  </Button>
                  <Button variant="outline" onClick={() => window.open('/validation-rules', '_blank')}>
                    View Rules Configuration
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}