import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const createSchema = z.object({
  title: z.string().max(200),
  done: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const todos = await prisma.todo.findMany({ where: { ownerId: userId } });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const userId = requireUser(req);
  if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const todo = await prisma.todo.create({
    data: { ...parsed.data, ownerId: userId },
  });
  return NextResponse.json(todo, { status: 201 });
}
