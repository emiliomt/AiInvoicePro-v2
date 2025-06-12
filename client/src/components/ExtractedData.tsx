import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { InfoIcon } from "lucide-react";

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
}

interface LineItem {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
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
              <InfoIcon className="text-gray-400" size={32} />
            </div>
            <p className="text-gray-500">Upload an invoice to see extracted data here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const invoice = invoiceDetails || invoiceToShow;
  const confidenceScore = invoice.confidenceScore ? parseFloat(invoice.confidenceScore) * 100 : 0;

  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">Extracted Invoice Data</CardTitle>
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
                type="date"
                value={invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : ""}
                className="mt-2"
                readOnly
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="totalAmount" className="text-sm font-medium text-gray-700">
                Total Amount
              </Label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <Input
                  id="totalAmount"
                  value={invoice.totalAmount || ""}
                  className="pl-8"
                  readOnly
                />
              </div>
            </div>
            <div>
              <Label htmlFor="dueDate" className="text-sm font-medium text-gray-700">
                Due Date
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={invoice.dueDate ? invoice.dueDate.split('T')[0] : ""}
                className="mt-2"
                readOnly
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Confidence Score
              </Label>
              <div className="flex items-center space-x-3 mt-2">
                <Progress value={confidenceScore} className="flex-1" />
                <span className="text-sm font-medium text-success-600">
                  {Math.round(confidenceScore)}%
                </span>
              </div>
            </div>
          </div>
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
              <InfoIcon className="w-4 h-4" />
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
  );
}
