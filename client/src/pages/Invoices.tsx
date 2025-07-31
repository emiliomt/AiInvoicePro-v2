import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Trash2, CheckCircle, XCircle, AlertCircle, Clock, DollarSign, Calendar, FileCheck, Eye, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

interface Invoice {
  id: number;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  status: string;
  ocrText?: string;
  extractedData?: any;
  vendorName?: string;
  totalAmount?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
}

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500", icon: Clock },
  processing: { label: "Processing", color: "bg-blue-500", icon: Clock },
  extracted: { label: "Extracted", color: "bg-green-500", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-500", icon: XCircle },
  rejected: { label: "Rejected", color: "bg-red-500", icon: XCircle },
  approved: { label: "Approved", color: "bg-green-600", icon: CheckCircle },
  paid: { label: "Paid", color: "bg-blue-600", icon: DollarSign },
  matched: { label: "Matched", color: "bg-purple-500", icon: FileCheck },
  classifying_items: { label: "Classifying Items", color: "bg-orange-500", icon: Clock },
  checking_petty_cash: { label: "Checking Petty Cash", color: "bg-yellow-600", icon: DollarSign },
  project_matching: { label: "Project Matching", color: "bg-indigo-500", icon: Clock },
  validating: { label: "Validating", color: "bg-blue-400", icon: Clock },
  validation_failed: { label: "Validation Failed", color: "bg-red-400", icon: XCircle },
  po_matching: { label: "PO Matching", color: "bg-purple-400", icon: Clock },
  po_matched: { label: "PO Matched", color: "bg-green-400", icon: CheckCircle },
  no_po_match: { label: "No PO Match", color: "bg-yellow-400", icon: AlertCircle },
  petty_cash: { label: "Petty Cash", color: "bg-teal-500", icon: DollarSign },
  processing_failed: { label: "Processing Failed", color: "bg-red-600", icon: XCircle }
};

export default function Invoices() {
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('invoices', file);
      });
      
      const response = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Upload Successful",
        description: "Invoices have been uploaded successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to upload invoices. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Invoice Deleted",
        description: "Invoice has been deleted successfully.",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/invoices/${id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `invoice-${id}.pdf`;
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Download Started",
        description: "File download has started.",
      });
    },
    onError: () => {
      toast({
        title: "Download Failed",
        description: "Failed to download file.",
        variant: "destructive",
      });
    },
  });

  const processInvoicesMutation = useMutation({
    mutationFn: async (invoiceIds: number[]) => {
      const response = await fetch('/api/invoices/initiate-automatic-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceIds, source: 'manual' })
      });
      
      if (!response.ok) {
        throw new Error('Failed to process invoices');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Processing Started",
        description: `Started post-extraction workflow for ${data.summary.totalInvoices} invoices.`,
      });
      setSelectedInvoices([]);
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to start processing.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadMutation.mutate(files);
    }
  };

  const handleSelectInvoice = (invoiceId: number, checked: boolean) => {
    if (checked) {
      setSelectedInvoices(prev => [...prev, invoiceId]);
    } else {
      setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const extractedInvoices = invoices.filter((invoice: Invoice) => invoice.status === 'extracted');
      setSelectedInvoices(extractedInvoices.map((invoice: Invoice) => invoice.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  const handleProcessSelected = () => {
    if (selectedInvoices.length === 0) {
      toast({
        title: "No Invoices Selected",
        description: "Please select at least one extracted invoice to process.",
        variant: "destructive",
      });
      return;
    }
    processInvoicesMutation.mutate(selectedInvoices);
  };

  const handlePreview = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPreviewOpen(true);
  };

  const extractedInvoices = invoices.filter((invoice: Invoice) => invoice.status === 'extracted');
  const allExtractedSelected = extractedInvoices.length > 0 && 
    extractedInvoices.every((invoice: Invoice) => selectedInvoices.includes(invoice.id));

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading invoices...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage and process your invoice documents
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleProcessSelected}
            disabled={selectedInvoices.length === 0 || processInvoicesMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {processInvoicesMutation.isPending ? "Processing..." : `Initiate Automatic Process (${selectedInvoices.length})`}
          </Button>
          <Button asChild>
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              Upload Invoices
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </Button>
        </div>
      </div>

      {extractedInvoices.length > 0 && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-blue-800">Post-Extraction Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Checkbox
                id="select-all"
                checked={allExtractedSelected}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium text-blue-700">
                Select all extracted invoices ({extractedInvoices.length})
              </label>
              <span className="text-sm text-blue-600">
                {selectedInvoices.length} selected for processing
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {invoices.map((invoice: Invoice) => {
          const config = statusConfig[invoice.status as keyof typeof statusConfig] || statusConfig.pending;
          const IconComponent = config.icon;
          const isExtracted = invoice.status === 'extracted';
          const isSelected = selectedInvoices.includes(invoice.id);

          return (
            <Card key={invoice.id} className={`relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
              {isExtracted && (
                <div className="absolute top-3 left-3 z-10">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleSelectInvoice(invoice.id, checked as boolean)}
                  />
                </div>
              )}
              
              <CardHeader className={isExtracted ? 'pl-12' : ''}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg truncate">
                    {invoice.fileName}
                  </CardTitle>
                  <Badge className={`${config.color} text-white`}>
                    <IconComponent className="w-3 h-3 mr-1" />
                    {config.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {invoice.vendorName && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">Vendor:</span>
                      <span>{invoice.vendorName}</span>
                    </div>
                  )}
                  {invoice.totalAmount && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">Amount:</span>
                      <span>${invoice.totalAmount}</span>
                    </div>
                  )}
                  {invoice.invoiceDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">Date:</span>
                      <span>{new Date(invoice.invoiceDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">Uploaded:</span>
                    <span>{new Date(invoice.uploadedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(invoice)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadMutation.mutate(invoice.id)}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(invoice.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {invoices.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No invoices uploaded</h3>
            <p className="text-gray-500 mb-4">Upload your first invoice to get started</p>
            <Button asChild>
              <label htmlFor="file-upload-empty" className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload Invoices
                <input
                  id="file-upload-empty"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.xml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Invoice Preview - {selectedInvoice?.fileName}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold">Vendor Name</h3>
                  <p>{selectedInvoice.vendorName || "N/A"}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Total Amount</h3>
                  <p>${selectedInvoice.totalAmount || "N/A"}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Invoice Number</h3>
                  <p>{selectedInvoice.invoiceNumber || "N/A"}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Invoice Date</h3>
                  <p>{selectedInvoice.invoiceDate ? new Date(selectedInvoice.invoiceDate).toLocaleDateString() : "N/A"}</p>
                </div>
              </div>
              {selectedInvoice.extractedData && (
                <div>
                  <h3 className="font-semibold">Extracted Data</h3>
                  <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedInvoice.extractedData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}