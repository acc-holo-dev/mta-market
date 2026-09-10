// Typed API helpers + error extraction (M-001..M-003).
// Kept out of lib/api.ts to avoid touching existing client code.
import api from "./api";
import type { User } from "@/store/auth";

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
  // PLAN-002 E-006/E-007: additive fields from the server (card + product page).
  seller?: { username?: string | null; displayName?: string | null; avatar?: string | null } | null;
  rating?: number | null;
  reviewCount?: number | null;
  // PLAN-003 A-002/A-003: media (additive; null/[] for resources without media).
  coverUrl?: string | null;
  screenshots?: { id: string; url: string; position: number }[];
  updatedAt?: string;
}

export interface Screenshot {
  id: string;
  url: string;
  position: number;
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

// ---------- Auth / profile (PLAN-001 A-003, B-002, C-003, D-002) ----------
export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Balance {
  available: number; // kopecks
  currency: string;
}

/** GET /auth/me response shape: the profile plus the balance (C-003). */
export type MeUser = User & { createdAt?: string; balance: Balance };

export async function fetchMe(): Promise<MeUser> {
  const { data } = await api.get<MeUser>("/auth/me");
  return data;
}

/** Login with username OR email + password (A-002/A-003). */
export async function loginRequest(login: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", { login, password });
  return data;
}

/** Register; the server returns 201 with a session (A-001). */
export async function registerRequest(body: {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", body);
  return data;
}

/** PATCH /auth/me — only displayName and avatar are editable (B-002). */
export async function patchProfile(body: { displayName?: string; avatar?: string }): Promise<MeUser> {
  const { data } = await api.patch<MeUser>("/auth/me", body);
  return data;
}

export interface Identity {
  id: string;
  provider: string;
  providerAccountId: string;
}

export async function fetchIdentities(): Promise<Identity[]> {
  const { data } = await api.get<Identity[]>("/auth/identities");
  return data;
}

// ---------- File upload (E-003) ----------
export interface UploadResult {
  fileUrl: string;
  fileKey: string | null;
  fileName: string;
  fileSize: number;
  fileChecksum: string;
  mimeType: string;
  storage: "s3" | "local";
}

/**
 * POST /upload/resource — multipart, field name "file".
 * The server computes the checksum and returns everything the versions
 * route needs; nothing is computed client-side.
 */
export async function uploadResourceFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadResult>("/upload/resource", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export interface CreateVersionBody {
  version: string; // "x.y.z"
  changelog?: string;
  fileUrl: string;
  fileSize: number;
  fileChecksum: string;
}

export interface ResourceVersionCreated extends ResourceVersion {
  signed?: boolean;
  artifactHash?: string;
  manifestHash?: string;
}

export interface VersionValidationIssue {
  path?: string;
  message?: string;
}

/** 422 payload returned when sandbox/static validation rejects the artifact. */
export interface VersionValidationError {
  error: string;
  validation?: { passed?: boolean; issues?: VersionValidationIssue[]; summary?: string } & Record<string, unknown>;
}

export async function createResourceVersion(
  slug: string,
  body: CreateVersionBody
): Promise<ResourceVersionCreated> {
  const { data } = await api.post<ResourceVersionCreated>(`/resources/${slug}/versions`, body);
  return data;
}

// ---------- Money formatting (kopecks -> RUB) ----------
export function formatRub(kopecks: number): string {
  return `${(kopecks / 100).toFixed(2)} ₽`;
}

/**
 * PLAN-003 A-002: публичный URL медиа. Сервер отдаёт server-relative
 * /media/... (локальный storage) или абсолютный S3 URL. В dev web и api
 * живут на разных портах — относительный путь резолвится против API base.
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("/media/")) {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return `${base}${url}`;
  }
  return url;
}

// ---------- Buyer ----------
/**
 * PLAN-003 F/G/H/I/T/U: единый query contract GET /resources.
 * q — поиск (title/description/продавец), type — реальный enum, price —
 * free|paid, sort — реализованные стратегии. Без параметров — прежнее
 * поведение (newest), существующие вызовы совместимы (U-003).
 */
export interface ResourceQuery {
  q?: string;
  type?: string;
  price?: "free" | "paid" | "";
  sort?: string;
  page?: number;
  limit?: number;
}

export function fetchResources(query: ResourceQuery | number = 1, limit?: number) {
  // Backward-compatible: fetchResources(page, limit) still works.
  const params: Record<string, string | number> =
    typeof query === "number"
      ? { page: query, limit: limit ?? 12 }
      : {
          ...(query.q ? { q: query.q } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.price ? { price: query.price } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          page: query.page ?? 1,
          limit: query.limit ?? 12,
        };
  return api
    .get<Paginated<Resource>>("/resources", { params })
    .then(({ data }) => data);
}

/** PLAN-003 J-006: агрегированные реальные секции homepage (один запрос). */
export interface HomepageData {
  newest: Resource[];
  popular: Resource[];
  free: Resource[];
}

export async function fetchHomepage(): Promise<HomepageData> {
  const { data } = await api.get<HomepageData>("/resources/homepage");
  return data;
}

export async function fetchResource(slug: string) {
  const { data } = await api.get<Resource>(`/resources/${slug}`);
  return data;
}

export async function fetchResourceVersions(slug: string) {
  const { data } = await api.get<ResourceVersion[] | { data: ResourceVersion[] }>(
    `/resources/${slug}/versions`
  );
  // Server returns a plain array; tolerate a {data} wrapper defensively.
  return Array.isArray(data) ? data : data.data;
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
/**
 * GET /seller/profile — the server wraps the row: { profile: SellerProfile | null }.
 * Returns the unwrapped profile (null when the user has not applied yet).
 */
export async function fetchSellerProfile(): Promise<SellerProfile | null> {
  const { data } = await api.get<{ profile: SellerProfile | null }>("/seller/profile");
  return data.profile ?? null;
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

/**
 * Submit / withdraw a listing. The server contract is PATCH /resources/:slug
 * with { status } (seller transitions: DRAFT <-> PENDING_REVIEW only) —
 * there is no /resources/:slug/status route.
 */
export async function setResourceStatus(slug: string, status: string) {
  const { data } = await api.patch(`/resources/${slug}`, { status });
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

// ---------- Media (PLAN-003 A/B) ----------
/**
 * POST /upload/media — multipart, field "file". Сервер проверяет магические
 * байты и возвращает публичный URL (/media/... или S3). Прогресс через
 * axios onUploadProgress не нужен для файлов до 5 МБ, но состояние
 * uploading/uploaded/failed различается на UI.
 */
export interface MediaUploadResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
  storage: "s3" | "local";
}

export async function uploadMedia(
  file: File,
  onProgress?: (percent: number) => void
): Promise<MediaUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<MediaUploadResult>("/upload/media", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function setResourceCover(slug: string, url: string | null) {
  if (url === null) {
    const { data } = await api.delete<{ coverUrl: string | null }>(`/resources/${slug}/media/cover`);
    return data;
  }
  const { data } = await api.put<{ coverUrl: string }>(`/resources/${slug}/media/cover`, { url });
  return data;
}

export async function addResourceScreenshot(slug: string, url: string): Promise<Screenshot> {
  const { data } = await api.post<Screenshot>(`/resources/${slug}/media/screenshots`, { url });
  return data;
}

export async function removeResourceScreenshot(slug: string, mediaId: string) {
  const { data } = await api.delete(`/resources/${slug}/media/screenshots/${mediaId}`);
  return data;
}

export async function reorderResourceScreenshots(slug: string, ids: string[]) {
  const { data } = await api.put(`/resources/${slug}/media/screenshots/order`, { ids });
  return data;
}

/** B-006: текущее медиа-состояние своего ресурса (в т.ч. черновика). */
export async function fetchResourceMedia(slug: string) {
  const { data } = await api.get<{
    coverUrl: string | null;
    screenshots: Screenshot[];
    editable: boolean;
  }>(`/resources/${slug}/media`);
  return data;
}

// ---------- Seller storefront (PLAN-003 E) ----------
export interface SellerStore {
  seller: {
    username: string;
    displayName: string;
    avatar: string | null;
    supportInfo: string | null;
    memberSince: string;
    resourceCount: number;
  };
  resources: Resource[];
}

export async function fetchSellerStore(username: string): Promise<SellerStore> {
  const { data } = await api.get<SellerStore>(`/sellers/${encodeURIComponent(username)}`);
  return data;
}

// ---------- Admin (PLAN-003 M) ----------
export interface AdminResourceVersion {
  id: string;
  version: string;
  changelog: string | null;
  fileSize: number;
  releaseStatus: string;
  artifactHash: string | null;
  signed: boolean;
  signedAt: string | null;
  validationStatus: string;
}

export interface AdminResourceDetail {
  resource: Resource & { seller: SellerStore["seller"] | null };
  cover: string | null;
  screenshots: Screenshot[];
  versions: AdminResourceVersion[];
}

export async function fetchAdminResourceDetail(id: string): Promise<AdminResourceDetail> {
  const { data } = await api.get<AdminResourceDetail>(`/admin/resources/${id}`);
  return data;
}

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

/**
 * Server contract: PATCH /admin/resources/:id/status
 * (POST is not registered on the backend).
 */
export async function adminSetResourceStatus(id: string, status: string, reason?: string) {
  const { data } = await api.patch(`/admin/resources/${id}/status`, reason ? { status, reason } : { status });
  return data;
}

export async function fetchModerationEvents(id: string) {
  const { data } = await api.get<{ data?: unknown[] } | unknown[]>(`/admin/resources/${id}/moderation-events`);
  return data;
}

/** Seller approval queue lives at GET /seller/list (ADMIN only). */
export async function fetchAdminSellers(status?: string) {
  const { data } = await api.get<{ data: SellerProfile[]; total: number }>("/seller/list", {
    params: status ? { status } : {},
  });
  return data;
}

/** Server contract: POST /seller/:userId/approve | /seller/:userId/reject. */
export async function adminSellerAction(userId: string, action: "approve" | "reject", reason?: string) {
  const { data } = await api.post(`/seller/${userId}/${action}`, action === "reject" ? { reason: reason ?? "Отклонено" } : {});
  return data;
}

/** Admin dispute list lives at GET /disputes/admin/all (ADMIN only). */
export async function fetchAdminDisputes(status?: string) {
  const { data } = await api.get<Paginated<Dispute>>("/disputes/admin/all", {
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
