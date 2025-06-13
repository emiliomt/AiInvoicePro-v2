
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
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

  const { data: invoice } = useQuery({
    queryKey: [`/api/invoices/${id}`],
    enabled: !!id,
  });

  useEffect(() => {
    if (id && window.pdfjsLib) {
      loadPDF();
    }
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [id]);

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

      const url = `/api/invoices/${id}/preview/file`;
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
      const containerWidth = container.clientWidth - 64; // Account for padding
      const containerHeight = container.clientHeight - 64;
      
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
      canvas.height = viewport.height;
      canvas.width = viewport.width;

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
      const response = await fetch(`/api/invoices/${id}/preview/file`);
      
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/invoices')}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back to Invoices
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {invoice?.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Invoice Preview'}
                </h1>
                <p className="text-sm text-gray-600">{invoice?.fileName || `Document ID: ${id}`}</p>
              </div>
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
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 p-8" ref={containerRef}>
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
            
            {!isLoading && !error && (
              <div className="bg-white shadow-lg rounded border overflow-hidden flex items-center justify-center">
                <canvas 
                  ref={canvasRef}
                  className="max-w-full max-h-full"
                  style={{ 
                    display: pdfDoc ? 'block' : 'none',
                    margin: 'auto'
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
      </div>
    </div>
  );
}
