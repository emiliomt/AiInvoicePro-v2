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

  // Fetch user settings to get default currency
  const { data: userSettings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const response = await fetch('/api/settings/user_preferences');
      if (!response.ok) {
        return { defaultCurrency: 'USD' }; // Default fallback
      }
      const data = await response.json();
      return JSON.parse(data.value || '{"defaultCurrency": "USD"}');
    },
  });

  // Fetch current threshold
  const { data: currentThreshold, isLoading } = useQuery({
    queryKey: ['/api/settings/petty_cash_threshold'],
    queryFn: async () => {
      const response = await fetch('/api/settings/petty_cash_threshold');
      if (!response.ok) {
        throw new Error('Failed to fetch threshold');
      }
      return response.json();
    },
  });

  // Update threshold value when data is loaded
  useEffect(() => {
    if (currentThreshold?.value) {
      setThresholdValue(currentThreshold.value);
    }
  }, [currentThreshold]);

  // Update threshold mutation
  const updateThreshold = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch('/api/settings/petty_cash_threshold', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) {
        throw new Error('Failed to update threshold');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Petty cash threshold updated successfully",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/petty_cash_threshold'] });
      queryClient.invalidateQueries({ queryKey: ['/api/petty-cash'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
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
    setThresholdValue(currentThreshold?.value || "");
    setIsEditing(false);
  };

  const defaultCurrency = userSettings?.defaultCurrency || 'USD';
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

  if (isLoading) {
    return <div>Loading threshold configuration...</div>;
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