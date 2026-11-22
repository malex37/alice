# qdify for Home Assistant

Adds a qdify to-do list to Home Assistant. Tested with Home Assistant 2026.11.2.

## Install

1. Copy `custom_components/qdify` into `<config>/custom_components/`, or extract the
   archive from `moon run qdify-homeassistant:build` inside `<config>`.
2. Restart Home Assistant.
3. Go to **Settings > Devices & services > Add integration > qdify**. Enter the base URL
   (one Home Assistant can reach, so not `localhost` unless both share a host) and the
   value of `QDIFY_API_TOKEN`.

## Mapping

| qdify | Home Assistant |
| --- | --- |
| `title` | summary |
| `notes` | description |
| `dueDate` | due (date only) |
| `status: open` | `needs_action` |
| `status: done` | `completed` |
| `completedAt` | completed |
| `priority` | not shown; preserved on edits |

The list refreshes every 30 seconds and after each change. Edits send only the changed
fields, so they don't undo changes made in the web UI since the last poll.

`custom_components/qdify/core` has no Home Assistant imports and is what pytest covers.
