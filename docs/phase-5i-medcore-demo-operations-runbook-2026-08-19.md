# Phase 5I MedCore Demo Operations Runbook

Date: 2026-08-19

Production URL: https://warranty.feedbacknfc.com

Demo tenant: MedCore Critical Care India Pvt Ltd

Demo organization id: `95ba109f-b777-4eb7-9e38-26b4bb5c4a38`

Demo seed marker: `phase5h-medcore-pm-cycle`

## Demo Position

This is a controlled MedCore preventive-maintenance cycle demo. The flow is ready for a client walkthrough when the Demo Ops page reports no blocked checks and scheduled live delivery remains disabled or dry-run only.

Clerk development keys are accepted for this demo by product direction. Do not treat the Clerk development-key browser warning as a demo blocker for this phase.

## Pre-Demo Check

Open:

```text
https://warranty.feedbacknfc.com/dashboard/manufacturer/demo-ops
```

Expected state:

- Overall status is Ready or Attention with only accepted warnings.
- Workspace is MedCore Critical Care India Pvt Ltd.
- PM events count is at least 3.
- Demo story events include:
  - `MCOREPM-001` scheduled
  - `MCOREPM-002` in progress
  - `MCOREPM-003` completed
- Notification and delivery-attempt evidence is present.
- Scheduler mode is disabled or dry run.
- Scheduler batch cap is 5.
- Scheduler allowlist contains only `95ba109f-b777-4eb7-9e38-26b4bb5c4a38`.
- Legacy PM smoke data count is 0.
- Prisma migration table is reachable and has no failed migrations.

CLI check:

```bash
npm run check:medcore-pm-demo-readiness
```

Machine-readable output:

```bash
npm run check:medcore-pm-demo-readiness -- --json
```

## Safe Demo Reset

Use the guarded seed command from the Demo Ops page. Current command:

```bash
npm run seed:medcore-pm-demo -- --reset --confirm-medcore-demo-reset --cleanup-old-smoke --confirm-cleanup-old-smoke --allow-production --organization-id=95ba109f-b777-4eb7-9e38-26b4bb5c4a38
```

Safety properties:

- Normal reset deletes only rows tagged with `metadata.demoSeed="phase5h-medcore-pm-cycle"`.
- Legacy smoke cleanup is separate and requires its own confirmation flag.
- The script refuses to seed any organization other than the MedCore demo organization id.
- The script verifies the target organization name and type before seeding.

After reset, run:

```bash
npm run check:medcore-pm-demo-readiness
```

## Demo Flow

1. Start at the manufacturer dashboard.

   ```text
   https://warranty.feedbacknfc.com/dashboard/manufacturer
   ```

   Show the MedCore manufacturer workspace and high-level operational counters.

2. Open Demo Ops.

   ```text
   https://warranty.feedbacknfc.com/dashboard/manufacturer/demo-ops
   ```

   Show that the demo is safe, scoped, and ready.

3. Open Maintenance.

   ```text
   https://warranty.feedbacknfc.com/dashboard/manufacturer/preventive-maintenance
   ```

   Walk through the three PM states:

   - `MCOREPM-001`: upcoming scheduled ICU monitor PM
   - `MCOREPM-002`: active ventilator calibration
   - `MCOREPM-003`: completed infusion pump PM with acknowledgement

4. Open Inbox.

   ```text
   https://warranty.feedbacknfc.com/dashboard/notifications
   ```

   Show PM notification intents, scheduler safety posture, dry-run/manual-live controls, and guarded send states.

5. Open Reporting.

   ```text
   https://warranty.feedbacknfc.com/dashboard/notifications/reporting
   ```

   Show PM notification metrics, scheduled dispatcher counters, and CSV export.

## Do Not Do During Demo

- Do not enable `PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED`.
- Do not trigger scheduled dispatcher manually unless the client explicitly wants to see a supervised dry-run.
- Do not run a live email pilot until recipients have been reviewed and the UI confirmation gate is satisfied.
- Do not switch the demo tenant to BPL during this MedCore walkthrough.
- Do not run old smoke scripts against production.

## Recovery

If Demo Ops reports missing records or old smoke data:

1. Run the guarded reset command.
2. Run `npm run check:medcore-pm-demo-readiness`.
3. Re-open the Demo Ops page.
4. Verify the Maintenance, Inbox, and Reporting routes.

If Demo Ops reports scheduler live mode:

1. Set `PM_NOTIFICATION_SCHEDULED_LIVE_DELIVERY_ENABLED` to disabled/false in production.
2. Redeploy production.
3. Verify `warranty.feedbacknfc.com` points to the latest deployment.
4. Re-run the readiness check.

If migration state reports failed migrations:

1. Inspect `_prisma_migrations` in production.
2. Resolve drift before presenting the production demo.
3. Run the project-equivalent migration apply step.
4. Re-run the readiness check.

## Phase 5I Exit Criteria

- Demo Ops page exists and is available to the MedCore manufacturer admin.
- Read-only CLI readiness check exists and returns nonzero on blocked demo state.
- The runbook documents the exact demo path and recovery commands.
- Production scheduler safety posture is visible before the demo.
- Demo reset remains guarded by explicit production confirmation flags.
