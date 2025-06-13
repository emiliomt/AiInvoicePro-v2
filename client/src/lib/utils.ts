import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))


// Number formatting utilities
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString();
}

export function formatCurrency(value: number | string | null | undefined, currency: string = "$"): string {
  if (value === null || value === undefined) return `${currency}0`;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return `${currency}0`;
  return `${currency}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercentage(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0%";
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return "0%";
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

}
