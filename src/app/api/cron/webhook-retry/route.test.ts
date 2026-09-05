import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), retry: vi.fn(), post: vi.fn(), lock: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCronSecret: mocks.auth }));
vi.mock("@/lib/webhooks", () => ({ retryPendingDeliveries: mocks.retry }));
vi.mock("@/lib/stripe-post-payment", () => ({ retryStripePostPayments: mocks.post }));
vi.mock("@/lib/cron-lock", () => ({ withCronLock: mocks.lock }));
vi.mock("@/lib/cron-tracking", () => ({ wrapCronHandler: (_name: string, fn: unknown) => fn }));
import { POST } from "./route";
const request = () => new Request("https://example.test/api/cron/webhook-retry", { method: "POST" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ ok: true });
  mocks.retry.mockResolvedValue({ retried: 2 });
  mocks.post.mockResolvedValue({ checked: 1, results: [{ paymentId: "pay-1", status: "done" }] });
  mocks.lock.mockImplementation(async (_name: string, fn: () => unknown) => fn());
});
describe("webhook-retry post-payment recovery", () => {
  it("rejects an unauthorized request before either recovery channel", async () => {
    mocks.auth.mockReturnValue({ ok: false, reason: "Unauthorized", status: 401 });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("keeps existing delivery retries and adds bounded post-payment recovery behind the same lock", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, retried: 2, postPayment: { checked: 1, results: [{ paymentId: "pay-1", status: "done" }] } });
    expect(mocks.lock).toHaveBeenCalledWith("webhook-retry", expect.any(Function));
    expect(mocks.post).toHaveBeenCalledWith();
  });
  it("does not process payments when the shared cron lock is occupied", async () => {
    mocks.lock.mockResolvedValue(new Response(JSON.stringify({ skipped: true })));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
});
