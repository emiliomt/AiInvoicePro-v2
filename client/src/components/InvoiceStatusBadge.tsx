import React from 'react';
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Eye, 
  AlertTriangle,
  CreditCard,
  Link,
  ShieldCheck
} from "lucide-react";

interface InvoiceStatusBadgeProps {
  status: string;
  extractedData?: {
    isPettyCash?: boolean;
    isPoMatched?: boolean;
    isValidated?: boolean;
    [key: string]: any;
  };
  size?: 'sm' | 'md';
}

export default function InvoiceStatusBadge({ 
  status, 
  extractedData, 
  size = 'sm' 
}: InvoiceStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return {
          label: 'Pending',
          variant: 'secondary' as const,
          icon: Clock,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        };
      case 'processing':
        return {
          label: 'Processing',
          variant: 'secondary' as const,
          icon: Loader2,
          className: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case 'extracted':
        return {
          label: 'Extracted',
          variant: 'outline' as const,
          icon: Eye,
          className: 'bg-green-100 text-green-800 border-green-200'
        };
      case 'approved':
        return {
          label: 'Approved',
          variant: 'default' as const,
          icon: CheckCircle,
          className: 'bg-green-600 text-white border-green-600'
        };
      case 'rejected':
        return {
          label: 'Rejected',
          variant: 'destructive' as const,
          icon: XCircle,
          className: 'bg-red-100 text-red-800 border-red-200'
        };
      case 'failed':
        return {
          label: 'Failed',
          variant: 'destructive' as const,
          icon: AlertTriangle,
          className: 'bg-red-100 text-red-800 border-red-200'
        };
      default:
        return {
          label: status,
          variant: 'outline' as const,
          icon: Clock,
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className="flex flex-wrap gap-1">
      {/* Main status badge */}
      <Badge 
        variant={config.variant} 
        className={`${config.className} flex items-center gap-1`}
      >
        <IconComponent className={`${iconSize} ${config.icon === Loader2 ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>

      {/* Additional status badges based on extracted data */}
      {extractedData?.isPettyCash && (
        <Badge 
          variant="outline" 
          className="bg-purple-100 text-purple-800 border-purple-200 flex items-center gap-1"
        >
          <CreditCard className={iconSize} />
          Petty Cash
        </Badge>
      )}

      {extractedData?.isPoMatched && (
        <Badge 
          variant="outline" 
          className="bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1"
        >
          <Link className={iconSize} />
          PO Matched
        </Badge>
      )}

      {extractedData?.isValidated && (
        <Badge 
          variant="outline" 
          className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1"
        >
          <ShieldCheck className={iconSize} />
          Validated
        </Badge>
      )}
    </div>
  );
}