# Photo credits

Every photo the site shows that is not uploaded by a user. Rules: [ADR-014](decisions/ADR-014-light-glass-design-and-doensai-brand.md).
Only licences that allow commercial use without payment (Unsplash Licence, Pexels Licence)
or photos the owner took. No identifiable person, no child, no club crest or brand logo.
One exception, the owner's decision of 23 Oct 2026 (AGENTS.md rule 7): the athletes image
the owner made with an AI tool, beside the line on /login only (`LOGIN_ART`). It shows no
real person and no brand mark, and is used nowhere else.

`lib/stock-photos.ts` lists the files; `tests/stock-photos.test.ts` checks that every file
listed there exists in `public/photos/` and has a row here.

| File | Kind | Source page | Photographer | Licence | Added |
| --- | --- | --- | --- | --- | --- |
| `stadium-aerial-night.webp` | STADIUM (page head) | https://images.unsplash.com/photo-1556056504-5c7696c4c28d (aerial of an empty floodlit pitch, Budapest, 2018; cropped 1600×640) | not in the file; Unsplash photo page not reachable from the build machine (bot check) | Unsplash Licence (served from images.unsplash.com, not Unsplash+) | 21 Oct 2026 |
| `cover-grass-line.webp` | COVER_DETAILS | https://images.unsplash.com/photo-1459865264687-595d652de67e (grass and a white line, close-up) | Sandro Schuh (EXIF Artist and IPTC Byline) | Unsplash Licence | 21 Oct 2026 |
| `backdrop-grass-blur.webp` | BACKDROP (behind the whole page) | https://images.unsplash.com/photo-1459865264687-595d652de67e, blurred (imgix blur=40), 1600 px | Sandro Schuh | Unsplash Licence | 21 Oct 2026 |
| `cover-centre-circle.webp` | COVER_DETAILS | crop of photo-1556056504-5c7696c4c28d, centre circle | as stadium-aerial-night.webp | Unsplash Licence | 21 Oct 2026 |
| `cover-penalty-arc.webp` | COVER_DETAILS | crop of photo-1556056504-5c7696c4c28d, penalty area and arc | as stadium-aerial-night.webp | Unsplash Licence | 21 Oct 2026 |
| `head-seats-colour.webp` | PAGE_PHOTOS.tournaments (/tournaments head) | https://unsplash.com/photos/a-row-of-empty-seats-in-a-stadium-GSe24RLE1Fs (photo-1646801479598-6a00891d2039, empty coloured seats; 1600×640) | Nico Smit (@nicosmit99) | Unsplash Licence | 22 Oct 2026 |
| `head-net-dark.webp` | PAGE_PHOTOS.tournament (/tournaments/[id] head; a net, not a place) | https://unsplash.com/photos/close-up-of-a-soccer-goal-net-against-black-background-2EbwO2RaKA8 (photo-1758934217889-1aec468a2d4d) | Sebastian Schuster (@sschusterphotoart) | Unsplash Licence | 22 Oct 2026 |
| `page-floodlights.webp` | was PAGE_PHOTOS.login (/login) until 23 Oct 2026; no longer shown, file removed | https://unsplash.com/photos/two-stadium-lights-against-a-clear-blue-sky-Dn4hT9Y1Gn0 (photo-1760800954391-c0975e57d0bf; 1600×1000) | Linus Belanger (@linusbelanger) | Unsplash Licence | 22 Oct 2026 |
| `page-net-sunset.webp` | PAGE_PHOTOS.welcome (/welcome) | https://unsplash.com/photos/Caw5BPLZahc (photo-1558297462-bf13bfc9fad2, a torn net at sunset, Märsta; 1600×1000) | Alex (@alexdphotography) | Unsplash Licence | 22 Oct 2026 |
| `head-pitch-above.webp` | PAGE_PHOTOS.ranking (/ranking head) | https://unsplash.com/photos/an-aerial-view-of-a-soccer-field-from-above-JLt9G7435Qk (photo-1723231462004-069caa209740; cropped to leave out a lettered wall) | Bernd Dittrich (@hdbernd) | Unsplash Licence | 22 Oct 2026 |
| `head-pitch-lines.webp` | PAGE_PHOTOS.athletes (/athletes head) | https://unsplash.com/photos/green-grass-field-with-white-paint-HTbSPSZ0Hsk (photo-1507602368706-321eeafaf53b, two white lines on grass; softened slightly) | Dan Gold (@danielcgold) | Unsplash Licence | 22 Oct 2026 |
| `head-seats-mono.webp` | PAGE_PHOTOS.hallOfFame (/hall-of-fame head) | https://unsplash.com/photos/empty-stadium-seats-arranged-in-a-row-atHbrQaEzx4 (photo-1741899940722-8f70b3911c81, black and white, no signage) | Ramiro Pianarosa (@rpianarosa) | Unsplash Licence | 22 Oct 2026 |
| `head-roof-sky.webp` | PAGE_PHOTOS.player (/players/[id] head) | https://unsplash.com/photos/2APhya1dM_U (photo-1494390438231-97c51a2de9c7, a stadium roof against the sky) | Bangkit Ristant (@bangkitristant) | Unsplash Licence | 22 Oct 2026 |
| `card-pitch-overhead.webp` | PAGE_PHOTOS.profile (/profile identity card) | https://unsplash.com/photos/empty-football-field-in-aerial-photgraphy-raesgfwU7iM (photo-1546717003-caee5f93a9db, a pitch from straight above, Netherlands; cropped to the pitch, leaving out the benches with a few people far away) | Victor (@victor_g) | Unsplash Licence | 22 Oct 2026 |
| `head-corner-flag.webp` | PAGE_PHOTOS.profileEdit (/profile/edit head) | https://unsplash.com/photos/minimalist-photo-of-soccer-field-91yHQ1JMK9Y (photo-1531861184681-f2de7dd72da5, a corner flag and arc; cropped to leave out the far advertising boards) | Ben Wiens (@benwiens) | Unsplash Licence | 22 Oct 2026 |
| `head-training-cones.webp` | PAGE_PHOTOS.teams (/team-members head) | https://www.pexels.com/photo/agility-ladder-and-marker-cones-on-a-football-field-13204961/ (an agility ladder and marker cones on a pitch, no people) | Chris K | Pexels Licence | 23 Oct 2026 |
| `head-fence-sunrise.webp` | PAGE_PHOTOS.join (/join/[token] head) | https://www.pexels.com/photo/sunrise-over-empty-soccer-field-with-trees-29741193/ (sunrise through a fence over an empty pitch; cropped) | Alexander Mass | Pexels Licence | 23 Oct 2026 |
| `head-floodlight-pair.webp` | PAGE_PHOTOS.notifications (/notifications head) | https://www.pexels.com/photo/two-football-stadium-lights-776805/ (two floodlight frames against a pale sky, empty seats below) | Toni Cuenca | Pexels Licence | 23 Oct 2026 |
| `head-pitch-floodlit.webp` | PAGE_PHOTOS.matchPlan (/match-plan head) | https://www.pexels.com/photo/green-football-field-399187/ (an empty artificial pitch under two floodlights at night, Norrtälje; cropped 1600×640, no people, no signage) | Jonathan Petersson (@grizzlybear) | Pexels Licence | 23 Oct 2026 |
| `head-training-pitch.webp` | PAGE_PHOTOS.training (/training head) | https://www.pexels.com/photo/soccer-ball-on-grass-field-with-training-cones-37628687/ (marker cones on a grass pitch; the ball, which carried a maker's mark, retouched out with grass from the same photo; no people) | Jay Brand | Pexels Licence | 24 Oct 2026 |
| `login-athletes-owner.webp` | LOGIN_ART (/login, beside the line; the only exception to rule 7) | Made by the owner with an AI image tool and handed over in the session of 23 Oct 2026 (athletes of several sports in a stadium; a second version with no brand mark on any shirt) | The owner | The owner's own image; no real person | 23 Oct 2026 |
| `page-login-scene.webp` | PAGE_PHOTOS.login (/login background, from 23 Oct 2026) | Made for this page: the two top corners of `login-athletes-owner.webp` (stadium lights and stands only, no person), enlarged and blurred, over grass up close from https://www.pexels.com/photo/green-grass-across-beige-red-open-sports-stadium-during-daytime-61143/ (the grass part only) | The owner (corners); Juan Salamanca (@jsalamanca), grass | The owner's own image; Pexels Licence | 23 Oct 2026 |
| `tile-football.webp` | SPORT_TILES.football (/login sport tile) | https://www.pexels.com/photo/soccer-ball-on-green-field-at-sunset-38275739/ (a plain worn ball by a white line, no mark) | Jomon Kollannoor (@jomon-kollannoor-337112572) | Pexels Licence | 23 Oct 2026 |
| `tile-basketball.webp` | SPORT_TILES.basketball | https://www.pexels.com/photo/close-up-photo-of-a-basketball-7201551/ (cropped to the seams, leaving out the maker's print at the edge) | cottonbro studio (@cottonbro) | Pexels Licence | 23 Oct 2026 |
| `tile-volleyball.webp` | SPORT_TILES.volleyball | https://www.pexels.com/photo/indoor-volleyball-on-a-court-line-32602955/ | Critical Smith (@criticalimagery) | Pexels Licence | 23 Oct 2026 |
| `tile-tennis.webp` | SPORT_TILES.tennis | https://www.pexels.com/photo/tennis-ball-on-clay-court-close-up-38380408/ | Daniel Neves Cotta (@afterdark) | Pexels Licence | 23 Oct 2026 |
| `tile-badminton.webp` | SPORT_TILES.badminton | https://www.pexels.com/photo/shuttlecocks-on-the-floor-7438726/ (three plain shuttlecocks) | Saif71.com (@saif71) | Pexels Licence | 23 Oct 2026 |

Checked and left out on 21 Oct 2026: photos with people, the FIFA World Cup trophy (a trade
mark), balls and boots with a readable Nike or Adidas mark, and photo-1510051640316 (a goal
net) whose embedded copyright notice names a football club's photographer, so the uploader's
right to license it could not be confirmed. On 22 Oct 2026 also left out: a ball with an
Adidas mark, two night stadiums with a sponsor's name on the roof, a sky over a stand with
Nike and club boards, a goal net with a player behind it, aerial pitches with people or a
school name, and photo-1599204607024 (a goal net) whose EXIF names a different
photographer from the uploader. On 23 Oct 2026 also left out: a ball with Premier League
and Puma marks, a ball pile with Adidas marks and people behind, and a night goal with
people, one of them a child, behind the net. Each page head is its own photo; none is reused. Files are re-encoded WebP with no EXIF, XMP or
GPS data.

The photographer of photo-1556056504 is not recorded because the Unsplash photo page could
not be opened from the build machine. The Unsplash Licence does not require credit; to add
the name later, find the image on unsplash.com and fill in the row.
