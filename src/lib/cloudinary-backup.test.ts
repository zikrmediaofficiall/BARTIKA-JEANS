import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBackup } from "./cloudinary-backup";

const env = { cloudName: "demo", apiKey: "k", apiSecret: "s", folderMode: "dynamic" as const };

function fake(opts: { unsigned: number; type?: string; existing?: number }) {
  const calls: { url: string; method: string }[] = [];
  const existing = Array.from({ length: opts.existing ?? 0 }, (_, i) => ({
    public_id: `bartika-jeans/backups/bartika-backup-${String(i).padStart(3, "0")}.json.gz`,
    created_at: `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00Z`,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method || "GET";
      calls.push({ url, method });
      if (url.endsWith("/raw/upload"))
        return new Response(
          JSON.stringify({
            public_id: "bartika-jeans/backups/bartika-backup-new.json.gz",
            secure_url: "https://res.cloudinary.com/demo/raw/authenticated/v1/x.json.gz",
            type: opts.type ?? "authenticated",
          }),
          { status: 200 },
        );
      if (url.startsWith("https://res.cloudinary.com")) return new Response("no", { status: opts.unsigned });
      if (method === "DELETE") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ resources: existing }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("uploadBackup", () => {
  it("keeps the newest 30 and deletes the rest", async () => {
    const calls = fake({ unsigned: 401, existing: 35 });
    const r = await uploadBackup(env, '{"a":1}');
    expect(r.privateOk).toBe(true);
    expect(r.deleted).toBe(5);
    expect(r.kept).toBe(30);
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del.length).toBe(1);
    expect(del[0].url).toContain("/resources/raw/authenticated");
    expect(decodeURIComponent(del[0].url)).toContain("bartika-backup-000");
  });
  it("deletes the file and fails if the unsigned URL is not refused", async () => {
    const calls = fake({ unsigned: 200 });
    await expect(uploadBackup(env, "{}")).rejects.toThrow();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
  it("refuses a non-authenticated upload", async () => {
    fake({ unsigned: 401, type: "upload" });
    await expect(uploadBackup(env, "{}")).rejects.toThrow();
  });
});
