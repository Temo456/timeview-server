# Course redesign implementation plan

## Goal

Preserve the server's published revision 26 and build a configurable lesson system around it. The introductory lesson must cover the requested moon phases, equinoxes, solstices, planet views, and birthday report.

## Source and migration

- Keep the downloaded `data/course-content.json` and `.previous` as local, ignored copies of the server content. Keep the verified archive in `.deploy-check`.
- Build a new structured default lesson from that content. Preserve unaffected narration and settings. Migrate the existing single-course file in memory when the new schema loads; never overwrite it during startup.
- Keep optimistic revisions and atomic save with a previous-file backup.

## Implementation

1. Extend course storage with a course catalog, stable course IDs, editable chapters and lines, scene cues, and independent revisions.
2. Update the admin editor to select, create, duplicate, and edit courses, chapter view and scene cues, and line order/content.
3. Drive the player from the selected course script. Start closed, retain the current dialogue line when paused, and carry the chosen course across Earth/Solar navigation.
4. Add a moon phase diagram to Earth view, a season/solar-term teaching view and close planet views to Solar view, and update the birthday report.
5. Verify migration from the downloaded revision 26, API behavior, script syntax, and key browser flows on desktop/mobile.

## Scientific presentation

Moon phases are a viewing geometry, not Earth's shadow except during lunar eclipses. Month-day labels are approximate. The Sun's apparent ecliptic longitude advances by 15 degrees per solar term, not Earth's physical orbital angle at a constant rate. Star mansions are presented as a traditional sky map unless a sourced coordinate calculation is available.
