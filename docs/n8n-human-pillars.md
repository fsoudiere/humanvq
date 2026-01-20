# n8n: HVQ analysis (human pillars + primary_pillar)

For the Replacement Risk model, the AI audit step should output **`hvq_analysis`** with `primary_pillar` and `pillars` so `calculateVulnerability` and the dashboard use real data.

## Preferred: `hvq_analysis` object

Send an **`hvq_analysis`** object in the webhook body:

- **`hvq_analysis.primary_pillar`** → `upgrade_paths.primary_pillar` (e.g. `"liability"` | `"context"` | `"edgeCase"` | `"connection"`)
- **`hvq_analysis.pillars.liability`**, **`.context`**, **`.edgeCase`**, **`.connection`** → `pillar_liability`, `pillar_context`, `pillar_edge_case`, `pillar_connection` (each 0.0–1.0)

`efficiency_audit` and `immediate_steps` can be at the top level or inside `hvq_analysis`; the webhook checks both.

## Pillar meanings (0 = low, 1 = high → lower replacement risk)

| Key         | Meaning                                              |
|-------------|------------------------------------------------------|
| `liability` | Responsibility, accountability, consequences         |
| `context`   | Domain knowledge, situational nuance                 |
| `edgeCase`  | Edge cases, exceptions, judgment calls               |
| `connection`| Trust, relationships, human interaction              |

## Example `hvq_analysis` in the webhook body

```json
{
  "path_id": "...",
  "path_title": "From X to Y in 90 Days",
  "efficiency_audit": { "delegate_to_machine": [...], "keep_for_human": [...] },
  "immediate_steps": [{ "text": "...", "is_completed": false }],
  "hvq_analysis": {
    "primary_pillar": "connection",
    "pillars": {
      "liability": 0.7,
      "context": 0.6,
      "edgeCase": 0.5,
      "connection": 0.8
    }
  }
}
```

## Webhook mapping

| n8n / body                          | `upgrade_paths` column    |
|------------------------------------|---------------------------|
| `hvq_analysis.primary_pillar`      | `primary_pillar`          |
| `hvq_analysis.pillars.liability`   | `pillar_liability`        |
| `hvq_analysis.pillars.context`     | `pillar_context`          |
| `hvq_analysis.pillars.edgeCase`    | `pillar_edge_case`        |
| `hvq_analysis.pillars.connection`  | `pillar_connection`       |

Pillar scores are clamped to `[0, 1]`. If `hvq_analysis.pillars` is missing, the webhook falls back to **`human_pillars`** (same shape) for the four columns.

## Frontend

Path fetches use `*` on `upgrade_paths`, so `primary_pillar` and `pillar_*` are included. The app uses `path.primary_pillar` when set, otherwise `GOAL_PILLAR_MAP[role]`, for the “2× Value” badge and HVQ.
