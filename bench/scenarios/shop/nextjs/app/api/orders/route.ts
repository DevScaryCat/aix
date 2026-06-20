import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const createSchema = z.object({
  productId: z.string(),
  qty: z.number().int(),
});

export async function GET(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const orders = await prisma.order.findMany({ where: { buyerId: userId } });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const order = await prisma.order.create({
    data: { ...parsed.data, buyerId: userId },
  });
  return NextResponse.json(order, { status: 201 });
}
