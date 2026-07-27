alter table public.voided_orders
  add column counts_in_statistics boolean not null default true,
  add column statistics_excluded_at timestamptz,
  add column statistics_excluded_by text,
  add constraint voided_orders_statistics_status_consistent
    check (
      (counts_in_statistics = true
        and statistics_excluded_at is null
        and statistics_excluded_by is null)
      or
      (counts_in_statistics = false
        and statistics_excluded_at is not null)
    );

create index voided_orders_counted_business_date_idx
  on public.voided_orders (business_date)
  where counts_in_statistics = true;

comment on column public.voided_orders.counts_in_statistics is
  'Indica si el vaciado participa en las estadísticas del bot.';

comment on column public.voided_orders.statistics_excluded_at is
  'Fecha en la que un usuario autorizado excluyó el vaciado.';

comment on column public.voided_orders.statistics_excluded_by is
  'Identificador de Telegram que cambió el estado estadístico.';

grant update (
  counts_in_statistics,
  statistics_excluded_at,
  statistics_excluded_by
) on table public.voided_orders to service_role;
