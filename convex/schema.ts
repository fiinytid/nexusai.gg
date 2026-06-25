import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    username:   v.string(),
    token:      v.string(),
    placeId:    v.union(v.string(), v.null()),
    userId:     v.union(v.string(), v.null()),
    createdAt:  v.number(),
    lastSeen:   v.number(),
    reconnects: v.number(),
    cmdCount:   v.number(),
  }).index("by_username", ["username"]),

  queues: defineTable({
    username:   v.string(),
    payload:    v.string(),
    priority:   v.string(),
    ts:         v.number(),
    isPriority: v.boolean(),
  })
    .index("by_username",    ["username"])
    .index("by_username_ts", ["username", "ts"]),

  polls: defineTable({
    username: v.string(),
    lastPoll: v.number(),
  }).index("by_username", ["username"]),

  dataStore: defineTable({
    username:  v.string(),
    key:       v.string(),
    value:     v.string(),
    updatedAt: v.number(),
  }).index("by_username_key", ["username", "key"]),

  sessionAudits: defineTable({
    username: v.string(),
    event:    v.string(),
    data:     v.string(),
    ts:       v.number(),
  }).index("by_username", ["username"]),

  logs: defineTable({
    action:  v.string(),
    user:    v.optional(v.string()),
    target:  v.optional(v.string()),
    details: v.optional(v.string()),
    ts:      v.number(),
  }).index("by_ts", ["ts"]),

  history: defineTable({
    action:  v.string(),
    details: v.string(),
    user:    v.string(),
    target:  v.optional(v.string()),
    ts:      v.number(),
  }).index("by_ts", ["ts"]),

  userHistory: defineTable({
    username: v.string(),
    action:   v.string(),
    details:  v.string(),
    ts:       v.number(),
  }).index("by_username", ["username"]),

  globalStats: defineTable({
    key:   v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  rateLimits: defineTable({
    key:       v.string(),
    kind:      v.string(),
    count:     v.number(),
    reset:     v.number(),
    windowEnd: v.optional(v.number()),
  }).index("by_key_kind", ["key", "kind"]),

  dedupCache: defineTable({
    hash: v.string(),
    ts:   v.number(),
  }).index("by_hash", ["hash"]),

  webhooks: defineTable({
    username:  v.string(),
    url:       v.string(),
    updatedAt: v.number(),
  }).index("by_username", ["username"]),

  apiCache: defineTable({
    key:       v.string(),
    value:     v.string(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),

  aiFeed: defineTable({
    username: v.string(),
    kind:     v.string(),
    summary:  v.string(),
    data:     v.string(),
    ts:       v.number(),
    read:     v.boolean(),
  }).index("by_username_ts", ["username", "ts"]),

  gifs: defineTable({
    username:      v.string(),
    storageId:     v.id("_storage"),
    mime:          v.string(),
    name:          v.string(),
    sizeBytes:     v.number(),
    seen:          v.boolean(),
    usedInPublish: v.optional(v.boolean()),
    createdAt:     v.number(),
  })
    .index("by_username",        ["username", "createdAt"])
    .index("by_username_unseen", ["username", "seen", "createdAt"]),
});