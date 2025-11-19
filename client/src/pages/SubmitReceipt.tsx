import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Camera, Upload, DollarSign, Calendar, Building2, ChevronLeft } from "lucide-react";

const receiptSchema = z.object({
  vendor: z.string().min(1, "Vendor is required"),
  date: z.string().min(1, "Date is required"),
  total: z.string().min(1, "Total is required").refine((val) => !isNaN(parseFloat(val)), "Must be a valid number"),
  currency: z.string().default("USD"),
  jobCode: z.string().optional(),
  costCode: z.string().optional(),
  memo: z.string().optional(),
});

type ReceiptFormData = z.infer<typeof receiptSchema>;

export default function SubmitReceipt() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      vendor: "",
      date: new Date().toISOString().split('T')[0],
      total: "",
      currency: "USD",
      jobCode: "",
      costCode: "",
      memo: "",
    },
  });

  const submitReceiptMutation = useMutation({
    mutationFn: async (data: ReceiptFormData & { receiptImage?: File }) => {
      const formData = new FormData();
      formData.append("vendor", data.vendor);
      formData.append("date", data.date);
      formData.append("total", data.total);
      formData.append("currency", data.currency);
      if (data.jobCode) formData.append("jobCode", data.jobCode);
      if (data.costCode) formData.append("costCode", data.costCode);
      if (data.memo) formData.append("memo", data.memo);
      if (data.receiptImage) formData.append("receiptImage", data.receiptImage);

      return await fetch('/api/receipts', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to submit receipt');
        }
        return res.json();
      });
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Receipt submitted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      navigate("/receipts");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit receipt",
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: ReceiptFormData) => {
    submitReceiptMutation.mutate({
      ...data,
      receiptImage: imageFile || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="max-w-2xl mx-auto p-4 pb-20">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Submit Receipt</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Field teams submit and tag expenses to the right job and cost code at the point of purchase via SMS, mobile app, or email.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Receipt Photo</CardTitle>
            <CardDescription>
              Capture or upload your receipt image
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                    data-testid="img-receipt-preview"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    data-testid="button-remove-image"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="flex space-x-4">
                      <label
                        htmlFor="camera-input"
                        className="cursor-pointer flex flex-col items-center space-y-2"
                      >
                        <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full">
                          <Camera className="h-8 w-8 text-blue-600 dark:text-blue-300" />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Take Photo</span>
                        <input
                          id="camera-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleImageChange}
                          className="hidden"
                          data-testid="input-camera"
                        />
                      </label>

                      <label
                        htmlFor="file-input"
                        className="cursor-pointer flex flex-col items-center space-y-2"
                      >
                        <div className="p-4 bg-green-100 dark:bg-green-900 rounded-full">
                          <Upload className="h-8 w-8 text-green-600 dark:text-green-300" />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Upload File</span>
                        <input
                          id="file-input"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          data-testid="input-file-upload"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Supports JPG, PNG formats
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receipt Details</CardTitle>
            <CardDescription>
              Enter the transaction information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center space-x-2">
                        <Building2 className="h-4 w-4 text-blue-500" />
                        <span>Vendor</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Specialty Paint Shop"
                          {...field}
                          data-testid="input-vendor"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        <span>Date</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-blue-500" />
                        <span>Total</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="86.67"
                          {...field}
                          data-testid="input-total"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jobCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Code (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., JOB-123"
                            {...field}
                            data-testid="input-job-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="costCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost Code (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., COST-456"
                            {...field}
                            data-testid="input-cost-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="memo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Memo (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes about this expense..."
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="input-memo"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitReceiptMutation.isPending}
                  data-testid="button-submit-receipt"
                >
                  {submitReceiptMutation.isPending ? "Submitting..." : "Submit Receipt"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
