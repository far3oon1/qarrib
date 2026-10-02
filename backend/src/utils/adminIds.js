// Cached lookup of admin ids.
//
// Nearly every order/payment/subscription event notifies the admins, and each
// of those handlers used to run its own `User.find({ role: 'admin' }).select('_id')`
// — the same query 24 times across the controllers, once per event on hot paths.
// The result changes only when an admin is created, deleted or toggled, so it is
// cached in-process for a short TTL and invalidated explicitly on those writes.
const User = require('../models/User');

const TTL_MS = 60 * 1000;

let cache = null;        // { at: number, docs: Array<{ _id: any }> }
let inflight = null;     // de-duplicates concurrent misses into one query

/**
 * Admin documents (id-only projections), newest-first.
 *
 * Deliberately returns the same shape the old
 * `User.find({ role: 'admin' }).select('_id')` returned — callers read `a._id`,
 * so handing back bare ids would silently break every notification loop.
 *
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ _id: any }>>}
 */
async function getAdminIds(options) {
    const limit = options && options.limit ? Number(options.limit) : 0;
    const now = Date.now();

    if (cache && now - cache.at < TTL_MS) {
        return limit > 0 ? cache.docs.slice(0, limit) : cache.docs;
    }

    // Collapse a thundering herd into a single query.
    if (!inflight) {
        inflight = User.find({ role: 'admin' })
            .select('_id')
            .sort({ createdAt: -1 })
            .lean()
            .then((docs) => {
                cache = { at: Date.now(), docs };
                return cache.docs;
            })
            .finally(() => { inflight = null; });
    }

    const docs = await inflight;
    return limit > 0 ? docs.slice(0, limit) : docs;
}

/** Call after any write that can change which admins exist. */
function invalidateAdminIds() {
    cache = null;
}

module.exports = { getAdminIds, invalidateAdminIds };