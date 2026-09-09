// Typed API helpers + error extraction (M-001..M-003).
// Kept out of lib/api.ts to avoid touching existing client code.
import api from "./api";

// ---------- Error helpers ----------
// Server error envelopes: either {"error": string} or {"error": {code, message}}.
export function getErrorMessage(err: unknown, fallback = "Что-то пошло не так"): string {
  const e = err as { response?: { data?: unknown; status?: number }; message?: string };
  const data = e?.response?.data;
  if (data && typeof data === "object" && "error" in data) {
    const raw = (data as { error: unknown }).error;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") {
      const m = (raw as { message?: unknown }).message;
      if (typeof m === "string" && m) return m;
      const c = (raw as { code?: unknown }).code;
      if (typeof c === "string" && c) return c;
    }
  }
  if (e?.message) return e.message;
  return fallback;
}

// ---------- Shared types ----------
export interface Resource {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  status: string;
  price: number; // kopecks; 0 = FREE
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface ResourceVersion {
  id: string;
  version: string;
  changelog?: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user?: { username?: string; displayName?: string | null } | null;
}

export interface Purchase {
  id: string;
  status: string;
  priceSnapshot: number;
  createdAt: string;
  resource: { slug: string; title: string; type: string };
  version?: { version: string } | null;
  license?: { id: string; status: string } | null;
}

export interface Service {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  price: number;
  deliveryDays: number;
  requirements?: string | null;
}

export interface ServiceOrder {
  id: string;
  status: string;
  finalPrice: number;
  createdAt: string;
  buyerNotes?: string | null;
  service: { slug: string; title: string };
}

export interface Dispute {
  id: string;
  targetType: string;
  status: string;
  reason: string;
  resolution?: string | null;
  createdAt: string;
}

export interface SellerProfile {
  id: string;
  userId: string;
  status: string;
  displayName?: string | null;
  supportInfo?: string | null;
}

// ---------- Money formatting (kopecks -> RUB) ----------
export function formatRub(kopecks: number): string {
  return `${(kopecks / 100).toFixed(2)} ₽`;
}

// ---------- Buyer ----------
export async function fetchResources(page = 1, limit = 12) {
  const { data } = await api.get<Paginated<Resource>>("/resources", {
    params: { page, limit },
  });
  return data;
}

export async function fetchResource(slug: string) {
  const { data } = await api.get<Resource>(`/resources/${slug}`);
  return data;
}

export async function fetchResourceVersions(slug: string) {
  const { data } = await api.get<{ data: ResourceVersion[] }>(`/resources/${slug}/versions`);
  return data.data;
}

export async function fetchResourceReviews(slug: string, page = 1, limit = 10) {
  const { data } = await api.get<{
    data: Review[];
    stats: { total: number; averageRating: number | null };
    pagination: Pagination;
  }>(`/resources/${slug}/reviews`, { params: { page, limit } });
  return data;
}

export async function postReview(slug: string, rating: number, comment: string) {
  const { data } = await api.post<Review>(`/resources/${slug}/reviews`, { rating, comment });
  return data;
}

export async function patchReview(slug: string, rating: number, comment: string) {
  const { data } = await api.patch<Review>(`/resources/${slug}/reviews`, { rating, comment });
  return data;
}

export async function createPurchase(resourceSlug: string, discountCode?: string) {
  const { data } = await api.post<
    | {
        status: "completed";
        purchaseId: string;
        licenseId: string;
        orderId: string;
      }
    | {
        status: "pending";
        purchaseId: string;
        amount: number;
        originalAmount: number;
        discount?: { amount: number; percentage: number };
      }
  >("/purchases", discountCode ? { resourceSlug, discountCode } : { resourceSlug });
  return data;
}

export async function createPayment(purchaseId: string) {
  const { data } = await api.post<{ paymentUrl?: string; paymentId?: string; message?: string }>(
    "/payments/create",
    { purchaseId }
  );
  return data;
}

export async function fetchMyPurchases() {
  const { data } = await api.get<Purchase[]>("/purchases/my");
  return data;
}

// ---------- Seller ----------
export async function fetchSellerProfile() {
  const { data } = await api.get<SellerProfile>("/seller/profile");
  return data;
}

export async function applySeller(body: { displayName?: string; supportInfo?: string }) {
  const { data } = await api.post<SellerProfile>("/seller/apply", body);
  return data;
}

export async function createResource(body: {
  title: string;
  description: string;
  type: string;
  price: number;
  slug?: string;
}) {
  const { data } = await api.post<Resource>("/resources", body);
  return data;
}

export async function setResourceStatus(slug: string, status: string) {
  const { data } = await api.patch(`/resources/${slug}/status`, { status });
  return data;
}

export async function fetchServices() {
  const { data } = await api.get<{ data: Service[] }>("/services");
  return data.data;
}

export async function fetchService(slug: string) {
  const { data } = await api.get<Service>(`/services/${slug}`);
  return data;
}

export async function fetchMyServices() {
  const { data } = await api.get<{ data: Service[] } | Service[]>("/services/my");
  return Array.isArray(data) ? data : data.data;
}

export async function createService(body: {
  title: string;
  description: string;
  type: string;
  price: number;
  deliveryDays: number;
  requirements?: string;
}) {
  const { data } = await api.post<Service>("/services", body);
  return data;
}

export async function orderService(slug: string, buyerNotes?: string) {
  const { data } = await api.post<{ servicePurchaseId: string; status: string; finalPrice: number }>(
    `/services/${slug}/order`,
    buyerNotes ? { buyerNotes } : {}
  );
  return data;
}

export async function fetchMyServiceOrders() {
  const { data } = await api.get<Paginated<ServiceOrder>>("/services/orders/my");
  return data;
}

export async function serviceOrderAction(id: string, action: string, body?: Record<string, unknown>) {
  const { data } = await api.post(`/services/orders/${id}/${action}`, body ?? {});
  return data;
}

export async function postServiceOrderMessage(id: string, body: string) {
  const { data } = await api.post(`/services/orders/${id}/messages`, { body });
  return data;
}

// ---------- Disputes ----------
export async function createDispute(body: {
  targetType: "PURCHASE" | "SERVICE_PURCHASE";
  purchaseId?: string;
  servicePurchaseId?: string;
  reason: string;
}) {
  const { data } = await api.post<Dispute>("/disputes", body);
  return data;
}

export async function fetchMyDisputes() {
  const { data } = await api.get<Paginated<Dispute>>("/disputes/my");
  return data;
}

export async function fetchDispute(id: string) {
  const { data } = await api.get<{
    dispute: Dispute;
    messages: { id: string; body: string; createdAt: string; authorId?: string }[];
  }>(`/disputes/${id}`);
  return data;
}

export async function postDisputeMessage(id: string, body: string) {
  const { data } = await api.post(`/disputes/${id}/messages`, { body });
  return data;
}

// ---------- Admin ----------
export async function fetchAdminStats() {
  const { data } = await api.get<{
    users: { total: number; active: number; banned: number };
    resources: { total: number; published: number; draft: number; pendingReview: number; suspended: number };
    purchases: Record<string, number>;
    reviews: { total: number; averageRating: number | null };
  }>("/admin/stats");
  return data;
}

export async function fetchAdminResources(status?: string, page = 1) {
  const { data } = await api.get<Paginated<Resource>>("/admin/resources", {
    params: { ...(status ? { status } : {}), page },
  });
  return data;
}

export async function adminSetResourceStatus(id: string, status: string, reason?: string) {
  const { data } = await api.post(`/admin/resources/${id}/status`, reason ? { status, reason } : { status });
  return data;
}

export async function fetchModerationEvents(id: string) {
  const { data } = await api.get<{ data?: unknown[] } | unknown[]>(`/admin/resources/${id}/moderation-events`);
  return data;
}

export async function fetchAdminSellers(status?: string) {
  const { data } = await api.get<{ data?: unknown[] } | unknown[]>("/admin/sellers", {
    params: status ? { status } : {},
  });
  return data;
}

export async function adminSellerAction(userId: string, action: "approve" | "reject", reason?: string) {
  const { data } = await api.post(`/admin/sellers/${userId}/${action}`, reason ? { reason } : {});
  return data;
}

export async function fetchAdminDisputes(status?: string) {
  const { data } = await api.get<Paginated<Dispute>>("/admin/disputes", {
    params: status ? { status } : {},
  });
  return data;
}

export async function adminTransitionDispute(id: string, status: string, resolution?: string) {
  const { data } = await api.post(`/admin/disputes/${id}/transition`, resolution ? { status, resolution } : { status });
  return data;
}

export async function adminYankVersion(id: string, reason: string) {
  const { data } = await api.post(`/admin/versions/${id}/yank`, { reason });
  return data;
}

export async function adminVersionCompatibility(id: string) {
  const { data } = await api.get(`/admin/versions/${id}/compatibility`);
  return data;
}
