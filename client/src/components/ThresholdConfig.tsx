
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Edit, Save, X } from "lucide-react";

export default function ThresholdConfig() {
  const [isEditing, setIsEditing] = useState(false);
  const [thresholdValue, setThresholdValue] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Combined query for both user settings and threshold to reduce API calls
  const { data: configData, isLoading } = useQuery({
    queryKey: ['thresholdConfig'],
    queryFn: async () => {
      try {
        const [userSettingsRes, thresholdRes] = await Promise.all([
          fetch('/api/settings/user_preferences').then(res => 
            res.ok ? res.json() : { key: 'user_preferences', value: JSON.stringify({ defaultCurrency: 'USD' }) }
          ),
          fetch('/api/settings/petty_cash_threshold').then(async res => {
            if (res.ok) {
              return res.json();
            } else {
              // If threshold doesn't exist, create it with default value
              const createResponse = await fetch('/api/settings/petty_cash_threshold', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: "100" }),
              });
              return createResponse.ok ? createResponse.json() : { key: 'petty_cash_threshold', value: "100" };
            }
          })
        ]);

        const userSettings = JSON.parse(userSettingsRes.value || '{"defaultCurrency": "USD"}');
        
        return {
          userSettings,
          threshold: thresholdRes
        };
      } catch (error) {
        console.error('Error loading threshold config:', error);
        return {
          userSettings: { defaultCurrency: 'USD' },
          threshold: { key: 'petty_cash_threshold', value: "100" }
        };
      }
    },
    staleTime: 30 * 1000, // 30 seconds for more frequent updates
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Refetch when user returns to page
  });

  // Update threshold value when data is loaded
  useEffect(() => {
    if (configData?.threshold?.value) {
      setThresholdValue(configData.threshold.value);
    }
  }, [configData?.threshold?.value]);

  // Update threshold mutation
  const updateThreshold = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch('/api/settings/petty_cash_threshold', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `Failed to update threshold (${response.status})`);
      }
      
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Petty cash threshold updated successfully",
      });
      setIsEditing(false);
      
      // Update the local threshold value
      setThresholdValue(data.value);
      
      // Optimistically update cache with the correct structure
      queryClient.setQueryData(['thresholdConfig'], (oldData: any) => ({
        ...oldData,
        threshold: data
      }));
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['thresholdConfig'] });
      queryClient.invalidateQueries({ queryKey: ['/api/petty-cash'] });
    },
    onError: (error: Error) => {
      console.error('Threshold update error:', error);
      // Reset to original value on error
      setThresholdValue(configData?.threshold?.value || "100");
      toast({
        title: "Error", 
        description: `Failed to update threshold: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!thresholdValue || isNaN(Number(thresholdValue))) {
      toast({
        title: "Error",
        description: "Please enter a valid threshold amount",
        variant: "destructive",
      });
      return;
    }
    updateThreshold.mutate(thresholdValue);
  };

  const handleCancel = () => {
    setThresholdValue(configData?.threshold?.value || "");
    setIsEditing(false);
  };

  const defaultCurrency = configData?.userSettings?.defaultCurrency || 'USD';
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'MXN': return '$';
      case 'COP': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const currentThreshold = configData?.threshold;

  if (isLoading) {
    return (
      <div className="flex items-center justify-between animate-pulse">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 bg-gray-200 rounded"></div>
          <div>
            <div className="w-48 h-4 bg-gray-200 rounded mb-2"></div>
            <div className="w-64 h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-24 h-6 bg-gray-200 rounded"></div>
          <div className="w-16 h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Settings className="text-gray-500" size={20} />
        <div>
          <div className="font-medium">Petty Cash Threshold ({defaultCurrency})</div>
          <div className="text-sm text-gray-600">
            Invoices below this amount will be classified as petty cash
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {isEditing ? (
          <>
            <Input
              type="number"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              placeholder="Enter threshold amount"
              className="w-32"
            />
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={updateThreshold.isPending}
            >
              <Save size={16} />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleCancel}
            >
              <X size={16} />
            </Button>
          </>
        ) : (
          <>
            <span className="text-lg font-semibold">
              {getCurrencySymbol(defaultCurrency)}{Number(currentThreshold?.value || 0).toLocaleString()} {defaultCurrency}
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setIsEditing(true)}
            >
              <Edit size={16} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
