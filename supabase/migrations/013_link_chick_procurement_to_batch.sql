-- Backfill batch_id on existing chick procurement records.
--
-- Chick procurement created by NewBatchModal was always dated the same day as the batch
-- start_date, and the batch belongs to one farm. Match by date: one chick procurement per
-- batch start date is the expected cardinality.
--
-- Safe to run multiple times (WHERE batch_id IS NULL guards re-runs).

UPDATE procurement p
SET    batch_id = b.id
FROM   batches b
WHERE  p.type      = 'chicks'
  AND  p.batch_id  IS NULL
  AND  p.date      = b.start_date;
