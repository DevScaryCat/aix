import { NextRequest } from "next/server";

export function requireUser(req: NextRequest): string | null {
  const id = req.headers.get("x-user-id");
  return id && id.length > 0 ? id : null;
}
