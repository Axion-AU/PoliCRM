import { atom, map } from "nanostores";
import { statsApi } from "../api/dashboardApi";

export type DashboardStats = {
  total: number;
  verified: number;
  pending: number;
  failed: number;
  captcha: number;
  duplicate: number;
  partial: number;
  unchecked: number;
};

export const $stats = map<DashboardStats>({
  total: 0,
  verified: 0,
  pending: 0,
  failed: 0,
  captcha: 0,
  duplicate: 0,
  partial: 0,
  unchecked: 0,
});

export const $loadingStats = atom(false);

export async function fetchStats() {
  $loadingStats.set(true);
  try {
    const response = await statsApi.getDashboard();
    $stats.set({
      total: response.total_members || 0,
      verified: response.verified_count || 0,
      pending: (response.unchecked_count || 0) + (response.captcha_count || 0), // Grouping for general display if needed
      failed: response.failed_count || 0,
      captcha: response.captcha_count || 0,
      duplicate: response.duplicate_count || 0,
      partial: response.partial_match_count || 0,
      unchecked: response.unchecked_count || 0,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
  } finally {
    $loadingStats.set(false);
  }
}
