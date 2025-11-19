import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Calendar, DollarSign, Building2, FileText, Trash2, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  submissionMethod: string;
  createdAt: string;
  updatedAt: string;
}

export default function ReceiptDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/receipts/:id");
  const { toast } = useToast();
  const receiptId = params?.id ? parseInt(params.id) : null;

  const { data: receipt, isLoading } = useQuery<Receipt>({
    queryKey: ["/api/receipts", receiptId],
    queryFn: async () => {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch receipt');
      return res.json();
    },
    enabled: !!receiptId,
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/receipts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete receipt');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Receipt deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      navigate("/receipts");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete receipt",
      });
    },
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Receipt not found</h2>
          <Button onClick={() => navigate("/receipts")} data-testid="button-back-to-receipts">
            Back to Receipts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/receipts")}
          className="mb-6"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Receipts
        </Button>

        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Receipt Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Submitted {format(new Date(receipt.createdAt), "MMM dd, yyyy 'at' h:mm a")}
              </p>
            </div>
            <Badge className={getStatusColor(receipt.status)} data-testid="badge-status">
              {receipt.status}
            </Badge>
          </div>

          {receipt.receiptImageUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Receipt Image</CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={receipt.receiptImageUrl}
                  alt="Receipt"
                  className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                  data-testid="img-receipt"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <Building2 className="h-4 w-4 mr-2" />
                    Vendor
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid="text-vendor">
                    {receipt.vendor}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <Calendar className="h-4 w-4 mr-2" />
                    Date
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid="text-date">
                    {format(new Date(receipt.date), "MMMM dd, yyyy")}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Total Amount
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-total">
                    {receipt.currency} {parseFloat(receipt.total).toFixed(2)}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Submission Method
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize" data-testid="text-submission-method">
                    {receipt.submissionMethod}
                  </p>
                </div>
              </div>

              {(receipt.jobCode || receipt.costCode) && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {receipt.jobCode && (
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Job Code
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid="text-job-code">
                          {receipt.jobCode}
                        </p>
                      </div>
                    )}

                    {receipt.costCode && (
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Cost Code
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100" data-testid="text-cost-code">
                          {receipt.costCode}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {receipt.memo && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-start mb-2">
                    <FileText className="h-4 w-4 mr-2 mt-0.5 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Memo</span>
                  </div>
                  <p className="text-gray-900 dark:text-gray-100" data-testid="text-memo">
                    {receipt.memo}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Manage this receipt</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" data-testid="button-delete">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Receipt
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the receipt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteReceiptMutation.mutate(receipt.id)}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="button-confirm-delete"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
