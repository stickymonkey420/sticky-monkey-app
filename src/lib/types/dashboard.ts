export type ManualAccount = {
  category: string | null;
  account_name: string | null;
  balance: number | string | null;
};

export type NetWorthBucketName =
  | "Equities"
  | "Personal Vault"
  | "IRA Traditional"
  | "IRA Roth"
  | "Self-Directed IRA"
  | "Crypto"
  | "Cash & Bank";

export type NetWorthCategory = {
  name: NetWorthBucketName;
  value: number;
};

export type NetWorthSummary = {
  categories: NetWorthCategory[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

export type InvestmentAlert = {
  id: string;
  title: string | null;
  description: string | null;
  ticker: string | null;
  action: string | null;
  price: number | string | null;
  message: string | null;
  triggered_at: string | null;
};

export type WheelIncomeAccountType = "brokerage" | "traditional" | "roth";

export type WheelTradeIncomeRow = {
  premium: number | string | null;
  contracts: number | string | null;
  status: string | null;
  account_type: string | null;
};

export type WheelIncomeBucket = {
  total: number;
  realized: number;
};

export type WheelIncomeSummary = Record<WheelIncomeAccountType, WheelIncomeBucket>;

export type ExpenseCategoryTotalRow = {
  category_bucket: string | null;
  total_amount: number | string | null;
};

export type ExpenseCategorySlot = {
  bucket: string;
  total: number;
  pct: number;
  color: string;
} | null;

export type TransactionCategory = {
  key: string;
  label: string;
  color: string;
};

export type PlaidTransactionRow = {
  id: string;
  transaction_date: string | null;
  name: string | null;
  merchant_name: string | null;
  amount: number | string | null;
  pending: boolean | null;
  category_bucket: string | null;
  created_at: string | null;
};
