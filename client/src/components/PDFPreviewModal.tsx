
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  fileName 
}: PDFPreviewModalProps) {
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    try {
      setIsLoading(true);
      // In a real implementation, this would download the actual file
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
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">
                PDF Preview
              </DialogTitle>
              <DialogDescription className="mt-1">
                {fileName}
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
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
        
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-gray-100 rounded-lg p-8 min-h-[600px] flex items-center justify-center">
            {/* PDF Viewer Container */}
            <div 
              className="bg-white shadow-lg rounded border"
              style={{ 
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
                width: '210mm', // A4 width
                minHeight: '297mm', // A4 height
              }}
            >
              {/* Placeholder for PDF content */}
              <div className="p-8 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-4">
                  <h3 className="text-lg font-medium text-blue-900 mb-2">
                    PDF Preview Ready
                  </h3>
                  <p className="text-sm text-blue-700">
                    In a production environment, this would display the actual PDF content using PDF.js or a similar library.
                  </p>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-2">File Information</h4>
                  <div className="text-left space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium">File:</span> {fileName}</p>
                    <p><span className="font-medium">Invoice ID:</span> {invoiceId}</p>
                    <p><span className="font-medium">Type:</span> PDF Document</p>
                  </div>
                </div>
                
                <div className="mt-6 text-xs text-gray-500">
                  To implement actual PDF viewing, integrate PDF.js or react-pdf library
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
