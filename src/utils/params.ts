import type { Request } from "express";

export function paramId(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing route param: ${key}`);
  }
  return value;
}
