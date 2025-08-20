import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  className?: string;
  multiple?: boolean;
}

export function FileUpload({ 
  onFileSelect, 
  accept = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/jpg': ['.jpg'],
    'application/xml': ['.xml'],
    'text/xml': ['.xml'],
    'text/plain': ['.txt'], // Allow text files as fallback
    'application/octet-stream': ['.pdf', '.jpg', '.jpeg', '.png', '.xml'] // Generic binary files
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  className,
  multiple = true,
}: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('FileUpload: Files dropped:', acceptedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })));
    
    // Validate files
    if (!acceptedFiles || acceptedFiles.length === 0) {
      console.error('FileUpload: No files accepted');
      return;
    }
    
    // Check file sizes
    const validFiles = acceptedFiles.filter(file => {
      if (file.size > maxSize) {
        console.warn(`FileUpload: File ${file.name} is too large (${file.size} bytes, max: ${maxSize} bytes)`);
        return false;
      }
      return true;
    });
    
    if (validFiles.length === 0) {
      console.error('FileUpload: No valid files after validation');
      return;
    }
    
    setSelectedFiles(validFiles);
    onFileSelect(validFiles);
  }, [onFileSelect, maxSize]);

  const onDropRejected = useCallback((rejectedFiles: any[]) => {
    console.log('FileUpload: Files rejected:', rejectedFiles);
    // You could show a toast here for rejected files
  }, []);

  const handleClick = useCallback(() => {
    // This will trigger the file input click
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = Object.entries(accept)
      .map(([mimeType, extensions]) => extensions.map(ext => mimeType + ext).join(','))
      .join(',');
    
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        const files = Array.from(target.files);
        console.log('FileUpload: Files selected via click:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
        setSelectedFiles(files);
        onFileSelect(files);
      }
    };
    
    input.click();
  }, [multiple, accept, onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    onDropRejected,
    accept,
    maxSize,
    multiple,
    onDropAccepted: (files) => {
      console.log('FileUpload: Dropzone accepted files:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    },
    onFileDialogCancel: () => {
      console.log('FileUpload: File dialog cancelled');
    },
  });

  const clearFiles = () => {
    setSelectedFiles([]);
    onFileSelect([]); // Notify parent component
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prevFiles) => {
      const newFiles = [...prevFiles];
      newFiles.splice(index, 1);
      onFileSelect(newFiles); // Notify parent component
      return newFiles;
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        onClick={handleClick}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive && !isDragReject && "border-primary bg-primary/5",
          isDragReject && "border-destructive bg-destructive/5",
          !isDragActive && "border-gray-300 hover:border-primary"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4">
          <Upload className="w-12 h-12 text-gray-400" />
          <div>
            <p className="text-lg font-medium text-gray-900">
              {isDragActive ? "Drop your files here" : multiple ? "Upload Invoices" : "Upload Invoice"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {multiple 
                ? "Drag and drop your PDF, JPG, or PNG files here, or click to browse"
                : "Drag and drop your PDF, JPG, or PNG file here, or click to browse"
              }
            </p>
          </div>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              Selected files ({selectedFiles.length})
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFiles}
              className="text-gray-500 hover:text-gray-700"
            >
              Clear all
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileText className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}