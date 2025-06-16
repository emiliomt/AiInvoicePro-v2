import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { History, Loader2 } from "lucide-react";

export default function InvoiceUpload() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Upload files sequentially to avoid overwhelming the server
      const results = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('invoice', file);
        
        const response = await apiRequest('POST', '/api/invoices/upload', formData);
        const result = await response.json();
        results.push({ file: file.name, ...result });
      }
      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.invoiceId);
      const failed = results.filter(r => !r.invoiceId);
      
      if (successful.length > 0) {
        toast({
          title: "Upload Successful",
          description: `${successful.length} invoice(s) uploaded and processing started.`,
        });
      }
      
      if (failed.length > 0) {
        toast({
          title: "Some uploads failed",
          description: `${failed.length} file(s) failed to upload.`,
          variant: "destructive",
        });
      }
      
      setSelectedFiles([]);
      
      // Refresh dashboard stats
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      // Set up polling for successful uploads
      successful.forEach((result) => {
        const checkInvoiceStatus = async () => {
          try {
            const response = await apiRequest('GET', `/api/invoices/${result.invoiceId}`);
            const invoice = await response.json();
            
            if (invoice.status === 'extracted') {
              queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
              toast({
                title: "Processing Complete",
                description: `${result.file} data has been extracted and is ready for review.`,
              });
            } else if (invoice.status === 'rejected') {
              toast({
                title: "Processing Failed",
                description: `Error processing ${result.file}. Please try again.`,
                variant: "destructive",
              });
            } else {
              // Continue polling
              setTimeout(checkInvoiceStatus, 2000);
            }
          } catch (error) {
            console.error('Error checking invoice status:', error);
          }
        };
        
        setTimeout(checkInvoiceStatus, 2000);
      });
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
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      uploadMutation.mutate(selectedFiles);
    }
  };

  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">Upload Invoice</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-700">
            <History className="w-4 h-4 mr-1" />
            View History
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <FileUpload onFileSelect={handleFileSelect} multiple={true} />
        
        {uploadMutation.isPending && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center space-x-3">
              <Loader2 className="animate-spin h-5 w-5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-primary-900">Uploading invoices...</p>
                <p className="text-xs text-primary-700">Processing {selectedFiles.length} file(s)</p>
              </div>
            </div>
          </div>
        )}
        
        {selectedFiles.length > 0 && !uploadMutation.isPending && (
          <div className="flex justify-end">
            <Button 
              onClick={handleUpload}
              className="bg-primary-600 hover:bg-primary-700"
            >
              Upload {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
