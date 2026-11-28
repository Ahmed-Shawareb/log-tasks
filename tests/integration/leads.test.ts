import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createLead, listLeads, setLeadHandled } from "@/server/services/leads";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const form = (n: string) => ({ full_name: `Visitor ${n}`, company_name: "Acme", email: `v${n}@example.com`, service_needed: "Media Production", budget_range: "$5K - $15K", message: "Hello" });

describe("website enquiries", () => {
  it("anyone can send one; admins are told, can read it and mark it handled", async () => {
    const ip = `10.0.0.${Date.now() % 200}`;
    await createLead(form("a"), ip);
    const admin = await as(EMAILS.admin);
    const lead = (await listLeads(admin)).find((l) => l.fullName === "Visitor a")!;
    expect(lead).toMatchObject({ companyName: "Acme", service: "Media Production" });
    expect(await db.notification.count({ where: { userId: admin.id, type: "lead.new" } })).toBeGreaterThan(0);
    expect((await setLeadHandled(admin, lead.id, true)).handledAt).not.toBeNull();
    await expectError(listLeads(await as(EMAILS.am)), "FORBIDDEN");
  });

  it("refuses bad input, quietly drops bots, and limits how often one address can send", async () => {
    await expectError(createLead({ ...form("b"), email: "not-an-email" }, "10.1.1.1"), "INVALID");
    const before = await db.lead.count();
    await createLead({ ...form("bot"), website: "http://spam.example" }, "10.1.1.2");
    expect(await db.lead.count()).toBe(before);
    const ip = `10.2.2.${Date.now() % 200}`;
    for (let i = 0; i < 5; i++) await createLead(form(`r${i}`), ip);
    await expectError(createLead(form("r5"), ip), "RATE_LIMITED");
  });
});
