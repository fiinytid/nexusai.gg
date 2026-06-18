import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const SESSION_TTL       = 24 * 60 * 60 * 1_000;
const MAX_LOG_ENTRIES   = 500;
const MAX_HIST_ENTRIES  = 200;
const MAX_USER_HIST     = 100;
const MAX_MENTION       = 100;
const MAX_LOGSVC        = 1_000;
const QUEUE_MAX_AGE     = 30 * 60_000;
const MAX_QUEUE_SIZE    = 300;
const MAX_PRIORITY_Q    = 50;
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

// ── SESSION ────────────────────────────────────────────────────────────────────
export const getSession = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const s = await ctx.db.query("sessions")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (!s) return null;
    if (Date.now() - s.createdAt > SESSION_TTL) return null;
    return s;
  },
});

export const upsertSession = internalMutation({
  args: {
    username:   v.string(),
    token:      v.string(),
    placeId:    v.union(v.string(), v.null()),
    userId:     v.union(v.string(), v.null()),
    createdAt:  v.number(),
    lastSeen:   v.number(),
    reconnects: v.number(),
    cmdCount:   v.number(),
  },
  handler: async (ctx, args) => {
    const ex = await ctx.db.query("sessions")
      .withIndex("by_username", q => q.eq("username", args.username)).first();
    if (ex) {
      await ctx.db.patch(ex._id, {
        token: args.token, placeId: args.placeId, userId: args.userId,
        lastSeen: args.lastSeen, reconnects: args.reconnects, cmdCount: args.cmdCount,
      });
    } else {
      await ctx.db.insert("sessions", args);
    }
  },
});

export const touchSession = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const s = await ctx.db.query("sessions")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (s) await ctx.db.patch(s._id, { lastSeen: Date.now(), cmdCount: (s.cmdCount || 0) + 1 });
  },
});

export const deleteSession = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const s = await ctx.db.query("sessions")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (s) await ctx.db.delete(s._id);
  },
});

export const countActiveSessions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SESSION_TTL;
    const all = await ctx.db.query("sessions").collect();
    return all.filter(s => s.createdAt >= cutoff).length;
  },
});

// ── QUEUE ──────────────────────────────────────────────────────────────────────
export const pushQueueItem = internalMutation({
  args: {
    username:   v.string(),
    payload:    v.string(),
    priority:   v.string(),
    ts:         v.number(),
    isPriority: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.isPriority) {
      const items = await ctx.db.query("queues")
        .withIndex("by_username", q => q.eq("username", args.username))
        .filter(q => q.eq(q.field("isPriority"), true)).collect();
      if (items.length >= MAX_PRIORITY_Q) {
        items.sort((a, b) => a.ts - b.ts);
        await ctx.db.delete(items[0]._id);
      }
    } else {
      const items = await ctx.db.query("queues")
        .withIndex("by_username", q => q.eq("username", args.username))
        .filter(q => q.eq(q.field("isPriority"), false)).collect();
      for (const o of items.filter(c => now - c.ts >= QUEUE_MAX_AGE)) await ctx.db.delete(o._id);
      const remaining = items.filter(c => now - c.ts < QUEUE_MAX_AGE);
      if (remaining.length >= MAX_QUEUE_SIZE) {
        remaining.sort((a, b) => a.ts - b.ts);
        await ctx.db.delete(remaining[0]._id);
      }
    }
    await ctx.db.insert("queues", args);
    return true;
  },
});

export const drainQueueItems = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const now = Date.now();
    const all = await ctx.db.query("queues")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    for (const item of all) await ctx.db.delete(item._id);
    const valid = all.filter(c => c.isPriority || (now - c.ts) < QUEUE_MAX_AGE);
    const prio  = valid.filter(c => c.isPriority).sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      return pa !== pb ? pa - pb : a.ts - b.ts;
    });
    const norm = valid.filter(c => !c.isPriority).sort((a, b) => a.ts - b.ts);
    return [...prio, ...norm].map(c => JSON.parse(c.payload));
  },
});

export const clearQueueItems = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const all = await ctx.db.query("queues")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    for (const item of all) await ctx.db.delete(item._id);
  },
});

export const countQueueItems = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const all = await ctx.db.query("queues")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    return {
      priority: all.filter(c => c.isPriority).length,
      normal:   all.filter(c => !c.isPriority).length,
      total:    all.length,
      oldest:   all.filter(c => !c.isPriority).sort((a,b) => a.ts - b.ts)[0]?.ts ?? null,
    };
  },
});

// ── POLL ───────────────────────────────────────────────────────────────────────
export const getLastPoll = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const p = await ctx.db.query("polls")
      .withIndex("by_username", q => q.eq("username", username)).first();
    return p?.lastPoll ?? 0;
  },
});

export const bumpPoll = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const p = await ctx.db.query("polls")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (p) await ctx.db.patch(p._id, { lastPoll: Date.now() });
    else    await ctx.db.insert("polls", { username, lastPoll: Date.now() });
  },
});

// ── DATA STORE ─────────────────────────────────────────────────────────────────
export const getData = internalQuery({
  args: { username: v.string(), key: v.string() },
  handler: async (ctx, { username, key }) => {
    const d = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", key)).first();
    return d?.value ?? null;
  },
});

export const upsertData = internalMutation({
  args: { username: v.string(), key: v.string(), value: v.string() },
  handler: async (ctx, { username, key, value }) => {
    const ex = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", key)).first();
    if (ex) await ctx.db.patch(ex._id, { value, updatedAt: Date.now() });
    else    await ctx.db.insert("dataStore", { username, key, value, updatedAt: Date.now() });
  },
});

export const deleteData = internalMutation({
  args: { username: v.string(), key: v.string() },
  handler: async (ctx, { username, key }) => {
    const ex = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", key)).first();
    if (ex) await ctx.db.delete(ex._id);
  },
});

// ── SESSION AUDIT ──────────────────────────────────────────────────────────────
export const pushSessionAudit = internalMutation({
  args: { username: v.string(), event: v.string(), data: v.string() },
  handler: async (ctx, { username, event, data }) => {
    await ctx.db.insert("sessionAudits", { username, event, data, ts: Date.now() });
    const all = await ctx.db.query("sessionAudits")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    if (all.length > 100) {
      all.sort((a, b) => a.ts - b.ts);
      for (const d of all.slice(0, all.length - 100)) await ctx.db.delete(d._id);
    }
  },
});

// ── LOGS ───────────────────────────────────────────────────────────────────────
export const pushLog = internalMutation({
  args: {
    action:  v.string(),
    user:    v.optional(v.string()),
    target:  v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", { ...args, ts: Date.now() });
    const all = await ctx.db.query("logs").withIndex("by_ts").order("asc").collect();
    if (all.length > MAX_LOG_ENTRIES) {
      for (const d of all.slice(0, all.length - MAX_LOG_ENTRIES)) await ctx.db.delete(d._id);
    }
  },
});

export const getLogs = internalQuery({
  args: { limit: v.number(), filterUser: v.optional(v.string()) },
  handler: async (ctx, { limit, filterUser }) => {
    let logs = await ctx.db.query("logs").withIndex("by_ts").order("desc").take(MAX_LOG_ENTRIES);
    if (filterUser) logs = logs.filter(l => l.user === filterUser || l.target === filterUser);
    return logs.slice(0, limit);
  },
});

// ── HISTORY ────────────────────────────────────────────────────────────────────
export const pushHistory = internalMutation({
  args: { action: v.string(), details: v.string(), user: v.string(), target: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("history", { ...args, ts: Date.now() });
    const all = await ctx.db.query("history").withIndex("by_ts").order("asc").collect();
    if (all.length > MAX_HIST_ENTRIES) {
      for (const d of all.slice(0, all.length - MAX_HIST_ENTRIES)) await ctx.db.delete(d._id);
    }
  },
});

export const getHistory = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return ctx.db.query("history").withIndex("by_ts").order("desc").take(limit);
  },
});

// ── USER HISTORY ───────────────────────────────────────────────────────────────
export const pushUserHistory = internalMutation({
  args: { username: v.string(), action: v.string(), details: v.string() },
  handler: async (ctx, { username, action, details }) => {
    await ctx.db.insert("userHistory", { username, action, details, ts: Date.now() });
    const all = await ctx.db.query("userHistory")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    if (all.length > MAX_USER_HIST) {
      all.sort((a, b) => a.ts - b.ts);
      for (const d of all.slice(0, all.length - MAX_USER_HIST)) await ctx.db.delete(d._id);
    }
  },
});

export const getUserHistory = internalQuery({
  args: { username: v.string(), limit: v.number() },
  handler: async (ctx, { username, limit }) => {
    const all = await ctx.db.query("userHistory")
      .withIndex("by_username", q => q.eq("username", username)).collect();
    return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
  },
});

// ── GLOBAL STATS ───────────────────────────────────────────────────────────────
export const getGlobalStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("globalStats")
      .withIndex("by_key", q => q.eq("key", "main")).first();
    return s?.value ?? null;
  },
});

export const bumpStats = internalMutation({
  args: { user: v.string(), action: v.string() },
  handler: async (ctx, { user, action }) => {
    const existing = await ctx.db.query("globalStats")
      .withIndex("by_key", q => q.eq("key", "main")).first();
    const s = existing ? JSON.parse(existing.value) : {
      totalCommands: 0, totalUsers: 0, startedAt: Date.now(),
      userStats: {}, popularActions: {},
    };
    s.totalCommands = (s.totalCommands || 0) + 1;
    if (!s.userStats[user]) {
      s.userStats[user] = { commands: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      s.totalUsers = Object.keys(s.userStats).length;
    }
    const us = s.userStats[user];
    us.commands   = (us.commands || 0) + 1;
    us.lastSeen   = Date.now();
    us.lastAction = action.substring(0, 50);
    s.popularActions[action] = (s.popularActions[action] || 0) + 1;
    if (existing) await ctx.db.patch(existing._id, { value: JSON.stringify(s) });
    else          await ctx.db.insert("globalStats", { key: "main", value: JSON.stringify(s) });
  },
});

// ── LOG SERVICE ────────────────────────────────────────────────────────────────
export const pushLogSvc = internalMutation({
  args: { username: v.string(), newLogs: v.string() },
  handler: async (ctx, { username, newLogs }) => {
    const ex = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", "logsvc")).first();
    const existing: unknown[] = ex ? JSON.parse(ex.value) : [];
    const combined = [...JSON.parse(newLogs).slice(0, 100), ...existing].slice(0, MAX_LOGSVC);
    if (ex) await ctx.db.patch(ex._id, { value: JSON.stringify(combined), updatedAt: Date.now() });
    else    await ctx.db.insert("dataStore", { username, key: "logsvc", value: JSON.stringify(combined), updatedAt: Date.now() });
  },
});

// ── MENTIONS ───────────────────────────────────────────────────────────────────
export const pushMention = internalMutation({
  args: { username: v.string(), item: v.string() },
  handler: async (ctx, { username, item }) => {
    const ex = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", "mentions")).first();
    const existing: unknown[] = ex ? JSON.parse(ex.value) : [];
    const combined = [JSON.parse(item), ...existing].slice(0, MAX_MENTION);
    if (ex) await ctx.db.patch(ex._id, { value: JSON.stringify(combined), updatedAt: Date.now() });
    else    await ctx.db.insert("dataStore", { username, key: "mentions", value: JSON.stringify(combined), updatedAt: Date.now() });
  },
});

// ── PLUGIN ERRORS ──────────────────────────────────────────────────────────────
export const pushPluginError = internalMutation({
  args: { username: v.string(), item: v.string() },
  handler: async (ctx, { username, item }) => {
    const ex = await ctx.db.query("dataStore")
      .withIndex("by_username_key", q => q.eq("username", username).eq("key", "plugin_errors")).first();
    const existing: unknown[] = ex ? JSON.parse(ex.value) : [];
    const combined = [JSON.parse(item), ...existing].slice(0, 200);
    if (ex) await ctx.db.patch(ex._id, { value: JSON.stringify(combined), updatedAt: Date.now() });
    else    await ctx.db.insert("dataStore", { username, key: "plugin_errors", value: JSON.stringify(combined), updatedAt: Date.now() });
  },
});

// ── RATE LIMITS ────────────────────────────────────────────────────────────────
export const checkAndIncrRateLimit = internalMutation({
  args: { key: v.string(), kind: v.string(), max: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, kind, max, windowMs }) => {
    const now = Date.now();
    const ex  = await ctx.db.query("rateLimits")
      .withIndex("by_key_kind", q => q.eq("key", key).eq("kind", kind)).first();
    if (!ex || now > ex.reset) {
      const reset = now + windowMs;
      if (ex) await ctx.db.patch(ex._id, { count: 1, reset });
      else    await ctx.db.insert("rateLimits", { key, kind, count: 1, reset });
      return true;
    }
    const newCount = ex.count + 1;
    await ctx.db.patch(ex._id, { count: newCount });
    return newCount <= max;
  },
});

export const checkAndIncrBurst = internalMutation({
  args: { key: v.string(), max: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, max, windowMs }) => {
    const now  = Date.now();
    const kind = "burst";
    const ex   = await ctx.db.query("rateLimits")
      .withIndex("by_key_kind", q => q.eq("key", key).eq("kind", kind)).first();
    if (!ex || now > (ex.windowEnd ?? 0)) {
      const windowEnd = now + windowMs;
      if (ex) await ctx.db.patch(ex._id, { count: 1, windowEnd, reset: windowEnd });
      else    await ctx.db.insert("rateLimits", { key, kind, count: 1, reset: windowEnd, windowEnd });
      return true;
    }
    const newCount = ex.count + 1;
    await ctx.db.patch(ex._id, { count: newCount });
    return newCount <= max;
  },
});

// ── DEDUP ──────────────────────────────────────────────────────────────────────
export const checkAndSetDedup = internalMutation({
  args: { hash: v.string(), windowMs: v.number() },
  handler: async (ctx, { hash, windowMs }) => {
    const now = Date.now();
    const ex  = await ctx.db.query("dedupCache")
      .withIndex("by_hash", q => q.eq("hash", hash)).first();
    if (ex) {
      if (now - ex.ts < windowMs) return true;
      await ctx.db.patch(ex._id, { ts: now });
      return false;
    }
    await ctx.db.insert("dedupCache", { hash, ts: now });
    return false;
  },
});

// ── WEBHOOK ────────────────────────────────────────────────────────────────────
export const getWebhook = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const w = await ctx.db.query("webhooks")
      .withIndex("by_username", q => q.eq("username", username)).first();
    return w ? { url: w.url, updatedAt: w.updatedAt } : null;
  },
});

export const upsertWebhook = internalMutation({
  args: { username: v.string(), url: v.string() },
  handler: async (ctx, { username, url }) => {
    const ex = await ctx.db.query("webhooks")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (ex) await ctx.db.patch(ex._id, { url, updatedAt: Date.now() });
    else    await ctx.db.insert("webhooks", { username, url, updatedAt: Date.now() });
  },
});

export const deleteWebhook = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const ex = await ctx.db.query("webhooks")
      .withIndex("by_username", q => q.eq("username", username)).first();
    if (ex) await ctx.db.delete(ex._id);
  },
});

// ── API CACHE ──────────────────────────────────────────────────────────────────
export const getCacheEntry = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const c = await ctx.db.query("apiCache")
      .withIndex("by_key", q => q.eq("key", key)).first();
    if (!c || Date.now() > c.expiresAt) return null;
    return c.value;
  },
});

export const setCacheEntry = internalMutation({
  args: { key: v.string(), value: v.string(), expiresAt: v.number() },
  handler: async (ctx, { key, value, expiresAt }) => {
    const ex = await ctx.db.query("apiCache")
      .withIndex("by_key", q => q.eq("key", key)).first();
    if (ex) await ctx.db.patch(ex._id, { value, expiresAt });
    else    await ctx.db.insert("apiCache", { key, value, expiresAt });
  },
});