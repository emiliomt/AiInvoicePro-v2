
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";

interface PDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  fileName: string;
}

export default function PDFPreview({ isOpen, onClose, invoiceId, fileName }: PDFPreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  
  const previewUrl = `/api/invoices/${invoiceId}/preview`;
  
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };
  
  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };
  
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPDF = fileName.toLowerCase().endsWith('.pdf');
  const isImage = fileName.toLowerCase().match(/\.(jpg|jpeg|png)$/);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <DialogTitle className="text-lg font-semibold">
            Preview: {fileName}
          </DialogTitle>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto bg-gray-100 rounded-lg">
          {error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-2">Error loading preview</p>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            </div>
          ) : isPDF ? (
            <div className="h-full flex justify-center">
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                title={`Preview of ${fileName}`}
                onError={() => setError('Failed to load PDF preview')}
              />
            </div>
          ) : isImage ? (
            <div className="flex justify-center items-center h-full p-4">
              <img
                src={previewUrl}
                alt={`Preview of ${fileName}`}
                className="max-w-full max-h-full object-contain"
                style={{ transform: `scale(${zoom})` }}
                onError={() => setError('Failed to load image preview')}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-600 mb-4">Preview not available for this file type</p>
                <Button onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
