import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Invoice {
  id: number;
  fileName: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: string | null;
  currency: string;
  extractedData?: any;
  ocrText?: string;
}

interface ExtractionFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export default function ExtractionFeedbackModal({ 
  isOpen, 
  onClose, 
  invoice 
}: ExtractionFeedbackModalProps) {
  const [reason, setReason] = useState("");
  const [correctedData, setCorrectedData] = useState({
    vendorName: invoice.vendorName || "",
    invoiceNumber: invoice.invoiceNumber || "",
    totalAmount: invoice.totalAmount || "",
    taxId: invoice.extractedData?.taxId || "",
    companyName: invoice.extractedData?.companyName || "",
  });
  const [showCorrections, setShowCorrections] = useState(false);
  const { toast } = useToast();

  const feedbackMutation = useMutation({
    mutationFn: async (feedbackData: any) => {
      const response = await apiRequest('POST', `/api/invoices/${invoice.id}/feedback`, feedbackData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you! This will help improve our AI extraction.",
        duration: 5000,
      });
      onClose();
      setReason("");
      setCorrectedData({
        vendorName: "",
        invoiceNumber: "",
        totalAmount: "",
        taxId: "",
        companyName: "",
      });
      setShowCorrections(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatAmount = (amount: string | null, currency: string) => {
    if (!amount) return "N/A";
    const numericAmount = parseFloat(amount);
    return `${currency} ${numericAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // Fetch AI suggestions from server
  const { data: aiSuggestions } = useQuery({
    queryKey: [`/api/invoices/${invoice.id}/ai-suggestions`],
    queryFn: async () => {
      const response = await fetch(`/api/invoices/${invoice.id}/ai-suggestions`);
      if (!response.ok) throw new Error('Failed to fetch AI suggestions');
      return response.json();
    },
    enabled: isOpen
  });

  // Get AI suggestions with server-side analysis
  const getAISuggestions = () => {
    if (aiSuggestions?.suggestions && aiSuggestions.suggestions.length > 0) {
      return aiSuggestions.suggestions.map((s: any) => ({
        field: s.field,
        issue: s.issue,
        suggestion: s.suggestion,
        correctedValue: s.correctedValue,
        confidence: s.confidence
      }));
    }

    // Fallback to client-side analysis
    const suggestions = [];
    const extractedData = invoice.extractedData as any;

    if (!extractedData?.totalAmount || extractedData.totalAmount === "0" || extractedData.totalAmount === "0.00") {
      suggestions.push({
        field: "Total Amount",
        issue: "Total amount is zero or missing",
        suggestion: "Look for 'TOTAL A PAGAR', 'VALOR TOTAL', or currency symbols in the document"
      });
    }

    if (!extractedData?.vendorName || extractedData.vendorName.length < 3) {
      suggestions.push({
        field: "Vendor Name",
        issue: "Vendor name appears incomplete",
        suggestion: "Look for company name near NIT or at the top of the document"
      });
    }

    return suggestions.length > 0 ? suggestions : [{
      field: "General",
      issue: "Review extraction accuracy",
      suggestion: "Verify all key fields match the source document"
    }];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please describe what's wrong with the extraction",
        variant: "destructive",
      });
      return;
    }

    const feedbackData = {
      reason,
      originalText: invoice.ocrText,
      extractedData: invoice.extractedData,
      correctedData: showCorrections ? correctedData : null,
    };

    feedbackMutation.mutate(feedbackData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="text-orange-500" size={20} />
            <span>Report Extraction Error</span>
          </DialogTitle>
          <DialogDescription>
            Help us improve AI extraction accuracy by reporting errors for {invoice.fileName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Extracted Data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Extracted Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Vendor Name</Label>
                  <p className="text-sm text-gray-900 mt-1">{invoice.vendorName || "Not extracted"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Invoice Number</Label>
                  <p className="text-sm text-gray-900 mt-1">{invoice.invoiceNumber || "Not extracted"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Total Amount</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {formatAmount(invoice.totalAmount, invoice.currency)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Tax ID</Label>
                  <p className="text-sm text-gray-900 mt-1">{invoice.extractedData?.taxId || "Not extracted"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Company Name (Buyer)</Label>
                  <p className="text-sm text-gray-900 mt-1">{invoice.extractedData?.companyName || "Not extracted"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Confidence Score</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {invoice.extractedData?.confidenceScore ? 
                      `${(parseFloat(invoice.extractedData.confidenceScore) * 100).toFixed(1)}%` : 
                      "Not available"
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reason for Reporting */}
          <div className="space-y-2">
            <Label htmlFor="reason">What's wrong with the extraction? *</Label>
            <Textarea
              id="reason"
              placeholder="Describe the extraction errors (e.g., 'Incorrect vendor name', 'Missing tax ID', 'Wrong amount extracted')..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
          </div>

          {/* Optional Corrections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Provide Correct Values (Optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCorrections(!showCorrections)}
              >
                {showCorrections ? "Hide Corrections" : "Add Corrections"}
              </Button>
            </div>

            {showCorrections && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-lg text-green-800 flex items-center space-x-2">
                    <CheckCircle size={16} />
                    <span>Correct Values</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="correctedVendor">Vendor Name</Label>
                  <Input
                    id="correctedVendor"
                    value={correctedData.vendorName}
                    onChange={(e) => setCorrectedData({ ...correctedData, vendorName: e.target.value })}
                    placeholder="Correct vendor name"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 text-xs"
                    onClick={() => {
                      const suggestion = getAISuggestions().find(s => s.field === "Vendor Name");
                      if (suggestion && invoice.vendorName) {
                        setCorrectedData({ ...correctedData, vendorName: invoice.vendorName });
                      }
                    }}
                  >
                    Use Current: {invoice.vendorName}
                  </Button>
                </div>
                    <div>
                      <Label htmlFor="corrected-invoice-num">Invoice Number</Label>
                      <Input
                        id="corrected-invoice-num"
                        value={correctedData.invoiceNumber}
                        onChange={(e) => setCorrectedData({...correctedData, invoiceNumber: e.target.value})}
                        placeholder="Correct invoice number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="corrected-amount">Total Amount</Label>
                      <Input
                        id="corrected-amount"
                        value={correctedData.totalAmount}
                        onChange={(e) => setCorrectedData({...correctedData, totalAmount: e.target.value})}
                        placeholder="Correct total amount"
                      />
                    </div>
                    <div>
                      <Label htmlFor="corrected-tax-id">Tax ID</Label>
                      <Input
                        id="corrected-tax-id"
                        value={correctedData.taxId}
                        onChange={(e) => setCorrectedData({...correctedData, taxId: e.target.value})}
                        placeholder="Correct tax ID"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="corrected-company">Company Name (Buyer)</Label>
                      <Input
                        id="corrected-company"
                        value={correctedData.companyName}
                        onChange={(e) => setCorrectedData({...correctedData, companyName: e.target.value})}
                        placeholder="Correct company name"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!reason.trim() || feedbackMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}