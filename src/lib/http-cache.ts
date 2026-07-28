import type { Response } from "express";

/** Cache HTTP privado para respuestas GET poco volátiles (panel admin). */
export function setPrivateHttpCache(
  res: Response,
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds = maxAgeSeconds * 2
) {
  res.setHeader(
    "Cache-Control",
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
  );
}

export function setNoStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}
