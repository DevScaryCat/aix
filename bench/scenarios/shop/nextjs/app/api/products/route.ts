import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().max(100),
  price: z.number().int(),
  stock: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const products = await prisma.product.findMany();
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const product = await prisma.product.create({
    data: { ...parsed.data, sellerId: userId },
  });
  return NextResponse.json(product, { status: 201 });
}
