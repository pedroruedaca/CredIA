/**
 * GET /api/cron/borme — daily BORME import (Vercel Cron, see vercel.json). Imports today's Section A and catches up
 * on any weekday of the last 10 days not yet imported (or that failed). Then cases whose confirmed company has new
 * acts in those days are flagged in the Bandeja and reprocessed (notifyNewActs). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestDay, weekdays } from "@/lib/borme/ingest";
import { notifyNewActs } from "@/lib/borme/watch";
import { todayMadrid } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createAdminClient();
  const today = todayMadrid();
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 10);
  const windowStart = from.toISOString().slice(0, 10);
  const days = weekdays(windowStart, today);
  const results = [];
  for (const day of days) {
    const r = await ingestDay(db, day);
    if (!r.skipped) results.push({ day: r.day, status: r.status, pdfs: r.pdfs, acts: r.acts, warnings: r.warnings.length, error: r.error });
  }
  const notified = await notifyNewActs(db, windowStart);
  return NextResponse.json({ ok: true, results, notified });
}
