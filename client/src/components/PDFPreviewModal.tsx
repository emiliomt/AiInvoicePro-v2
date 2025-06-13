
import { useState } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  fileName: string;
}

export default function PDFPreviewModal({ 
  isOpen, 
  onClose, 
  invoiceId, 
  fileName = "Invoice Document"
}: PDFPreviewModalProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fileUrl = `/api/invoices/${invoiceId}/preview/file`;

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setIsLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF. The file may not be available or is corrupted.');
    setIsLoading(false);
    toast({
      title: "PDF Load Error",
      description: "Failed to load the PDF file",
      variant: "destructive",
    });
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: `Downloading ${fileName}...`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download the file",
        variant: "destructive",
      });
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleZoomReset = () => {
    setScale(1.0);
  };

  const handlePrevPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages));
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">
                PDF Preview
              </DialogTitle>
              <DialogDescription className="mt-1 truncate max-w-md">
                {fileName}
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              {numPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={pageNumber}
                      onChange={(e) => goToPage(parseInt(e.target.value))}
                      className="w-16 text-center text-sm border rounded px-2 py-1"
                      min={1}
                      max={numPages}
                    />
                    <span className="text-sm text-gray-600">of {numPages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={pageNumber >= numPages}
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <div className="border-l h-6 mx-2"></div>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
              >
                <ZoomOut size={16} />
              </Button>
              <span className="text-sm font-medium min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
              >
                <ZoomIn size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomReset}
                title="Reset zoom"
              >
                <RotateCcw size={16} />
              </Button>
              <div className="border-l h-6 mx-2"></div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download size={16} className="mr-2" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex justify-center">
            {isLoading && (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading PDF...</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="flex items-center justify-center h-96">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
                  <h3 className="text-lg font-medium text-red-900 mb-2">
                    Error Loading PDF
                  </h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}
            
            {!error && (
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center h-96">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading PDF...</p>
                    </div>
                  </div>
                }
                className="pdf-document"
              >
                <div className="bg-white shadow-lg border rounded-lg overflow-hidden">
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    loading={
                      <div className="flex items-center justify-center h-96">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    }
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                </div>
              </Document>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
