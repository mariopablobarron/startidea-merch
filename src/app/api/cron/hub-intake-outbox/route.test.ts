import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCronSecret = vi.fn();
const flushHubIntakeOutbox = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...args: unknown[]) => requireCronSecret(...args),
}));
vi.mock("@/lib/hub-intake-outbox", () => ({
  flushHubIntakeOutbox: (...args: unknown[]) => flushHubIntakeOutbox(...args),
}));
vi.mock("@/lib/cron-tracking", () => ({
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));

import { POST } from "./route";

beforeEach(() => {
  requireCronSecret.mockReset();
  flushHubIntakeOutbox.mockReset();
});

describe("POST /api/cron/hub-intake-outbox", () => {
  it("rechaza un cron sin autorización", async () => {
    requireCronSecret.mockReturnValue({ ok: false, status: 401, reason: "missing secret" });
    const response = await POST(new Request("https://example.test/api/cron/hub-intake-outbox"));
    expect(response.status).toBe(401);
    expect(flushHubIntakeOutbox).not.toHaveBeenCalled();
  });

  it("procesa el lote con autorización válida", async () => {
    requireCronSecret.mockReturnValue({ ok: true });
    flushHubIntakeOutbox.mockResolvedValue({ processed: 3, delivered: 2, failed: 1 });
    const response = await POST(new Request("https://example.test/api/cron/hub-intake-outbox"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, processed: 3, delivered: 2, failed: 1 });
  });
});
