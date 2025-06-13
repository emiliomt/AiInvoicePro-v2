
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: invoice } = useQuery({
    queryKey: [`/api/invoices/${id}`],
    enabled: !!id,
  });

  const fileUrl = `/api/invoices/${id}/preview/file`;

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
      link.download = invoice?.fileName || 'invoice.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: `Downloading ${invoice?.fileName}...`,
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/invoices')}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back to Invoices
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {invoice?.fileName || 'Invoice Preview'}
                </h1>
                <p className="text-sm text-gray-600">Invoice #{invoice?.invoiceNumber || id}</p>
              </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download size={16} className="mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gray-100 rounded-lg p-8 min-h-[800px] flex items-center justify-center">
            {isLoading && (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading PDF...</p>
              </div>
            )}
            
            {error && (
              <div className="text-center">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
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
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading PDF...</p>
                  </div>
                }
                className="pdf-document"
              >
                <div className="bg-white shadow-lg rounded border overflow-hidden">
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
      </div>
    </div>
  );
}
