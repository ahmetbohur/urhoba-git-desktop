import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Koşullu sınıfları birleştirir ve çakışan Tailwind sınıflarını sadeleştirir. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
