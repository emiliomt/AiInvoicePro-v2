import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Eye, Download, Trash2, FileText, Calendar, DollarSign, Building2, Hash, User, AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import PettyCashManager from "@/components/PettyCashManager";
import ProjectAssignment from "@/components/ProjectAssignment";
import DiscrepancyDisplay from "@/components/DiscrepancyDisplay";

interface Invoice {
  id: number;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  taxAmount: string | null;
  subtotal: string | null;
  confidenceScore: string | null;
  status: string;
  lineItems?: LineItem[];
  currency?: string;
}

interface LineItem {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

interface ProjectMatch {
  project: {
    id: string;
    projectId: string;
    name: string;
    address?: string;
    city?: string;
    supervisor?: string;
    budget?: number;
    currency?: string;
    vatNumber?: string;
    isValidated: boolean;
  };
  matchScore: number;
  matchReasons: string[];
}

export default function ExtractedData() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [rejectionComments, setRejectionComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get latest invoices
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  // Get the latest extracted invoice
  const latestExtractedInvoice = invoices?.find(inv => inv.status === 'extracted');
  const invoiceToShow = selectedInvoiceId
    ? invoices?.find(inv => inv.id === selectedInvoiceId)
    : latestExtractedInvoice;

  // Get detailed invoice data
  const { data: invoiceDetails } = useQuery<Invoice>({
    queryKey: ["/api/invoices", invoiceToShow?.id],
    enabled: !!invoiceToShow?.id,
  });

  // Simulated project matches (replace with actual API call)
  const [projectMatches, setProjectMatches] = useState<ProjectMatch[]>([
    {
      project: {
        id: "1",
        projectId: "PJ-001",
        name: "Project Alpha",
        address: "123 Main St",
        city: "Anytown",
        supervisor: "John Doe",
        budget: 50000,
        currency: "USD",
        vatNumber: "true",
        isValidated: true,
      },
      matchScore: 85,
      matchReasons: ["Project Name", "Address", "City"],
    },
    {
      project: {
        id: "2",
        projectId: "PJ-002",
        name: "Project Beta",
        address: "456 Elm St",
        city: "Springfield",
        supervisor: "Jane Smith",
        budget: 75000,
        currency: "USD",
        vatNumber: "false",
        isValidated: false,
      },
      matchScore: 60,
      matchReasons: ["Project Name", "City"],
    },
  ]);

  const approveMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest('POST', `/api/invoices/${invoiceId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice Approved",
        description: "Invoice has been sent for approval successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ invoiceId, comments }: { invoiceId: number; comments: string }) => {
      const response = await apiRequest('POST', `/api/invoices/${invoiceId}/reject`, { comments });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice Rejected",
        description: "Invoice has been rejected. Please review and resubmit.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setRejectionComments("");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Rejection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (invoiceToShow) {
      approveMutation.mutate(invoiceToShow.id);
    }
  };

  const handleReject = () => {
    if (invoiceToShow) {
      rejectMutation.mutate({ invoiceId: invoiceToShow.id, comments: rejectionComments });
    }
  };

  if (!invoiceToShow) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Extracted Invoice Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Info className="text-gray-400" size={32} />
            </div>
            <p className="text-gray-500">Upload an invoice to see extracted data here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const invoice = invoiceDetails || invoiceToShow;
  const confidenceScore = invoice.confidenceScore ? parseFloat(invoice.confidenceScore) * 100 : 0;
  const isPettyCash = invoice.totalAmount && parseFloat(invoice.totalAmount) < 1000;

  return (
    <div className="space-y-4">
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">Extracted Invoice Data</CardTitle>
            {isPettyCash && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <DollarSign size={14} className="mr-1" />
                Petty Cash
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="vendorName" className="text-sm font-medium text-gray-700">
                  Vendor Name
                </Label>
                <Input
                  id="vendorName"
                  value={invoice.vendorName || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="companyName" className="text-sm font-medium text-gray-700">
                  Company Name (Buyer)
                </Label>
                <Input
                  id="companyName"
                  value={(invoice as any).extractedData?.companyName || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="invoiceNumber" className="text-sm font-medium text-gray-700">
                  Invoice Number
                </Label>
                <Input
                  id="invoiceNumber"
                  value={invoice.invoiceNumber || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="invoiceDate" className="text-sm font-medium text-gray-700">
                  Invoice Date
                </Label>
                <Input
                  id="invoiceDate"
                  value={invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="dueDate" className="text-sm font-medium text-gray-700">
                  Due Date
                </Label>
                <Input
                  id="dueDate"
                  value={invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : ""}
                  className="mt-2"
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Financial Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div>
              <Label htmlFor="subtotal" className="text-sm font-medium text-gray-700">
                Subtotal
              </Label>
              <Input
                id="subtotal"
                value={`${(invoice as any).extractedData?.subtotal || ""} ${invoice.currency || "USD"}`}
                className="mt-2"
                readOnly
              />
            </div>
            <div>
              <Label htmlFor="taxAmount" className="text-sm font-medium text-gray-700">
                Tax Amount
              </Label>
              <Input
                id="taxAmount"
                value={`${invoice.taxAmount || ""} ${invoice.currency || "USD"}`}
                className="mt-2"
                readOnly
              />
            </div>
            <div>
              <Label htmlFor="totalAmount" className="text-sm font-medium text-gray-700">
                Total Amount
              </Label>
              <Input
                id="totalAmount"
                value={`${invoice.totalAmount || ""} ${invoice.currency || "USD"}`}
                className="mt-2"
                readOnly
              />
            </div>
            <div>
              <Label htmlFor="currency" className="text-sm font-medium text-gray-700">
                Currency
              </Label>
              <Input
                id="currency"
                value={invoice.currency || "USD"}
                className="mt-2"
                readOnly
              />
            </div>
          </div>

          {/* Project & Description Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Project Information</h3>
              <div>
                <Label htmlFor="projectName" className="text-sm font-medium text-gray-700">
                  Project Name
                </Label>
                <Input
                  id="projectName"
                  value={(invoice as any).extractedData?.projectName || invoice.projectName || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="projectAddress" className="text-sm font-medium text-gray-700">
                  Project Address
                </Label>
                <Input
                  id="projectAddress"
                  value={(invoice as any).extractedData?.projectAddress || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="projectCity" className="text-sm font-medium text-gray-700">
                  Project City
                </Label>
                <Input
                  id="projectCity"
                  value={(invoice as any).extractedData?.projectCity || ""}
                  className="mt-2"
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Description & Notes</h3>
              <div>
                <Label htmlFor="concept" className="text-sm font-medium text-gray-700">
                  Concept / Raw Description
                </Label>
                <textarea
                  id="concept"
                  value={(invoice as any).extractedData?.concept || ""}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  rows={2}
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="descriptionSummary" className="text-sm font-medium text-gray-700">
                  Description Summary
                </Label>
                <textarea
                  id="descriptionSummary"
                  value={(invoice as any).extractedData?.descriptionSummary || ""}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  rows={2}
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
                  Additional Notes
                </Label>
                <textarea
                  id="notes"
                  value={(invoice as any).extractedData?.notes || ""}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  rows={2}
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* AI Confidence Score */}
          <div className="mt-6">
            <Label htmlFor="confidenceScore" className="text-sm font-medium text-gray-700">
              AI Confidence Score
            </Label>
            <div className="mt-2 flex items-center space-x-2">
              <Progress value={confidenceScore} className="flex-1" />
              <span className="text-sm font-medium">{confidenceScore.toFixed(1)}%</span>
            </div>
          </div>

          {/* Project Validation Comparison */}
          <div className="mt-8 border-t pt-6">
            <div className="flex items-center space-x-2 mb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Project Validation Comparison</h3>
            </div>

            {projectMatches.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Found {projectMatches.length} potential project match{projectMatches.length > 1 ? 'es' : ''} based on extracted data:
                </p>

                {projectMatches.map((match, index) => (
                  <Card key={match.project.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium text-gray-900">{match.project.name}</h4>
                            <Badge
                              variant={match.matchScore >= 70 ? "default" : match.matchScore >= 40 ? "secondary" : "outline"}
                              className={match.matchScore >= 70 ? "bg-green-100 text-green-800" : match.matchScore >= 40 ? "bg-yellow-100 text-yellow-800" : ""}
                            >
                              {match.matchScore}% match
                            </Badge>
                            {match.project.isValidated && (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle size={12} className="mr-1" />
                                Validated
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p><span className="font-medium">Project ID:</span> {match.project.projectId}</p>
                              <p><span className="font-medium">Address:</span> {match.project.address || "—"}</p>
                              <p><span className="font-medium">City:</span> {match.project.city || "—"}</p>
                            </div>
                            <div>
                              <p><span className="font-medium">Supervisor:</span> {match.project.supervisor || "—"}</p>
                              <p><span className="font-medium">Budget:</span> {match.project.budget ? `${match.project.budget} ${match.project.currency}` : "—"}</p>
                              <p><span className="font-medium">VAT:</span> {match.project.vatNumber === 'true' ? 'Yes' : match.project.vatNumber === 'false' ? 'No' : '—'}</p>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="text-sm font-medium text-gray-700">Match reasons:</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {match.matchReasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="ml-4">
                          {match.matchScore >= 70 ? (
                            <CheckCircle className="h-6 w-6 text-green-500" />
                          ) : match.matchScore >= 40 ? (
                            <AlertTriangle className="h-6 w-6 text-yellow-500" />
                          ) : (
                            <XCircle className="h-6 w-6 text-red-500" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <p className="text-gray-600">No matching projects found in validation criteria.</p>
                <p className="text-sm text-gray-500 mt-1">
                  The extracted project information doesn't match any existing validation records.
                </p>
              </div>
            )}
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Line Items</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">Description</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Quantity</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Unit Price</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoice.lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3">{item.description}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-right">${item.unitPrice}</td>
                        <td className="px-4 py-3 text-right font-medium">${item.totalPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {invoice.status === 'extracted' && (
            <div className="flex justify-between items-start pt-6 border-t border-gray-200">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Info className="w-4 h-4" />
                <span>AI extracted data - please review for accuracy</span>
              </div>
              <div className="space-y-3">
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    onClick={handleReject}
                    disabled={rejectMutation.isPending}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                    className="bg-primary-600 hover:bg-primary-700"
                  >
                    Send for Approval
                  </Button>
                </div>
                <div className="w-full">
                  <Textarea
                    placeholder="Rejection comments (optional)"
                    value={rejectionComments}
                    onChange={(e) => setRejectionComments(e.target.value)}
                    className="text-sm"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Petty Cash Manager for petty cash invoices */}
      {isPettyCash && <PettyCashManager invoiceId={invoice.id} />}

      {/* Project Assignment and PO Matching for regular invoices */}
      {!isPettyCash && (
        <ProjectAssignment
          invoiceId={invoice.id}
          currentProject={(invoice as any).extractedData?.assignedProject}
        />
      )}

      {/* Discrepancy Detection Display */}
      <DiscrepancyDisplay invoiceId={invoice.id} />
    </div>
  );
}