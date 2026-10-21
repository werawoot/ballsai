# Photo credits

Every photo the site shows that is not uploaded by a user. Rules: [ADR-014](decisions/ADR-014-light-glass-design-and-doensai-brand.md).
Only licences that allow commercial use without payment (Unsplash Licence, Pexels Licence)
or photos the owner took. No identifiable person, no child, no club crest or brand logo.

`lib/stock-photos.ts` lists the files; `tests/stock-photos.test.ts` checks that every file
listed there exists in `public/photos/` and has a row here.

| File | Kind | Source page | Photographer | Licence | Added |
| --- | --- | --- | --- | --- | --- |
| `stadium-aerial-night.webp` | STADIUM (page head) | https://images.unsplash.com/photo-1556056504-5c7696c4c28d (aerial of an empty floodlit pitch, Budapest, 2018; cropped 1600×640) | not in the file; Unsplash photo page not reachable from the build machine (bot check) | Unsplash Licence (served from images.unsplash.com, not Unsplash+) | 21 Oct 2026 |
| `cover-grass-line.webp` | COVER_DETAILS | https://images.unsplash.com/photo-1459865264687-595d652de67e (grass and a white line, close-up) | Sandro Schuh (EXIF Artist and IPTC Byline) | Unsplash Licence | 21 Oct 2026 |
| `cover-centre-circle.webp` | COVER_DETAILS | crop of photo-1556056504-5c7696c4c28d, centre circle | as stadium-aerial-night.webp | Unsplash Licence | 21 Oct 2026 |
| `cover-penalty-arc.webp` | COVER_DETAILS | crop of photo-1556056504-5c7696c4c28d, penalty area and arc | as stadium-aerial-night.webp | Unsplash Licence | 21 Oct 2026 |

Checked and left out on 21 Oct 2026: photos with people, the FIFA World Cup trophy (a trade
mark), balls and boots with a readable Nike or Adidas mark, and photo-1510051640316 (a goal
net) whose embedded copyright notice names a football club's photographer, so the uploader's
right to license it could not be confirmed. Files are re-encoded WebP with no EXIF, XMP or
GPS data.

The photographer of photo-1556056504 is not recorded because the Unsplash photo page could
not be opened from the build machine. The Unsplash Licence does not require credit; to add
the name later, find the image on unsplash.com and fill in the row.
