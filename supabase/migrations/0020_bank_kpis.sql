-- Bank KPIs (src/lib/kpis/bank.ts): cash indicators read from the case's Norma 43 movements (minimum and average
-- daily balance, days of cash, operating cash flow, debt service burden, returned items…), recomputed with the rest of
-- the case by `recompute`. One JSON per case: { period, accounts, sources, coverageNote, kpis[] }; null without bank
-- files. Written by the pipeline (service role); lenders read it through the case view.

alter table cases add column if not exists bank_kpis jsonb check (bank_kpis is null or (jsonb_typeof(bank_kpis) = 'object' and pg_column_size(bank_kpis) < 65536));
grant select (bank_kpis) on cases to authenticated;
