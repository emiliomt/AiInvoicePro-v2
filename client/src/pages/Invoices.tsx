import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download, Calendar, DollarSign, Trash2, FileIcon, AlertTriangle, ThumbsUp, Upload, Play, Loader2, CheckSquare, Square, Package, Link, CheckCircle, XCircle, Clock, Target, X } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import ExtractionFeedbackModal from "@/components/ExtractionFeedbackModal";
import { Checkbox } from "@/components/ui/checkbox"

interface Invoice {
  id: number;
  fileName: string;
  status: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: string | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  createdAt: string;
  userId: string;
  ocrText?: string | null;
  isDataSource?: boolean | null;
  extractedData?: {
    confidenceScore?: string;
    [key: string]: any;
  };
  // Post-extraction workflow outcome fields
  classifiedItems?: any;
  projectMatch?: any;
  pettyCashFlag?: boolean;
  validationResult?: {
    isValid: boolean;
    score: number;
  };
  poMatches?: any[];
  validationErrors?: any[];
  processingError?: string;
}

interface LinkedFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  baseFileName: string;
  isDataSource: boolean;
  downloadedAt: string;
  metadata: any;
}

interface LinkedFilesInfo {
  invoiceId: number;
  mainFile: string;
  linkedFiles: LinkedFile[];
  hasLinkedFiles: boolean;
}

// Helper function to determine if invoice was extracted using AI/OCR (vs XML)
const isAIExtractedInvoice = (invoice: Invoice): boolean => {
  // XML files don't need AI feedback buttons since they have structured data
  if (invoice.fileName?.toLowerCase().endsWith('.xml')) {
    return false;
  }

  // PDF/JPG/PNG files or invoices with OCR text indicate AI extraction
  const isPDFImageFile = /\.(pdf|jpg|jpeg|png)$/i.test(invoice.fileName || '');
  const hasOCRText = !!invoice.ocrText;

  return isPDFImageFile || hasOCRText;
};

// Helper function to check if invoice is eligible for "Report a Problem" button
const isEligibleForProblemReport = (invoice: Invoice): boolean => {
  // Only show for extracted invoices
  if (invoice.status !== 'extracted') {
    return false;
  }

  // Only show for PDF files (not XML files)
  const isPDFFile = /\.pdf$/i.test(invoice.fileName || '');
  if (!isPDFFile) {
    return false;
  }

  // For manual uploads (non-RPA), always show the button if it's AI-extracted
  if (invoice.userId !== 'rpa-system') {
    return isAIExtractedInvoice(invoice);
  }

  // For RPA imports, show the button for all PDF files since they used OCR extraction
  // Even if isDataSource is null/undefined, we still want to show the button for RPA PDFs
  return isAIExtractedInvoice(invoice);
};

// Enhanced status badge component with icons and colors
const getStatusBadge = (invoice: Invoice) => {
  const status = invoice.status;

  switch (status) {
    case 'po_matched':
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          PO Matched
        </Badge>
      );
    case 'petty_cash':
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
          <DollarSign className="w-3 h-3 mr-1" />
          Petty Cash
        </Badge>
      );
    case 'validation_failed':
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Validation Failed
        </Badge>
      );
    case 'no_po_match':
      return (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          No PO Match
        </Badge>
      );
    case 'processing_failed':
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Processing Error
        </Badge>
      );
    case 'classifying_items':
    case 'checking_petty_cash':
    case 'project_matching':
    case 'validating':
    case 'po_matching':
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Processing...
        </Badge>
      );
    case 'extracted':
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
          <FileText className="w-3 h-3 mr-1" />
          Ready to Process
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
  }
};

export default function Invoices() {
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [feedbackInvoice, setFeedbackInvoice] = useState<Invoice | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingAutomatic, setIsProcessingAutomatic] = useState(false);
  const [linkedFilesMap, setLinkedFilesMap] = useState<Record<number, LinkedFilesInfo>>({});
  const [showProcessingSummary, setShowProcessingSummary] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [selectedInvoiceOutcome, setSelectedInvoiceOutcome] = useState<Invoice | null>(null);
  const [showLatestResults, setShowLatestResults] = useState(true);

  const { data: invoices = [], isLoading, error, refetch } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      try {
        console.log('Fetching invoices...');
        const response = await apiRequest('GET', '/api/invoices');
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch invoices: ${response.status} ${response.statusText}`, errorText);

          // Handle specific error cases
          if (response.status === 401) {
            throw new Error('Authentication required. Please log in.');
          } else if (response.status === 403) {
            throw new Error('Access denied. Please check your permissions.');
          } else if (response.status === 500) {
            throw new Error('Server error. Please try again later.');
          }

          throw new Error(`Failed to fetch invoices: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Invoices fetched:', data.length, 'invoices');
        return data;
      } catch (err: any) {
        console.error('Invoices query error:', err.message);
        throw err;
      }
    },
    retry: (failureCount, error: any) => {
      // Don't retry on authentication errors
      if (error?.message?.includes('Authentication required') || error?.message?.includes('401')) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1000,
    refetchInterval: false, // Disable automatic refetching
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Function to fetch linked files for RPA invoices on demand
  const fetchLinkedFilesForInvoices = async (rpaInvoices: Invoice[]) => {
    const linkedFilesData: Record<number, LinkedFilesInfo> = {};

    for (const invoice of rpaInvoices) {
      try {
        const response = await apiRequest('GET', `/api/invoices/${invoice.id}/linked-files`);
        if (response.ok) {
          const linkedInfo: LinkedFilesInfo = await response.json();
          linkedFilesData[invoice.id] = linkedInfo;
        }
      } catch (error) {
        console.error(`Failed to fetch linked files for invoice ${invoice.id}:`, error);
      }
    }

    setLinkedFilesMap(prev => ({ ...prev, ...linkedFilesData }));
  };

  // Fetch linked files only when explicitly needed (on-demand)
  const fetchLinkedFilesOnDemand = useCallback(async (invoiceId: number) => {
    if (linkedFilesMap[invoiceId]) return; // Already fetched

    try {
      const response = await apiRequest('GET', `/api/invoices/${invoiceId}/linked-files`);
      if (response.ok) {
        const linkedInfo: LinkedFilesInfo = await response.json();
        setLinkedFilesMap(prev => ({ ...prev, [invoiceId]: linkedInfo }));
      }
    } catch (error) {
      console.error(`Failed to fetch linked files for invoice ${invoiceId}:`, error);
      // Don't throw the error to prevent unhandled promise rejections
    }
  }, [linkedFilesMap]);

  // Automatically fetch linked files for RPA invoices when they load
  useEffect(() => {
    if (invoices && invoices.length > 0) {
      const rpaInvoices = invoices.filter(invoice => invoice.userId === 'rpa-system');
      if (rpaInvoices.length > 0) {
        fetchLinkedFilesForInvoices(rpaInvoices);
      }
    }
  }, [invoices]);

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest('DELETE', `/api/invoices/${invoiceId}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to delete invoice ${invoiceId}:`, errorText);
        throw new Error(`Failed to delete invoice: ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/invoices/delete-all');
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to delete all invoices:', errorText);
        throw new Error(`Failed to delete all invoices: ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "All invoices have been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "failed": return "bg-red-100 text-red-800";
      case "draft": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatAmount = (amount: string | null, currency: string) => {
    if (!amount || amount === "null" || amount === "undefined") return "N/A";

    // Clean up any potential HTML or corrupted content
    const cleanAmount = typeof amount === 'string' ? amount.replace(/<[^>]*>/g, '').trim() : amount;

    const numericAmount = parseFloat(cleanAmount);
    if (isNaN(numericAmount)) return "N/A";

    const formattedNumber = numericAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${formattedNumber}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
    } catch {
      return "Invalid date";
    }
  };

  const safeRenderText = (text: string | null | undefined, fallback: string = "N/A") => {
    if (!text || text === "null" || text === "undefined") return fallback;

    // Clean up any HTML tags or corrupted content
    const cleanText = typeof text === 'string' ? text.replace(/<[^>]*>/g, '').trim() : String(text);

    // Check if the text contains excessive special characters (likely corrupted)
    const specialCharRatio = (cleanText.match(/[^a-zA-Z0-9\s\-_.,]/g) || []).length / cleanText.length;
    if (specialCharRatio > 0.3) {
      return fallback;
    }

    return cleanText.substring(0, 100); // Limit length to prevent UI overflow
  };

  const isPDFFile = (fileName: string | null) => {
    return fileName ? fileName.toLowerCase().endsWith('.pdf') : false;
  };

  const handlePreviewClick = (invoice: Invoice) => {
    // For RPA invoices with linked PDFs, we need to create a special preview invoice object
    // that points to the linked PDF endpoint instead of the main file
    const linkedInfo = linkedFilesMap[invoice.id];
    const hasLinkedFiles = linkedInfo && linkedInfo.hasLinkedFiles;

    if (hasLinkedFiles && invoice.userId === 'rpa-system') {
      // Create a modified invoice object for linked PDF preview
      const linkedPDFInvoice = {
        ...invoice,
        fileName: linkedInfo.linkedFiles[0]?.fileName || 'linked.pdf',
        // Use special preview endpoint for linked PDFs
        _isLinkedPDF: true,
        _linkedPDFUrl: `/api/invoices/${invoice.id}/preview-pdf`
      };
      setPreviewInvoice(linkedPDFInvoice as any);
    } else {
      setPreviewInvoice(invoice);
    }
    setShowPreviewModal(true);
  };

  const handleFeedbackClick = (invoice: Invoice) => {
    setFeedbackInvoice(invoice);
    setShowFeedbackModal(true);
  };

  const handleFeedback = (invoice: Invoice) => {
    setFeedbackInvoice(invoice);
    setShowFeedbackModal(true);
  };

  const positiveFeedbackMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest('POST', `/api/invoices/${invoiceId}/positive-feedback`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thanks! Your positive feedback helps improve our AI extraction.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Feedback Failed",
        description: "Failed to submit positive feedback",
        variant: "destructive",
      });
    },
  });

  const handlePositiveFeedback = (invoiceId: number) => {
    positiveFeedbackMutation.mutate(invoiceId);
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      const linkedInfo = linkedFilesMap[invoice.id];
      const hasLinkedFiles = linkedInfo && linkedInfo.hasLinkedFiles;

      const response = await fetch(`/api/invoices/${invoice.id}/download`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Download failed');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Set appropriate filename based on whether it's a ZIP or single file
      if (hasLinkedFiles) {
        const baseFileName = invoice.fileName.replace(/\.[^/.]+$/, "");
        a.download = `${baseFileName}_with_references.zip`;
      } else {
        a.download = invoice.fileName;
      }

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: hasLinkedFiles 
          ? `Downloading ${invoice.fileName} with ${linkedInfo.linkedFiles.length} linked file(s)`
          : `Downloading ${invoice.fileName}`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('invoice', file);
      });

      const response = await apiRequest('POST', '/api/invoices/upload', formData);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Successfully uploaded ${data.uploadedCount} invoice(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(files);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadMutation]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedInvoices.length === 0) return;

    try {
      const response = await fetch('/api/invoices/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: bulkAction,
          invoiceIds: selectedInvoices,
        }),
      });

      if (!response.ok) throw new Error('Bulk action failed');

      toast({
        title: "Success",
        description: `Bulk ${bulkAction} completed successfully`,
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedInvoices([]);
      setBulkAction('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to perform bulk action",
        variant: "destructive",
      });
    }
  };

  const handleInitiateAutomaticProcess = async () => {
    if (selectedInvoices.length === 0) {
      toast({
        title: "No Invoices Selected",
        description: "Please select invoices to process automatically",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingAutomatic(true);

    try {
      const requestPayload = {
        invoiceIds: selectedInvoices,
        source: 'manual'
      };

      console.log('Sending automatic processing request:', requestPayload);

      // Add timeout to prevent hanging forever
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('Request aborted due to timeout');
      }, 30000); // 30 second timeout

      const response = await fetch('/api/invoices/initiate-automatic-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || 'Automatic processing failed');
      }

      const result = await response.json();
      console.log('Processing result:', result);

      // Show detailed processing results
      const { processedCount, totalCount, results } = result;
      const successfulProcessing = results?.filter((r: any) => r.success) || [];
      const failedProcessing = results?.filter((r: any) => !r.success) || [];

      let description = `Successfully processed ${processedCount}/${totalCount} invoices.`;

      if (successfulProcessing.length > 0) {
        const poMatches = successfulProcessing.filter((r: any) => r.poMatches > 0).length;
        const projectAssignments = successfulProcessing.filter((r: any) => r.projectAssigned).length;

        if (poMatches > 0 || projectAssignments > 0) {
          description += ` Found ${poMatches} PO matches and ${projectAssignments} project assignments.`;
        }
      }

      if (failedProcessing.length > 0) {
        description += ` ${failedProcessing.length} invoices failed processing.`;
      }

      toast({
        title: "Automatic Processing Completed",
        description,
        variant: processedCount === totalCount ? "default" : "destructive",
      });

      // Refresh the invoices list
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setSelectedInvoices([]);

      // Show processing summary
      setShowProcessingSummary(true);

    } catch (error: any) {
      console.error('Automatic processing failed:', error);

      if (error.name === 'AbortError') {
        toast({
          title: "Processing Timeout",
          description: "The processing took too long and was cancelled. Please try again or contact support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Automatic Processing Failed",
          description: error.message || "Failed to initiate automatic processing",
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessingAutomatic(false);
    }
  };

  // Manual reset function for stuck processing state
  const resetProcessingState = () => {
    console.log('Manually resetting processing state');
    setIsProcessingAutomatic(false);
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    toast({
      title: "Processing State Reset",
      description: "The processing state has been manually reset.",
    });
  };

  const handleSelectInvoice = (invoiceId: number) => {
    setSelectedInvoices(prev => {
      if (prev.includes(invoiceId)) {
        return prev.filter(id => id !== invoiceId);
      } else {
        return [...prev, invoiceId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === invoices?.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices?.map(invoice => invoice.id) || []);
    }
  };

  // Calculate processing stats
  const calculateProcessingStats = (invoices: any[]) => {
    let poMatched = 0;
    let pettyCash = 0;
    let noPOMatch = 0;
    let failedErrors = 0;

    invoices.forEach(invoice => {
      const results = invoice.extractedData?.processingResults;

      if (results?.isPettyCash) {
        pettyCash++;
      } else if (results?.poMatched) {
        poMatched++;
      } else if (results?.processingStatus === 'failed') {
        failedErrors++;
      } else if (results && !results.poMatched) {
        noPOMatch++;
      }
    });

    return { poMatched, pettyCash, noPOMatch, failedErrors };
  };

  const processingStats = calculateProcessingStats(invoices || []);
  const totalInvoices = processingStats.poMatched + processingStats.pettyCash + processingStats.noPOMatch + processingStats.failedErrors;

  // Calculate processing summary
  const getProcessingSummary = () => {
    if (!invoices) return { poMatched: 0, pettyCash: 0, noPOMatch: 0, failed: 0 };

    return {
      poMatched: invoices.filter(i => i.status === 'po_matched').length,
      pettyCash: invoices.filter(i => i.status === 'petty_cash').length,
      noPOMatch: invoices.filter(i => i.status === 'no_po_match').length,
      failed: invoices.filter(i => ['validation_failed', 'processing_failed'].includes(i.status)).length,
    };
  };

  const processingSummary = getProcessingSummary();

  // Show processing summary if there are recent processing results
  useEffect(() => {
    if (invoices && invoices.length > 0) {
      const hasProcessingResults = invoices.some(i => 
        ['po_matched', 'petty_cash', 'no_po_match', 'validation_failed', 'processing_failed'].includes(i.status)
      );
      if (hasProcessingResults && !showProcessingSummary) {
        setShowProcessingSummary(true);
      }
    }
  }, [invoices, showProcessingSummary]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-24"></div>
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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
              <p className="text-gray-600 mt-2">Manage and view all your processed invoices</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                Refresh
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleUploadClick}
                disabled={isUploading}
              >
                <Upload size={16} className="mr-2" />
                {isUploading ? "Uploading..." : "Upload Invoice"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xml,.jpg,.jpeg,.png"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              {invoices.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 size={16} className="mr-2" />
                      Delete All Invoices
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete All Invoices</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete ALL invoices? This action cannot be undone.
                        This will permanently delete all {invoices.length} invoice{invoices.length === 1 ? '' : 's'} and their associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAllMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={deleteAllMutation.isPending}
                      >
                        {deleteAllMutation.isPending ? "Deleting..." : "Delete All"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="flex items-center space-x-2">
                <Button
                  onClick={handleInitiateAutomaticProcess}
                  disabled={selectedInvoices.length === 0 || isProcessingAutomatic}
                >
                  {isProcessingAutomatic ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <Play size={16} className="mr-2" />
                  )}
                  {isProcessingAutomatic ? "Processing..." : `Initiate Automatic Process (${selectedInvoices.length})`}
                </Button>
                {isProcessingAutomatic && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetProcessingState}
                    className="text-red-600 hover:text-red-700"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Latest Processing Results */}
        {showLatestResults && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Latest Processing Results</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLatestResults(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{processingStats.poMatched}</div>
                  <div className="text-sm text-gray-600">PO Matched</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{processingStats.pettyCash}</div>
                  <div className="text-sm text-gray-600">Petty Cash</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{processingStats.noPOMatch}</div>
                  <div className="text-sm text-gray-600">No PO Match</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{processingStats.failedErrors}</div>
                  <div className="text-sm text-gray-600">Failed/Errors</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                Based on {totalInvoices} total invoices with processing results
              </div>
            </CardContent>
          </Card>
        )}

        {showProcessingSummary && (
          <Card className="mb-6 border-l-4 border-l-blue-500">
            <CardContent className="pt-4">
              <h3 className="font-semibold text-lg mb-3">Latest Processing Results</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{processingSummary.poMatched}</div>
                  <div className="text-sm text-gray-600">PO Matched</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{processingSummary.pettyCash}</div>
                  <div className="text-sm text-gray-600">Petty Cash</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{processingSummary.noPOMatch}</div>
                  <div className="text-sm text-gray-600">No PO Match</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{processingSummary.failed}</div>
                  <div className="text-sm text-gray-600">Failed/Errors</div>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowProcessingSummary(false)}
                className="mt-2"
              >
                Dismiss
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Error loading invoices</h3>
                    <p className="text-sm text-red-600 mt-1">{(error as Error).message}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => refetch()}
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!error && invoices.length === 0 && !isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                <p className="text-gray-600">Upload your first invoice to get started.</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => refetch()}
                >
                  Refresh
                </Button>
              </CardContent>
            </Card>
          ) : !error && invoices.length > 0 ? (
            <div>
              {/* Select All Option */}
              <Card className="mb-4">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        checked={selectedInvoices.length === invoices?.length && invoices.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span>{selectedInvoices.length === invoices?.length ? 'Deselect All' : 'Select All'}</span>
                      <span className="text-gray-500">
                        {selectedInvoices.length > 0 ? `${selectedInvoices.length} selected` : `${invoices?.length || 0} total`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6">
              {invoices.map((invoice) => {
                if (!invoice || !invoice.id) {
                  console.warn('Invalid invoice data:', invoice);
                  return null;
                }

                return (
                  <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            checked={selectedInvoices.includes(invoice.id)}
                            onCheckedChange={() => handleSelectInvoice(invoice.id)}
                          />
                          <div className="space-y-2">
                            <CardTitle className="flex items-center space-x-2">
                              <FileText className="text-blue-600" size={20} />
                              <span>Invoice #{invoice.invoiceNumber || "N/A"}</span>
                            </CardTitle>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span>Uploaded {formatDate(invoice.createdAt)}</span>
                              {linkedFilesMap[invoice.id]?.hasLinkedFiles && (
                                <div className="flex items-center space-x-1 text-blue-600">
                                  <Link size={14} />
                                  <span>{linkedFilesMap[invoice.id].linkedFiles.length} linked file(s)</span>
                                </div>
                              )}
                              {/* Debug indicator for RPA invoices */}
                              {invoice.userId === 'rpa-system' && (
                                <div className="flex items-center space-x-1 text-purple-600 text-xs">
                                  <span>RPA</span>
                                  {linkedFilesMap[invoice.id] ? (
                                    <span>({linkedFilesMap[invoice.id].hasLinkedFiles ? 'HAS' : 'NO'})</span>
                                  ) : (
                                    <span>(loading...)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {/* Main Status Badge */}
                          {getStatusBadge(invoice)}

                          {/* Additional Outcome Info */}
                          {invoice.status === 'po_matched' && invoice.poMatches && (
                            <div className="text-xs text-gray-500">
                              Matched to PO #{invoice.poMatches[0]?.poId || 'N/A'}
                            </div>
                          )}

                          {invoice.status === 'petty_cash' && (
                            <div className="text-xs text-gray-500">
                              {formatAmount(invoice.totalAmount, invoice.currency)} petty cash
                            </div>
                          )}

                          {invoice.status === 'validation_failed' && invoice.validationErrors && (
                            <div className="text-xs text-red-600">
                              {invoice.validationErrors.length} validation errors
                            </div>
                          )}

                          {/* Outcome Details Button */}
                          {['po_matched', 'petty_cash', 'validation_failed', 'no_po_match', 'processing_failed'].includes(invoice.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedInvoiceOutcome(invoice);
                                setShowOutcomeModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 p-1"
                            >
                              <Target className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-500">Vendor</p>
                          <p className="text-sm text-gray-900">{safeRenderText(invoice.vendorName)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-500">Amount</p>
                          <p className="text-sm text-gray-900 flex items-center">
                            <DollarSign size={14} className="mr-1" />
                            {formatAmount(invoice.totalAmount, invoice.currency)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-500">Invoice Date</p>
                          <p className="text-sm text-gray-900 flex items-center">
                            <Calendar size={14} className="mr-1" />
                            {formatDate(invoice.invoiceDate)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-500">Due Date</p>
                          <p className="text-sm text-gray-900 flex items-center">
                            <Calendar size={14} className="mr-1" />
                            {formatDate(invoice.dueDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 flex-wrap gap-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowDetailsModal(true);
                          }}
                        >
                          <Eye size={16} className="mr-2" />
                          View Details
                        </Button>
                        {(isPDFFile(invoice.fileName) || linkedFilesMap[invoice.id]?.hasLinkedFiles) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreviewClick(invoice)}
                              className={linkedFilesMap[invoice.id]?.hasLinkedFiles ? "text-purple-600 border-purple-300" : ""}
                            >
                              <FileIcon size={16} className="mr-2" />
                              {linkedFilesMap[invoice.id]?.hasLinkedFiles ? "Preview PDF" : "Preview"}
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownload(invoice)}
                          className={linkedFilesMap[invoice.id]?.hasLinkedFiles ? "text-blue-600 border-blue-300" : ""}
                        >
                          {linkedFilesMap[invoice.id]?.hasLinkedFiles ? (
                            <>
                              <Package size={16} className="mr-2" />
                              Download Package ({linkedFilesMap[invoice.id].linkedFiles.length + 1} files)
                            </>
                          ) : (
                            <>
                              <Download size={16} className="mr-2" />
                              Download
                            </>
                          )}
                        </Button>
                        {invoice.status === 'extracted' && isAIExtractedInvoice(invoice) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePositiveFeedback(invoice.id)}
                              className="text-green-600 border-green-300 hover:bg-green-50"
                            >
                              <ThumbsUp size={14} className="mr-1" />
                              Good Job AI!
                            </Button>

                            {/* Report Error button - show for all eligible PDF invoices */}
                            {isEligibleForProblemReport(invoice) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFeedback(invoice)}
                                className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              >
                                <AlertTriangle size={16} className="mr-2" />
                                Report Error
                              </Button>
                            )}
                          </>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                              <Trash2 size={16} className="mr-2" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this invoice? This action cannot be undone.
                                This will permanently delete the invoice "{invoice.fileName}" and all its associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(invoice.id)}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deleteMutation.isPending}
>
                                {deleteMutation.isPending ? "Deleting..." : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              }).filter(Boolean)}
            </div>
            </div>
          ) : null}
        </div>

        {/* Invoice Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
              <DialogDescription>
                Detailed information for {selectedInvoice?.fileName}
              </DialogDescription>
            </DialogHeader>
            {selectedInvoice && (
              <div className="space-y-6">
                {/* Core Invoice Information */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Core Invoice Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">File Name</label>
                      <p className="text-sm text-gray-900 mt-1">{selectedInvoice.fileName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Status</label>
                      <div className="mt-1">
                        <Badge className={getStatusColor(selectedInvoice.status)}>
                          {selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                        </Badge>
</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Upload Date</label>
                      <p className="text-sm text-gray-900 mt-1">{formatDate(selectedInvoice.createdAt)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Currency</label>
                      <p className="text-sm text-gray-900 mt-1">{selectedInvoice.currency || "COP"}</p>
                    </div>
                  </div>
                </div>

                {/* Vendor Details */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">• Vendor Details</h4>
                  <p className="text-sm text-gray-600 mb-3">Vendor name and tax ID/VAT number</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Vendor Name</label>
                      <p className="text-sm text-gray-900 mt-1">{safeRenderText(selectedInvoice.vendorName, "Not extracted")}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Tax ID/VAT Number</label>
                      <p className="text-sm text-gray-900 mt-1">{safeRenderText((selectedInvoice as any).extractedData?.taxId, "Not extracted")}</p>
                    </div>
                  </div>
                </div>

                {/* Invoice Identification */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">• Invoice Identification</h4>
                  <p className="text-sm text-gray-600 mb-3">Invoice number, invoice date, due date</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Invoice Number</label>
                      <p className="text-sm text-gray-900 mt-1">{safeRenderText(selectedInvoice.invoiceNumber, "Not extracted")}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Invoice Date</label>
                      <p className="text-sm text-gray-900 mt-1">{formatDate(selectedInvoice.invoiceDate)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Due Date</label>
                      <p className="text-sm text-gray-900 mt-1">{formatDate(selectedInvoice.dueDate)}</p>
                    </div>
                  </div>
                </div>

                {/* Financial Data */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">• Financial Data</h4>
                  <p className="text-sm text-gray-600 mb-3">Total amount, tax amount, subtotal, and currency</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Amount</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {formatAmount(selectedInvoice.totalAmount, selectedInvoice.currency)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Tax Amount</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {formatAmount((selectedInvoice as any).taxAmount, selectedInvoice.currency)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Subtotal</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {(() => {
                          const subtotal = (selectedInvoice as any).subtotal || selectedInvoice.extractedData?.subtotal;
                          return formatAmount(subtotal, selectedInvoice.currency);
                        })()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Confidence Score</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {(selectedInvoice as any).confidenceScore ? `${(parseFloat((selectedInvoice as any).confidenceScore) * 100).toFixed(1)}%` : "Not available"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Business Context */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">• Business Context</h4>
                  <p className="text-sm text-gray-600 mb-3">Company name (buyer) and concept/description of services</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Company Name (Buyer)</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.companyName || "Not extracted"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Buyer Tax ID</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.buyerTaxId || "Not extracted"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Project Name</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).projectName || (selectedInvoice as any).extractedData?.projectName || "Not extracted"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Project City</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.projectCity || "Not extracted"}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-gray-700">Concept/Description</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.concept || "Not extracted"}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-gray-700">Description Summary</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.descriptionSummary || "Not extracted"}</p>
                    </div>
                  </div>
                </div>

                {/* Addresses */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">• Address Information</h4>
                  <p className="text-sm text-gray-600 mb-3">Vendor and buyer address details</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Vendor Address</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.vendorAddress || "Not extracted"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Buyer Address</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.buyerAddress || "Not extracted"}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-gray-700">Project Address</label>
                      <p className="text-sm text-gray-900 mt-1">{(selectedInvoice as any).extractedData?.projectAddress || "Not extracted"}</p>
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                {(selectedInvoice as any).extractedData?.lineItems && Array.isArray((selectedInvoice as any).extractedData.lineItems) && (selectedInvoice as any).extractedData.lineItems.length > 0 && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">• Line Items</h4>
                    <p className="text-sm text-gray-600 mb-3">Detailed breakdown of services and materials</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(selectedInvoice as any).extractedData.lineItems.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.description || "N/A"}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.quantity || "N/A"}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.unitPrice ? formatAmount(item.unitPrice, selectedInvoice.currency) : "N/A"}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.totalPrice ? formatAmount(item.totalPrice, selectedInvoice.currency) : "N/A"}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.itemType || "N/A"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Additional Notes */}
                {(selectedInvoice as any).extractedData?.notes && (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">• Additional Notes</h4>
                    <p className="text-sm text-gray-600 mb-3">Additional observations or terms</p>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <p className="text-sm text-gray-900">{(selectedInvoice as any).extractedData.notes}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                    Close
                  </Button>
                  {(isPDFFile(selectedInvoice.fileName) || linkedFilesMap[selectedInvoice.id]?.hasLinkedFiles) && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDetailsModal(false);
                          handlePreviewClick(selectedInvoice);
                        }}
                        className={linkedFilesMap[selectedInvoice.id]?.hasLinkedFiles ? "text-purple-600 border-purple-300" : ""}
                      >
                        <FileIcon size={16} className="mr-2" />
                        {linkedFilesMap[selectedInvoice.id]?.hasLinkedFiles ? "Preview Linked PDF" : "Preview PDF"}
                      </Button>
                    </>
                  )}
                  <Button variant="outline">
                    <Download size={16} className="mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* PDF Preview Modal */}
        {previewInvoice && (
          <PDFPreviewModal
            isOpen={showPreviewModal}
            onClose={() => {
              setShowPreviewModal(false);
              setPreviewInvoice(null);
            }}
            invoiceId={previewInvoice.id}
            fileName={previewInvoice.fileName || 'Unknown File'}
            invoiceNumber={previewInvoice.invoiceNumber || undefined}
            customPreviewUrl={(previewInvoice as any)._linkedPDFUrl}
          />
        )}

        {/* Extraction Feedback Modal */}
        {feedbackInvoice && (
          <ExtractionFeedbackModal
            isOpen={showFeedbackModal}
            onClose={() => {
              setShowFeedbackModal(false);
              setFeedbackInvoice(null);
            }}
            invoice={feedbackInvoice as any}
          />
        )}

        {/* Detailed Outcome Modal */}
        <Dialog open={showOutcomeModal} onOpenChange={setShowOutcomeModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Processing Outcome Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedInvoiceOutcome && (
                <>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(selectedInvoiceOutcome)}
                    <span className="font-medium">{selectedInvoiceOutcome.fileName}</span>
                  </div>

                  {/* Step-by-step results */}
                  <div className="space-y-3">
                    <div className="border rounded p-3">
                      <h4 className="font-medium">Line Item Classification</h4>
                      <div className="text-sm text-gray-600 mt-1">
                        {selectedInvoiceOutcome.classifiedItems?.length || 0} items classified
                      </div>
                    </div>

                    <div className="border rounded p-3">
                      <h4 className="font-medium">Petty Cash Check</h4>
                      <div className="text-sm text-gray-600 mt-1">
                        {selectedInvoiceOutcome.pettyCashFlag ? 'Classified as petty cash' : 'Not petty cash'}
                      </div>
                    </div>

                    {!selectedInvoiceOutcome.pettyCashFlag && (
                      <>
                        <div className="border rounded p-3">
                          <h4 className="font-medium">Project Matching</h4>
                          <div className="text-sm text-gray-600 mt-1">
                            {selectedInvoiceOutcome.projectMatch ? 
                              `Matched to project: ${selectedInvoiceOutcome.projectMatch}` : 
                              'No project match found'}
                          </div>
                        </div>

                        <div className="border rounded p-3">
                          <h4 className="font-medium">Validation</h4>
                          <div className="text-sm text-gray-600 mt-1">
                            {selectedInvoiceOutcome.validationResult?.isValid ? 
                              'Passed all validation rules' : 
                              `Failed ${selectedInvoiceOutcome.validationErrors?.length || 0} validation rules`}
                          </div>
                        </div>

                        <div className="border rounded p-3">
                          <h4 className="font-medium">PO Matching</h4>
                          <div className="text-sm text-gray-600 mt-1">
                            {selectedInvoiceOutcome.poMatches?.length ? 
                              `Matched to ${selectedInvoiceOutcome.poMatches.length} PO(s)` : 
                              'No PO matches found'}
                          </div>
                        </div>
                      </>
                    )}

                    {selectedInvoiceOutcome.processingError && (
                      <div className="border rounded p-3 bg-red-50">
                        <h4 className="font-medium text-red-800">Processing Error</h4>
                        <div className="text-sm text-red-600 mt-1">
                          {selectedInvoiceOutcome.processingError}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}