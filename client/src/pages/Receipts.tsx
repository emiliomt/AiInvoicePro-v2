import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Receipt as ReceiptIcon, Calendar, DollarSign, Building2, FileText } from "lucide-react";
import { format } from "date-fns";

interface Receipt {
  id: number;
  vendor: string;
  date: string;
  total: string;
  currency: string;
  jobCode: string | null;
  costCode: string | null;
  memo: string | null;
  receiptImageUrl: string | null;
  status: string;
  createdAt: string;
}

export default function Receipts() {
  const [, navigate] = useLocation();

  const { data: receipts, isLoading } = useQuery<Receipt[]>({
    queryKey: ["/api/receipts"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "submitted":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Receipts</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage your submitted expense receipts
            </p>
          </div>
          <Button
            onClick={() => navigate("/submit-receipt")}
            size="lg"
            data-testid="button-submit-receipt"
          >
            <Plus className="h-5 w-5 mr-2" />
            Submit Receipt
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : receipts && receipts.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {receipts.map((receipt) => (
              <Card
                key={receipt.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/receipts/${receipt.id}`)}
                data-testid={`card-receipt-${receipt.id}`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-lg flex items-center">
                      <Building2 className="h-5 w-5 mr-2 text-blue-500" />
                      {receipt.vendor}
                    </CardTitle>
                    <Badge className={getStatusColor(receipt.status)} data-testid={`badge-status-${receipt.id}`}>
                      {receipt.status}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center text-sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(new Date(receipt.date), "MMM dd, yyyy")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {receipt.receiptImageUrl && (
                    <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img
                        src={receipt.receiptImageUrl}
                        alt="Receipt"
                        className="w-full h-48 object-cover"
                        data-testid={`img-receipt-${receipt.id}`}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                        <DollarSign className="h-4 w-4 mr-1" />
                        Total
                      </span>
                      <span className="font-bold text-lg" data-testid={`text-total-${receipt.id}`}>
                        {receipt.currency} {parseFloat(receipt.total).toFixed(2)}
                      </span>
                    </div>

                    {receipt.jobCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Job Code</span>
                        <span className="text-sm font-medium" data-testid={`text-job-code-${receipt.id}`}>
                          {receipt.jobCode}
                        </span>
                      </div>
                    )}

                    {receipt.costCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Cost Code</span>
                        <span className="text-sm font-medium" data-testid={`text-cost-code-${receipt.id}`}>
                          {receipt.costCode}
                        </span>
                      </div>
                    )}

                    {receipt.memo && (
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-start">
                          <FileText className="h-4 w-4 mr-2 mt-0.5 text-gray-400" />
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {receipt.memo}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
                <ReceiptIcon className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
                No receipts yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
                Start submitting your expense receipts to track and manage your spending
              </p>
              <Button onClick={() => navigate("/submit-receipt")} data-testid="button-submit-first-receipt">
                <Plus className="h-5 w-5 mr-2" />
                Submit Your First Receipt
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
