import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, forbidden, notFound } from "../errors";
import { notify } from "../audit";
import { isAdmin, type SessionUser } from "../permissions";

// Enquiries from the public website's contact form. Anyone can send one; only admins read them.

const PER_HOUR = 5;

export const leadSchema = z.object({
  full_name: z.string().trim().min(2, "Your name, please").max(120),
  company_name: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().toLowerCase().email("A valid email, please").max(254),
  phone: z.string().trim().max(40).optional().default(""),
  service_needed: z.string().trim().max(80).optional().default(""),
  budget_range: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(5000).optional().default(""),
  /** Honeypot: people never see this field, so anything in it came from a bot. */
  website: z.string().max(200).optional().default(""),
});

export async function createLead(raw: unknown, ip: string) {
  const input = leadSchema.parse(raw);
  if (input.website) return { ok: true }; // quietly drop bots
  const recent = await db.lead.count({ where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PER_HOUR) throw new AppError("RATE_LIMITED", "Thanks — we already have your message. Please try again later or reach us on WhatsApp.");
  const lead = await db.lead.create({
    data: {
      fullName: input.full_name, companyName: input.company_name || null, email: input.email, phone: input.phone || null,
      service: input.service_needed || null, budget: input.budget_range || null, message: input.message || null, ipAddress: ip,
    },
  });
  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  await notify(db, admins.map((a) => a.id), {
    type: "lead.new", title: `New enquiry: ${lead.fullName}${lead.companyName ? ` · ${lead.companyName}` : ""}`,
    body: [lead.service, lead.budget].filter(Boolean).join(" · ") || lead.email, link: "/admin/leads",
  });
  return { ok: true };
}

export async function listLeads(actor: SessionUser) {
  if (!isAdmin(actor)) throw forbidden("Administrator access required.");
  return db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 500, omit: { ipAddress: true } });
}

export async function setLeadHandled(actor: SessionUser, id: string, handled: boolean) {
  if (!isAdmin(actor)) throw forbidden("Administrator access required.");
  if (!(await db.lead.count({ where: { id } }))) throw notFound("Enquiry");
  return db.lead.update({ where: { id }, data: { handledAt: handled ? new Date() : null }, omit: { ipAddress: true } });
}
