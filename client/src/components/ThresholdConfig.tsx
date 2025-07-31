
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Edit, Save, X } from "lucide-react";

// Currency options for the selector
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { value: 'COP', label: 'Colombian Peso (COP)', symbol: '$' },
  { value: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { value: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { value: 'MXN', label: 'Mexican Peso (MXN)', symbol: '$' },
];

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

  // Update threshold value when data is loaded or currency changes
  useEffect(() => {
    if (configData?.threshold?.value) {
      setThresholdValue(configData.threshold.value);
    }
  }, [configData?.threshold?.value, configData?.userSettings?.defaultCurrency]);

  // Update currency mutation
  const updateCurrency = useMutation({
    mutationFn: async (newCurrency: string) => {
      const currentSettings = configData?.userSettings || { defaultCurrency: 'USD' };
      const updatedSettings = { ...currentSettings, defaultCurrency: newCurrency };
      
      const response = await fetch('/api/settings/user_preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(updatedSettings) }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update currency');
      }
      
      return { newCurrency, updatedSettings };
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Currency updated to ${data.newCurrency}`,
      });
      
      // CRITICAL: Properly invalidate and refetch all related queries
      queryClient.setQueryData(['thresholdConfig'], (oldData: any) => ({
        ...oldData,
        userSettings: data.updatedSettings
      }));
      
      // Force immediate refetch of both threshold and currency data
      queryClient.invalidateQueries({ queryKey: ['thresholdConfig'] });
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
      queryClient.refetchQueries({ queryKey: ['thresholdConfig'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update currency: ${error.message}`,
        variant: "destructive",
      });
    },
  });

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
      setThresholdValue(data.value);
      
      // CRITICAL: Force immediate UI update
      queryClient.setQueryData(['thresholdConfig'], (oldData: any) => ({
        ...oldData,
        threshold: data
      }));
      
      // Invalidate related queries to refresh stats
      queryClient.invalidateQueries({ queryKey: ['thresholdConfig'] });
      queryClient.invalidateQueries({ queryKey: ['/api/petty-cash'] });
      queryClient.refetchQueries({ queryKey: ['thresholdConfig'] });
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
    <div className="space-y-4">
      {/* Currency Selection */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center space-x-2">
          <Settings className="text-gray-500" size={20} />
          <div>
            <div className="font-medium">Default Currency</div>
            <div className="text-sm text-gray-600">
              Currency used for petty cash calculations and display
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Select 
            value={defaultCurrency} 
            onValueChange={(value) => updateCurrency.mutate(value)}
            disabled={updateCurrency.isPending}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono">{currency.symbol}</span>
                    <span>{currency.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updateCurrency.isPending && (
            <div className="text-xs text-gray-500">Updating...</div>
          )}
        </div>
      </div>

      {/* Existing Threshold Configuration */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
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
              <div className="flex items-center space-x-1">
                <span className="text-lg font-semibold">{getCurrencySymbol(defaultCurrency)}</span>
                <Input
                  type="number"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  placeholder="Enter threshold amount"
                  className="w-32"
                />
                <span className="text-sm text-gray-600 font-medium">{defaultCurrency}</span>
              </div>
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
    </div>
  );
}
