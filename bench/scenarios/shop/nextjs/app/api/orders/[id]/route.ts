import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  await prisma.order.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
