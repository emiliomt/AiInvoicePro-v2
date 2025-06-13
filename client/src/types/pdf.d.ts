
declare module 'react-pdf' {
  export interface DocumentProps {
    file?: string | { url: string; httpHeaders?: Record<string, string>; withCredentials?: boolean };
    onLoadSuccess?: (pdf: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    loading?: React.ReactNode;
    className?: string;
    options?: {
      cMapUrl?: string;
      cMapPacked?: boolean;
      standardFontDataUrl?: string;
    };
    children?: React.ReactNode;
  }

  export interface PageProps {
    pageNumber: number;
    scale?: number;
    loading?: React.ReactNode;
    renderTextLayer?: boolean;
    renderAnnotationLayer?: boolean;
  }

  export const Document: React.FC<DocumentProps>;
  export const Page: React.FC<PageProps>;
  
  export const pdfjs: {
    version: string;
    GlobalWorkerOptions: {
      workerSrc: string;
    };
  };
}
