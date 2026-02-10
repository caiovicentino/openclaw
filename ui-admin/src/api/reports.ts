import type { DateRange, UsageReport, ComplianceReport, CostReport } from "./types";
import { client } from "./client";

export type UsageGroupBy = "user" | "department";

export async function getUsageReport(
  dateRange?: DateRange,
  groupBy?: UsageGroupBy,
): Promise<UsageReport> {
  const params = new URLSearchParams();
  if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
  if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  if (groupBy) params.set("groupBy", groupBy);
  const qs = params.toString();
  return client.get<UsageReport>(`/reports/usage${qs ? `?${qs}` : ""}`);
}

export async function getComplianceReport(dateRange?: DateRange): Promise<ComplianceReport> {
  const params = new URLSearchParams();
  if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
  if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  const qs = params.toString();
  return client.get<ComplianceReport>(`/reports/compliance${qs ? `?${qs}` : ""}`);
}

export async function getCostReport(dateRange?: DateRange): Promise<CostReport> {
  const params = new URLSearchParams();
  if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
  if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
  const qs = params.toString();
  return client.get<CostReport>(`/reports/cost${qs ? `?${qs}` : ""}`);
}
