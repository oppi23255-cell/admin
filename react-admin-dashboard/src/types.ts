export type Language = 'ar' | 'en';

export type DepositStatus = 'pending' | 'completed' | 'disputed' | 'cancelled' | 'expired';
export type WithdrawalStatus =
  | 'available'
  | 'accepted'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type NotificationPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export interface PlatformConfig {
  platformName: string;
  countryCode: 'EG' | 'SA' | 'AE' | 'KG';
  currencyCode: 'EGP' | 'SAR' | 'AED' | 'KGS';
  usdRate: number;
  adminPassword: string;
}

export interface ManagedUser {
  id: string;
  playerId: string;
  uuid: string;
  username: string;
  displayName: string;
  email: string;
  emailLower?: string;
  password: string;
  telegramHandle: string;
  balanceEgp: number;
  frozenEgp: number;
  insuranceEgp: number | null;
  canTrade: boolean;
  active: boolean;
  depositFeePct: number;
  withdrawalFeePct: number;
  referralCode: string;
  referralRatePct: number;
  twoFactorEnabled: boolean;
  trc20Address: string;
  createdAt: string;
  lastSeenAt?: string;
}

export interface OnlinePresenceEntry {
  visitorId: string;
  userId?: string | null;
  playerId?: string | null;
  userName?: string | null;
  email?: string | null;
  route: string;
  lastPingAt: string;
  lastPingMs?: number;
}

export interface DepositOrder {
  id: string;
  userId?: string;
  orderId: string;
  accountId: string;
  amountLocal: number;
  amountUsdt: number;
  incomeUsdt: number;
  rate: number;
  requisiteId: string;
  bankName: string;
  ownerName: string;
  requisiteNumber: string;
  status: DepositStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  customerNote?: string;
}

export interface WithdrawalOrder {
  id: string;
  userId?: string;
  orderId: string;
  accountId: string;
  amountLocal: number;
  amountUsdt: number;
  incomeUsdt: number;
  rate: number;
  destinationMethod: string;
  requisiteNumber: string;
  recipientName: string;
  status: WithdrawalStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  completedAt?: string;
  adminCreated?: boolean;
  receiptFiles: Array<{ name: string; size: string; uploadedAt: string }>;
}

export interface SmsMessage {
  id: string;
  userId?: string;
  deviceId: string;
  deviceName: string;
  sender: string;
  body: string;
  parsedAmount: number | null;
  currency: string;
  matchedDepositId: string | null;
  matchedOrderId: string | null;
  withdrawalId?: string | null;
  withdrawalAmountEgp?: number;
  withdrawalDestination?: string;
  withdrawalRecipient?: string;
  withdrawalActionStatus?: 'pending_confirmation' | 'confirmed' | 'rejected';
  status: 'matched' | 'unmatched' | 'ignored';
  receivedAt: string;
}

export interface AppSettings {
  lang: Language;
  tzOffset: number;
  dateFormat: 'DD.MM.YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  clockFormat: '24h' | '12h';
  notificationPosition: NotificationPosition;
}

export interface PlatformState {
  config: PlatformConfig;
  users?: ManagedUser[];
  onlinePresence?: OnlinePresenceEntry[];
  onlineCount?: number;
  deposits: DepositOrder[];
  withdrawals: WithdrawalOrder[];
  messages: SmsMessage[];
  settings: AppSettings;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning';
  title: string;
  message?: string;
}
