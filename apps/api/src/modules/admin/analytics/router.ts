import {
  AdminAnalyticsExportQuerySchema,
  AdminAnalyticsQuerySchema,
  AdminAnalyticsResponseSchema,
  type AnalyticsReport,
} from '@store/shared';
import { Router as ExpressRouter, type Response, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';

import { csvRow, formatCents, type CsvCell } from './csv.ts';
import * as repo from './repo.ts';
import * as service from './service.ts';

const PAGE = 500;

// Writes the report a page at a time, so a year of orders never sits in memory as one string.
async function* rows(
  report: AnalyticsReport,
  range: repo.Range,
  lowStock: number,
): AsyncGenerator<CsvCell[]> {
  if (report === 'orders') {
    yield [
      'order_number',
      'placed_at_utc',
      'status',
      'email',
      'units',
      'total_cents',
      'total',
      'refunded_cents',
      'net_cents',
      'net',
    ];
    for (let offset = 0; ; offset += PAGE) {
      const page = await repo.orderRows(range, PAGE, offset);
      for (const o of page) {
        const net = o.total_cents - o.refunded_cents;
        yield [
          o.number,
          o.placed_at,
          o.status,
          o.email,
          o.units,
          o.total_cents,
          formatCents(o.total_cents),
          o.refunded_cents,
          net,
          formatCents(net),
        ];
      }
      if (page.length < PAGE) return;
    }
  } else if (report === 'products') {
    yield ['product', 'units', 'revenue_cents', 'revenue'];
    for (const p of await repo.topProducts(range, 'revenue', null)) {
      yield [p.name, p.units, p.revenue_cents, formatCents(p.revenue_cents)];
    }
  } else {
    yield ['sku', 'product', 'variant', 'available', 'threshold'];
    for (const v of await repo.lowStock(lowStock, null)) {
      yield [v.sku, v.product_name, v.variant_name, v.available, lowStock];
    }
  }
}

async function stream(res: Response, lines: AsyncGenerator<CsvCell[]>) {
  for await (const cells of lines) res.write(csvRow(cells));
  res.end();
}

export function createAnalyticsRouter(): Router {
  const router = ExpressRouter();

  const dashboard = { query: AdminAnalyticsQuerySchema };
  router.get('/analytics', validate(dashboard), async (req, res) => {
    const { query } = valid(req, dashboard);
    respond(res, AdminAnalyticsResponseSchema, { data: await service.getAnalytics(query) });
  });

  const exportQuery = { query: AdminAnalyticsExportQuerySchema };
  router.get('/analytics/export.csv', validate(exportQuery), async (req, res) => {
    const { query } = valid(req, exportQuery);
    const range = await service.resolveRange(query);
    res.status(200);
    res.type('text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${query.report}-${range.from}-to-${range.to}.csv"`,
    );
    await stream(res, rows(query.report, range, query.lowStock));
  });

  return router;
}
