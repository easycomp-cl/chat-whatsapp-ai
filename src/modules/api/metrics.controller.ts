import type { Request, Response } from "express";
import { metricsService } from "../metrics/metrics.service.js";
import { paramId } from "../../utils/params.js";

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function getMetricsSummary(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const summary = await metricsService.getSummary(businessId, from, to);
  res.json(summary);
}

export async function getMetricsQuestions(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const limit = Number(req.query.limit ?? 10);
  const questions = await metricsService.getTopQuestions(businessId, limit, from, to);
  res.json({ top_questions: questions });
}

export async function getMetricsUsage(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const usage = await metricsService.getUsage(businessId, from, to);
  res.json(usage);
}

export async function getMetricsDashboard(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const limit = Number(req.query.limit ?? 10);
  const dashboard = await metricsService.getDashboard(businessId, from, to, limit);
  res.json(dashboard);
}
