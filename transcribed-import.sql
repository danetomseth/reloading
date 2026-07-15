-- ============================================================================
-- LRS Tracker — import of handwritten load logs (transcribed 2026-07-15).
-- Run in Supabase Dashboard → SQL Editor → New query → Run.
-- Assigns everything to the single existing user. Safe to re-run (deduped).
--
-- ⚠️ REVIEW the values below before running — these are transcribed from
--    handwriting. Lines with "VERIFY" in the notes are my best guess.
-- ============================================================================

-- ensure the load_id + ladder columns exist (from supabase-migration-loads.sql)
alter table public.loads add column if not exists load_id text;
alter table public.loads add column if not exists ladder  text;

-- ── Rifles ────────────────────────────────────────────────────────────────────
insert into public.rifles (id, name, caliber, scope_unit, user_id, created_at, updated_at)
select gen_random_uuid()::text, r.name, r.caliber, 'moa', (select id from auth.users limit 1), now(), now()
from (values
  ('25 Creedmoor',  '.257'),
  ('7mm Rem Mag',   '.284'),
  ('6.5 PRC',       '.264'),
  ('6.5 Creedmoor', '.264'),
  ('22 ARC',        '.224'),
  ('6mm',           '.243'),
  ('7mm Gunwerks',  '.284')
) as r(name, caliber)
where not exists (select 1 from public.rifles x where x.name = r.name);

-- ── Loads ─────────────────────────────────────────────────────────────────────
-- helper column list reused for every insert
-- (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer,
--  brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es,
--  group_size, status, ladder, notes, user_id, created_at, updated_at)

-- L1 · 7mm Rem Mag · Accurate MagPro · 168 VLD Hunting · ladder 64.5–69
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251022-7RM', '2025-10-22', '7mm Rem Mag', '.284', 'Berger VLD Hunting', '168', 'Accurate MagPro', '63-69.6', 'CCI 250', 'Hornady', '0', '2.490', '3.290', '3.700', '', '', '', '', 'testing',
'[{"id":"1","charge":"64.5","velocity":"","group_size":""},{"id":"2","charge":"65","velocity":"","group_size":""},{"id":"3","charge":"65.5","velocity":"","group_size":""},{"id":"4","charge":"66","velocity":"","group_size":""},{"id":"5","charge":"66.5","velocity":"","group_size":""},{"id":"6","charge":"67","velocity":"","group_size":""},{"id":"7","charge":"67.5","velocity":"","group_size":""},{"id":"8","charge":"68","velocity":"","group_size":""},{"id":"9","charge":"68.5","velocity":"","group_size":""},{"id":"10","charge":"69","velocity":"","group_size":""}]',
'Ladder test. Charge range 63-69.6gr (max). Case fill rate 96%.', (select id from auth.users limit 1), '2025-10-22'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251022-7RM');

-- L2 · 6.5 PRC · N565 56.4 · Sierra 142 MatchKing
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251017-6PRC', '2025-10-17', '6.5 PRC', '.264', 'Sierra MatchKing', '142', 'Vihtavuori N565', '56.4', 'CCI 200', 'Hornady', '0', '2.0215', '2.905', '3.325', '', '', '', '', 'testing', '',
'Factory trim 2.0215. COAL ~2.905 VERIFY (max 3.325?). Bullet written "142gr MKX".', (select id from auth.users limit 1), '2025-10-17'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251017-6PRC');

-- L3 · 6.5 Creedmoor · Superformance 41.5–44.7 · 140 Nosler Partition (ladder blank)
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251022-65CM-a', '2025-10-22', '6.5 Creedmoor', '.264', 'Nosler Partition', '140', 'Hodgdon Superformance', '41.5-44.7', 'CCI BR-4', 'Lapua', '0', '1.915', '', '', '', '', '', '', 'testing', '',
'Planned ladder 41.5-44.7gr (max). Range table left blank.', (select id from auth.users limit 1), '2025-10-22'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251022-65CM-a');

-- L4 · 6.5 Creedmoor · Superformance 40–42.9 · 147 ELD-M (ladder blank)
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251022-65CM-b', '2025-10-22', '6.5 Creedmoor', '.264', 'Hornady ELD-M', '147', 'Hodgdon Superformance', '40-42.9', 'CCI BR-4 (small)', 'Lapua', '0', '1.915', '2.247', '2.260', '', '', '', '', 'testing', '',
'Planned ladder 40-42.9gr (max). Small primer BR-4. Range table left blank.', (select id from auth.users limit 1), '2025-10-22'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251022-65CM-b');

-- L5 · 22 ARC (sheet 0002) · CFE 223 · 62 ELD-VT · ladder 33.2–34.3
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251018-22ARC', '2025-10-18', '22 ARC', '.224', 'Hornady ELD-VT', '62', 'Hodgdon CFE 223', '33.2', 'CCI BR-4', 'Hornady', '1', '1.5105', '2.765', '', '', '', '', '', 'testing',
'[{"id":"1","charge":"33.2","velocity":"","group_size":""},{"id":"2","charge":"33.5","velocity":"","group_size":""},{"id":"3","charge":"33.7","velocity":"","group_size":""},{"id":"4","charge":"33.9","velocity":"","group_size":""},{"id":"5","charge":"34","velocity":"","group_size":""},{"id":"6","charge":"34.3","velocity":"","group_size":""}]',
'Sheet "0002". Ladder 33.2-34.3gr. Temp 58F, RH 56%, 25.67 inHg, DA 5360.', (select id from auth.users limit 1), '2025-10-18'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251018-22ARC');

-- L6 · 22 ARC (OCW) · powder VERIFY · 77 MatchKing · single point 30gr -> 2891
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251116-22ARC', '2025-11-16', '22 ARC', '.224', 'Sierra MatchKing', '77', 'Hodgdon Longshot', '30', 'CCI BR-4', 'Alpha', '0', '1.516', '2.792', '', '', '', '', '', 'testing',
'[{"id":"1","charge":"30","velocity":"2891","group_size":""}]',
'OCW. Scope height 2.00 in. COAL: 2.163 / node 2.792. Temp 51F, RH 81%, alt 4482.', (select id from auth.users limit 1), '2025-11-16'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251116-22ARC');

-- L7 · 22 ARC · Varget 28 · 77 MatchKing · 3107 fps ~1 MOA
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251014-22ARC', '2025-10-14', '22 ARC', '.224', 'Sierra MatchKing', '77', 'Hodgdon Varget', '28', 'Federal Match', 'Alpha', '0', '', '2.810', '', '3107', '', '', '1', 'promising', '',
'~1 MOA, wind @ 770 VERIFY. Temp 48F, RH 64%, 25.68 inHg, DA 4535.', (select id from auth.users limit 1), '2025-10-14'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251014-22ARC');

-- L8 · 6mm · Varget 32.8 · Berger LRHT · 2820 fps
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251211-6mm', '2025-12-11', '6mm', '.243', 'Berger LRHT', '', 'Hodgdon Varget', '32.8', 'CCI BR-4', 'Alpha', '0', '', '2.575', '2.600', '2820', '4.8', '11.0', '', 'promising', '',
'Bullet weight not recorded — 6mm LRHT is 109gr, VERIFY. Scope height 2.375 in. Temp 56F, RH 48%, 25.69 inHg, DA 4750.', (select id from auth.users limit 1), '2025-12-11'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251211-6mm');

-- L9 · 22 ARC (AR upper) · LEVERevolution 31.5 · 62 ELD-VT · 3115 fps
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251212-22ARC-AR', '2025-12-12', '22 ARC', '.224', 'Hornady ELD-VT', '62', 'Hodgdon LEVERevolution', '31.5', 'CCI BR-4', 'Hornady', '', '', '', '2.260', '3115', '', '', '', 'testing', '',
'AR upper. 1.5 in high. Drops: 300=0.75, 400=3, 500=5.5. Scope height 2.875 in. Temp 59F, RH 55%, 26.05 inHg, DA 4440.', (select id from auth.users limit 1), '2025-12-12'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251212-22ARC-AR');

-- L10 · 7mm Gunwerks · Retumbo · Berger 168 · ladder 67–71
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '251212-7GW', '2025-12-12', '7mm Gunwerks', '.284', 'Berger', '168', 'Hodgdon Retumbo', '67-71', 'CCI 250 LM', 'Hornady', '0', '', '3.428', '3.724', '', '', '', '', 'testing',
'[{"id":"1","charge":"67","velocity":"","group_size":""},{"id":"2","charge":"67.5","velocity":"","group_size":""},{"id":"3","charge":"68","velocity":"","group_size":""},{"id":"4","charge":"68.5","velocity":"","group_size":""},{"id":"5","charge":"69","velocity":"","group_size":""},{"id":"6","charge":"69.5","velocity":"","group_size":""},{"id":"7","charge":"70","velocity":"","group_size":""},{"id":"8","charge":"70.5","velocity":"","group_size":""},{"id":"9","charge":"71","velocity":"","group_size":""}]',
'Rifle name "7mm Gunwerks" VERIFY. Ladder 67-71gr. COAL 3.428 (max 3.724).', (select id from auth.users limit 1), '2025-12-12'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '251212-7GW');

-- L11 · 25 Creedmoor · powder NOT recorded · 138 A-Tip · ladder 38–41
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '260304-25CM', '2026-03-04', '25 Creedmoor', '.257', 'Hornady A-Tip', '138', '', '38-41', 'Federal 205M', 'Peterson', '0', '1.911', '2.410', '', '', '', '', '', 'testing',
'[{"id":"1","charge":"38","velocity":"","group_size":""},{"id":"2","charge":"38.5","velocity":"","group_size":""},{"id":"3","charge":"39","velocity":"","group_size":""},{"id":"4","charge":"39.5","velocity":"","group_size":""},{"id":"5","charge":"40","velocity":"","group_size":""},{"id":"6","charge":"40.5","velocity":"","group_size":""},{"id":"7","charge":"41","velocity":"","group_size":""}]',
'OCW ladder 38-41gr. Powder not recorded on sheet. Primer "F205M" VERIFY.', (select id from auth.users limit 1), '2026-03-04'::timestamptz, now()
where not exists (select 1 from public.loads where load_id = '260304-25CM');

-- L12 · 6.5 PRC · N565 49–53.5 · Berger 156 · ladder WITH velocities
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '6PRC-N565-156', '', '6.5 PRC', '.264', 'Berger', '156', 'Vihtavuori N565', '49-53.5', 'Federal 210', '', '0', '', '', '', '', '', '', '', 'promising',
'[{"id":"1","charge":"49","velocity":"2415","group_size":""},{"id":"2","charge":"49.5","velocity":"2431","group_size":""},{"id":"3","charge":"50","velocity":"2463","group_size":""},{"id":"4","charge":"50.5","velocity":"2440","group_size":""},{"id":"5","charge":"51","velocity":"2530","group_size":""},{"id":"6","charge":"51.5","velocity":"2550","group_size":""},{"id":"7","charge":"52","velocity":"2574","group_size":""},{"id":"8","charge":"52.5","velocity":"2561","group_size":""},{"id":"9","charge":"53","velocity":"2620","group_size":""},{"id":"10","charge":"53.5","velocity":"2662","group_size":""}]',
'Bullet 156gr (Berger EOL Elite Hunter? VERIFY). Per-step SD: 49->31, 49.5->12.9, 50->24, 50.5->6.7, 51->32. Scope height 1.875 in. Temp 47F, RH 59%, 25.81 inHg, DA 4239.', (select id from auth.users limit 1), now(), now()
where not exists (select 1 from public.loads where load_id = '6PRC-N565-156');

-- L13 · 22 ARC · Varget · 77 TMK · 7-shot string 2947 fps
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '22ARC-Varget-77TMK', '', '22 ARC', '.224', 'Sierra TMK', '77', 'Hodgdon Varget', '', '', '', '', '', '', '', '2947', '18', '55', '', 'promising', '',
'7-shot string: avg 2947 fps, SD 18, ES 55. Charge not recorded on this sheet. RH 53%, 25.82 inHg, DA 4477.', (select id from auth.users limit 1), now(), now()
where not exists (select 1 from public.loads where load_id = '22ARC-Varget-77TMK');

-- L14 · 25 Creedmoor · H4350 · ladder WITH velocities
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '25CM-H4350-ladder', '', '25 Creedmoor', '.257', '', '', 'Hodgdon H4350', '38-41', '', '', '', '', '2.816', '', '', '', '', '', 'testing',
'[{"id":"1","charge":"38","velocity":"","group_size":""},{"id":"2","charge":"38.5","velocity":"2710","group_size":""},{"id":"3","charge":"39","velocity":"2676","group_size":""},{"id":"4","charge":"39.5","velocity":"2646","group_size":""},{"id":"5","charge":"40","velocity":"2631","group_size":""},{"id":"6","charge":"40.5","velocity":"2640","group_size":""},{"id":"7","charge":"41","velocity":"","group_size":""}]',
'Load COL 2.816. Per-step SD: 38.5->15, 39->5.3, 39.5->7.7, 40->9.8, 40.5->9.5. ⚠ Velocities appear to DECREASE as charge increases — VERIFY charge/velocity alignment. Temp 60F, RH 36%, 25.91 inHg, DA 5412.', (select id from auth.users limit 1), now(), now()
where not exists (select 1 from public.loads where load_id = '25CM-H4350-ladder');

-- L15 · 25 Creedmoor · H4350 (Peterson box label, partial)
insert into public.loads (id, load_id, date, rifle, caliber, bullet, bullet_wt, powder, charge, primer, brass, brass_fires, trim_len, overall_coal, max_overall_coal, velocity, sd, es, group_size, status, ladder, notes, user_id, created_at, updated_at)
select gen_random_uuid()::text, '25CM-4350-box', '', '25 Creedmoor', '.257', '', '', 'Hodgdon H4350', '', '', 'Peterson', '', '', '', '', '2679', '3.5', '', '', 'testing', '',
'From Peterson box label — partial/hard to read. Velocity 2679; "3.5" may be SD or group, VERIFY. Powder written "4350".', (select id from auth.users limit 1), now(), now()
where not exists (select 1 from public.loads where load_id = '25CM-4350-box');
