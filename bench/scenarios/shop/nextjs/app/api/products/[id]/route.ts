import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().max(100).optional(),
  price: z.number().int().optional(),
  stock: z.number().int().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const product = await prisma.product.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(product);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  await prisma.product.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
