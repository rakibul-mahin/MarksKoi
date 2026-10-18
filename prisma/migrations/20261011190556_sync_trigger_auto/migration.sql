-- Faculty page visits trigger a background sync when the last attempt is older than the interval.
ALTER TYPE "SyncTrigger" ADD VALUE IF NOT EXISTS 'AUTO';
