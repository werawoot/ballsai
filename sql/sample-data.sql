-- BALLSAI sample data
-- Run after the core schema/RLS setup.
-- Tournaments are inserted only when at least one organizer/admin profile exists.

begin;

insert into public.player_ranks (
  id,
  player_name,
  team,
  province,
  position,
  ovr,
  pts,
  pac,
  sho,
  pas,
  dri,
  def,
  rank_change,
  sport,
  season
)
values
  ('00000000-0000-4000-8000-000000000101', 'ธีรภัทร ใจกล้า', 'Ayutthaya Falcons', 'พระนครศรีอยุธยา', 'FW', 82, 2140, 86, 84, 72, 81, 48, 25, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000102', 'ณัฐวุฒิ ศรีสนาม', 'Bangkok Youth FC', 'กรุงเทพฯ', 'MF', 80, 2035, 78, 74, 87, 84, 65, 18, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000103', 'พีรวิชญ์ คำเมือง', 'Chiang Mai City', 'เชียงใหม่', 'GK', 79, 1988, 62, 35, 70, 58, 88, 12, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000104', 'ภาคิน รัตนชัย', 'Chonburi Academy', 'ชลบุรี', 'DF', 77, 1875, 74, 45, 68, 62, 86, 8, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000105', 'กิตติพงษ์ แก้วใส', 'Korat United', 'นครราชสีมา', 'FW', 75, 1742, 82, 78, 61, 76, 42, -4, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000106', 'ศิวกร เพชรดำ', 'Hat Yai Juniors', 'สงขลา', 'MF', 74, 1685, 75, 68, 79, 77, 60, 5, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000107', 'ชยพล วงศ์สว่าง', 'Rayong Wave', 'ระยอง', 'DF', 72, 1590, 70, 40, 63, 60, 81, 0, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000108', 'อัครเดช นิลทอง', 'Ubon Rising', 'อุบลราชธานี', 'FW', 71, 1515, 79, 73, 58, 72, 39, 14, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000109', 'ธนกฤต สายชล', 'Phuket Sea FC', 'ภูเก็ต', 'GK', 70, 1460, 59, 30, 64, 55, 80, -2, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000110', 'รชต เหลืองอร่าม', 'Nonthaburi Foxes', 'นนทบุรี', 'MF', 69, 1398, 71, 64, 73, 70, 58, 3, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000111', 'ชินวัตร ทองดี', 'Saraburi Bulls', 'สระบุรี', 'DF', 68, 1320, 67, 38, 61, 58, 77, 1, 'football', '2026'),
  ('00000000-0000-4000-8000-000000000112', 'เมธาสิทธิ์ มีชัย', 'Nakhon Pathom Stars', 'นครปฐม', 'FW', 67, 1255, 76, 69, 55, 68, 36, -7, 'football', '2026')
on conflict (id) do update set
  player_name = excluded.player_name,
  team = excluded.team,
  province = excluded.province,
  position = excluded.position,
  ovr = excluded.ovr,
  pts = excluded.pts,
  pac = excluded.pac,
  sho = excluded.sho,
  pas = excluded.pas,
  dri = excluded.dri,
  def = excluded.def,
  rank_change = excluded.rank_change,
  sport = excluded.sport,
  season = excluded.season;

with organizer as (
select id
  from public.profiles
  where role in ('organizer', 'admin')
  order by id
  limit 1
)
insert into public.tournaments (
  id,
  name,
  description,
  location,
  start_date,
  end_date,
  fee,
  promptpay,
  max_teams,
  organizer_id,
  status
)
select
  seed.id,
  seed.name,
  seed.description,
  seed.location,
  seed.start_date,
  seed.end_date,
  seed.fee,
  seed.promptpay,
  seed.max_teams,
  organizer.id,
  seed.status
from (
  values
    ('00000000-0000-4000-8000-000000000201'::uuid, 'BALLSAI Youth Cup 2026', 'รายการเยาวชนรุ่นอายุไม่เกิน 16 ปี ใช้ผลแข่งอัปเดต Power Rating', 'สนามกีฬาเฉลิมพระเกียรติ อยุธยา', '2026-07-12'::date, '2026-07-12'::date, 500, '0812345678', 16, 'open'),
    ('00000000-0000-4000-8000-000000000202'::uuid, 'Bangkok Futsal Challenge', 'บอลเดินสายฟุตซอล 5 คน พร้อมบันทึก MVP และสถิติรายคน', 'สนามฟุตซอลพระราม 9', '2026-07-26'::date, '2026-07-27'::date, 800, '0899991111', 24, 'open'),
    ('00000000-0000-4000-8000-000000000203'::uuid, 'Eastern Rising Stars', 'ทัวร์นาเมนต์ภาคตะวันออกสำหรับทีมเยาวชนหน้าใหม่', 'ชลบุรี อารีนา', '2026-08-09'::date, '2026-08-09'::date, 650, '0865552222', 20, 'open')
) as seed(id, name, description, location, start_date, end_date, fee, promptpay, max_teams, status)
cross join organizer
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  location = excluded.location,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  fee = excluded.fee,
  promptpay = excluded.promptpay,
  max_teams = excluded.max_teams,
  status = excluded.status;

commit;
