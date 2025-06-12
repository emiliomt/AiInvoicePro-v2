import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  className?: string;
}

export function FileUpload({ 
  onFileSelect, 
  accept = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png']
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  className 
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
  });

  const clearFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive && !isDragReject && "border-primary-400 bg-primary-50",
          isDragReject && "border-red-400 bg-red-50",
          !isDragActive && "border-gray-300 hover:border-primary-400"
        )}
      >
        <input {...getInputProps()} />
        
        {selectedFile ? (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <File className="text-gray-400" size={32} />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="inline-flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <X size={16} />
              <span>Remove file</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <Upload className="text-gray-400" size={32} />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">
                {isDragActive ? "Drop your invoice here" : "Drop your invoice here"}
              </p>
              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
            </div>
            <div className="flex items-center justify-center space-x-4 text-xs text-gray-400">
              <span>PDF</span>
              <span>•</span>
              <span>JPG</span>
              <span>•</span>
              <span>PNG</span>
              <span>•</span>
              <span>Max {Math.round(maxSize / 1024 / 1024)}MB</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
