
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  fileName: string;
  invoiceNumber?: string;
}

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export default function PDFPreviewModal({ 
  isOpen, 
  onClose, 
  invoiceId, 
  fileName = "Invoice Document",
  invoiceNumber
}: PDFPreviewModalProps) {
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoFit, setIsAutoFit] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && window.pdfjsLib) {
      loadPDF();
    }
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [isOpen, invoiceId]);

  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, zoom]);

  useEffect(() => {
    const handleResize = () => {
      if (isAutoFit && pdfDoc && currentPage) {
        calculateOptimalZoom();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isAutoFit, pdfDoc, currentPage]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Configure PDF.js worker
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      const url = `/api/invoices/${invoiceId}/preview/file`;
      const loadingTask = window.pdfjsLib.getDocument(url);
      
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      
      // Auto-fit on load
      if (isAutoFit) {
        setTimeout(() => calculateOptimalZoom(), 100);
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError('Failed to load PDF. The file may not be available or is corrupted.');
      toast({
        title: "PDF Load Error",
        description: "Failed to load the PDF file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateOptimalZoom = async () => {
    if (!pdfDoc || !containerRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      
      const container = containerRef.current;
      const containerWidth = container.clientWidth - 100; // Account for padding and scrollbar
      const containerHeight = container.clientHeight - 100;
      
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const optimalScale = Math.min(scaleX, scaleY, 1.5); // Cap at 150%
      
      const newZoom = Math.round(optimalScale * 100);
      setZoom(Math.max(50, Math.min(200, newZoom))); // Keep within bounds
    } catch (err) {
      console.error('Error calculating optimal zoom:', err);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const scale = zoom / 100;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      // Set canvas dimensions to match the viewport
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Clear any previous content
      context?.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Error rendering page:', err);
      setError('Failed to render PDF page');
    }
  };

  const handleDownload = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/invoices/${invoiceId}/preview/file`);
      
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleZoomIn = () => {
    setIsAutoFit(false);
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setIsAutoFit(false);
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handleFitToWidth = () => {
    setIsAutoFit(true);
    calculateOptimalZoom();
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[95vh] h-[95vh] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">
                PDF Preview
              </DialogTitle>
              <DialogDescription className="mt-1">
                {invoiceNumber ? `Invoice ${invoiceNumber}` : fileName}
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              {totalPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-sm font-medium min-w-[80px] text-center">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
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
                disabled={zoom <= 50}
              >
                <ZoomOut size={16} />
              </Button>
              <span className="text-sm font-medium min-w-[60px] text-center">
                {zoom}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 200}
              >
                <ZoomIn size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFitToWidth}
                className={isAutoFit ? "bg-blue-50 border-blue-300" : ""}
              >
                Fit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isLoading}
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
        
        <div className="flex-1 overflow-auto bg-gray-100" ref={containerRef}>
          <div className="p-6 flex justify-center min-h-full">
            {isLoading && (
              <div className="text-center flex items-center justify-center w-full">
                <div>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading PDF...</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="text-center flex items-center justify-center w-full">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h3 className="text-lg font-medium text-red-900 mb-2">
                    Error Loading PDF
                  </h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}
            
            {!isLoading && !error && (
              <div className="bg-white shadow-lg rounded border p-4 inline-block">
                <canvas 
                  ref={canvasRef}
                  className="block"
                  style={{ 
                    display: pdfDoc ? 'block' : 'none',
                    maxWidth: 'none'
                  }}
                />
                {!pdfDoc && (
                  <div className="p-8 text-center">
                    <p className="text-gray-600">No PDF loaded</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
