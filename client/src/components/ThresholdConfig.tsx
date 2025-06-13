
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

export default function ThresholdConfig() {
  const [isEditing, setIsEditing] = useState(false);
  const [thresholdValue, setThresholdValue] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current threshold setting
  const { data: thresholdSetting, isLoading } = useQuery({
    queryKey: ["/api/settings/petty_cash_threshold"],
    select: (data: any) => data?.value || "1000",
  });

  // Update threshold mutation
  const updateThresholdMutation = useMutation({
    mutationFn: async (newThreshold: string) => {
      const response = await fetch("/api/settings/petty_cash_threshold", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: newThreshold }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update petty cash threshold");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/petty_cash_threshold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      setIsEditing(false);
      setThresholdValue("");
      toast({
        title: "Success",
        description: "Petty cash threshold updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    setIsEditing(true);
    setThresholdValue(thresholdSetting || "1000");
  };

  const handleSave = () => {
    const numericValue = parseFloat(thresholdValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    
    updateThresholdMutation.mutate(thresholdValue);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setThresholdValue("");
  };

  if (isLoading) {
    return <div>Loading threshold configuration...</div>;
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Settings className="text-gray-600" size={20} />
        <div>
          <Label className="text-sm font-medium text-gray-700">
            Petty Cash Threshold (MXN)
          </Label>
          <p className="text-xs text-gray-500">
            Invoices below this amount will be classified as petty cash
          </p>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        {isEditing ? (
          <>
            <Input
              type="number"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              placeholder="Enter threshold amount"
              className="w-32"
              min="0"
              step="0.01"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateThresholdMutation.isPending}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={updateThresholdMutation.isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="text-lg font-semibold text-gray-900">
              ${thresholdSetting} MXN
            </span>
            <Button size="sm" variant="outline" onClick={handleEdit}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
