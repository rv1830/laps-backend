// ============================================================================
// src/utils/helpers.ts
// ============================================================================
import { add, format, parseISO } from 'date-fns';

export const calculateDueDate = (createdAt: Date, daysUntilDue: number): Date => {
  return add(createdAt, { days: daysUntilDue });
};

export const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const generateUnsubscribeToken = (workspaceId: string, email: string): string => {
  const crypto = require('crypto');
  const data = `${workspaceId}:${email}:${process.env.JWT_SECRET}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

export const verifyUnsubscribeToken = (
  token: string,
  workspaceId: string,
  email: string
): boolean => {
  const expected = generateUnsubscribeToken(workspaceId, email);
  return token === expected;
};