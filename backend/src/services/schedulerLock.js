const { randomUUID } = require('crypto');
const SchedulerLock = require('../models/SchedulerLock');

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

function leaseDuration() {
  const configured = Number(process.env.SCHEDULER_LOCK_LEASE_MS);
  return Number.isFinite(configured) && configured >= 60_000
    ? Math.min(configured, 60 * 60 * 1000)
    : DEFAULT_LEASE_MS;
}

/**
 * Claim a job across every backend process sharing the same MongoDB database.
 * A duplicate-key race means another process won the insert and is treated as
 * a normal contention result, not an application failure.
 */
async function acquire(job) {
  const name = String(job || '').trim().toLowerCase();
  if (!name) throw new Error('A scheduler job name is required');
  const owner = randomUUID();
  const now = new Date();
  try {
    const lock = await SchedulerLock.findOneAndUpdate(
      { job: name, leaseUntil: { $lte: now } },
      { $set: { owner, leaseUntil: new Date(now.getTime() + leaseDuration()) } },
      { new: true, runValidators: true },
    );
    if (lock) return { job: name, owner };

    // No row yet: the unique index makes concurrent first claims safe.
    const created = await SchedulerLock.create({
      job: name,
      owner,
      leaseUntil: new Date(now.getTime() + leaseDuration()),
    });
    return created ? { job: name, owner } : null;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function renew(lock) {
  if (!lock?.job || !lock?.owner) return false;
  const result = await SchedulerLock.updateOne(
    { job: lock.job, owner: lock.owner },
    { $set: { leaseUntil: new Date(Date.now() + leaseDuration()) } },
  );
  return result.matchedCount === 1;
}

async function release(lock) {
  if (!lock?.job || !lock?.owner) return false;
  const result = await SchedulerLock.deleteOne({ job: lock.job, owner: lock.owner });
  return result.deletedCount === 1;
}

module.exports = { acquire, renew, release, leaseDuration, DEFAULT_LEASE_MS };
