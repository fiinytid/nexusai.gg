// api/control.js — NEXUS AI (SECURE v12 - COMPLETE PRODUCTION)
// ════════════════════════════════════════════════════════════════════════════
// v12 FEATURES:
//   1.  Priority Queue           — critical / high / normal / low levels
//   2.  Command Deduplication    — prevent duplicate commands in queue
//   3.  In-Memory API Cache      — TTL cache for Roblox API calls
//   4.  IP Rate Limiting         — dual-layer: per-IP + per-user
//   5.  Action Aliases           — 50+ aliases for backward-compatibility
//   6.  HMAC Signature Verify    — optional request signing for plugin
//   7.  Multi-Target Support     — send 1 command to multiple users
//   8.  Priority Commands        — critical/high commands bypass normal queue
//   9.  Webhook Support          — POST to external URL on command events
//  10.  Game Info API            — fetch Roblox game info by UniverseId/PlaceId
//  11.  Avatar / User Info API   — fetch Roblox user info (cached)
//  12.  Queue Stats              — per-user queue statistics
//  13.  Action Categories        — organise 200+ actions into categories
//  14.  Batch Expand Server-Side — expand all batch commands before queueing
//  15.  Session Audit Log        — log all session events
//  16.  Per-User Command History — command history per user
//  17.  Plugin Heartbeat Monitor — detect dropped connections accurately
//  18.  Auto Queue Cleanup       — remove commands older than 30 minutes
//  19.  Expanded Docs Index      — 60+ Luau & Roblox documentation entries
//  20.  Structured Health Endpoint — full metrics for monitoring
// ════════════════════════════════════════════════════════════════════════════

import {
  readFileSync, writeFileSync, existsSync,
  unlinkSync, readdirSync, statSync,
} from 'fs';
import crypto from 'crypto';

// ─── VERSION & CONSTANTS ──────────────────────────────────────────────────────
export const REQUIRED_PLUGIN_VERSION = 'V1.2.142';
export const WEB_VERSION             = 'V12.0';
const        API_VERSION             = 'v12';

const TMP                   = '/tmp';
const SESSION_TTL           = 24 * 60 * 60 * 1_000;   // 24 hours
const MAX_QUEUE_SIZE        = 300;
const MAX_PRIORITY_QUEUE    = 50;
const MAX_LOG_ENTRIES       = 500;
const MAX_HIST_ENTRIES      = 200;
const MAX_LOGSVC_ENTRIES    = 1_000;
const MAX_MENTION_ENTRIES   = 100;
const MAX_USER_CMD_HIST     = 100;

// Rate Limiting
const RATE_LIMIT_PER_MIN    = 150;
const RATE_LIMIT_IP_PER_MIN = 300;
const RATE_LIMIT_BURST      = 20;
const BURST_WINDOW_MS       = 5_000;

// Security
const SESSION_TOKEN_MAX_LEN = 128;
const MIN_ADMIN_TOKEN_LEN   = 16;
const MAX_BODY_FIELD_LEN    = 50_000;
const COMMAND_DEDUP_WINDOW  = 500;                     // ms — block identical commands

// Cache TTL (ms)
const CACHE_TOOLBOX_TTL     = 5  * 60_000;             // 5 minutes
const CACHE_ASSET_TTL       = 30 * 60_000;             // 30 minutes
const CACHE_USERINFO_TTL    = 10 * 60_000;             // 10 minutes
const CACHE_GAMEINFO_TTL    = 15 * 60_000;             // 15 minutes

// Queue command max age
const QUEUE_CMD_MAX_AGE     = 30 * 60_000;             // remove commands older than 30 min

// ─── ALLOWED ORIGINS ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://nexusai-roblox.vercel.app',
  'https://nexusai-gg-beta.vercel.app',
  'https://nexusai.gg',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]);

// ─── FILE PATH HELPERS ────────────────────────────────────────────────────────
const f = (prefix, u) => `${TMP}/${prefix}_${san(u)}.json`;

const queueFile        = u => f('nq',       u);
const priorityQFile    = u => f('nqp',      u);
const pollFile         = u => `${TMP}/np_${san(u)}.txt`;
const outFile          = u => f('no',       u);
const wsFile           = u => f('nw',       u);
const scriptFile       = u => f('ns',       u);
const scriptListF      = u => f('nsl',      u);
const scriptLinesF     = u => f('nslv',     u);
const logSvcFile       = u => f('nlg',      u);
const projectFile      = u => f('nprj',     u);
const mentionFile      = u => f('nmention', u);
const searchFile       = u => f('nsearch',  u);
const gameScanFile     = u => f('ngscan',   u);
const descendantsFile  = u => f('ndesc',    u);
const propertiesFile   = u => f('nprop',    u);
const actionListFile   = u => f('nact',     u);
const assetLibFile     = u => f('nasset',   u);
const assetIdFile      = u => f('nassetid', u);
const assetFolderFile  = u => f('nafolder', u);
const themeDataFile    = u => f('ntheme',   u);
const themesListFile   = u => f('nthemes',  u);
const themeAppliedFile = u => f('nthapply', u);
const themeCompareFile = u => f('nthcmp',   u);
const moduleListFile   = u => f('nmodlist', u);
const moduleDeployFile = u => f('nmoddep',  u);
const terrainFile      = u => f('nterrain', u);
const userCmdHistFile  = u => f('nucmdh',   u);
const sessionAuditFile = u => f('nsessaud', u);
const webhookFile      = u => f('nwebhook', u);   // FIX: was WEBHOOK_FILE (uppercase) — caused ReferenceError

const LOG_FILE   = `${TMP}/nexus_log.json`;
const HIST_FILE  = `${TMP}/nexus_hist.json`;
const STATS_FILE = `${TMP}/nexus_global_stats.json`;

// ─── FILE PREFIXES (for stale-file cleanup) ───────────────────────────────────
const FILE_PREFIXES = [
  'nq_', 'nqp_', 'np_', 'no_', 'nw_', 'ns_', 'nsl_', 'nslv_', 'nlg_', 'nprj_',
  'nmention_', 'nsearch_', 'ngscan_', 'ndesc_', 'nprop_', 'nact_',
  'nasset_', 'nassetid_', 'nafolder_', 'ntheme_', 'nthemes_', 'nthapply_',
  'nthcmp_', 'nmodlist_', 'nmoddep_', 'nterrain_', 'nucmdh_', 'nsessaud_', 'nwebhook_',
];

// ─── IN-MEMORY STORES ────────────────────────────────────────────────────────
const sessionStore = new Map();   // username → session
const rateLimits   = new Map();   // username → { count, reset }
const ipRateLimits = new Map();   // ip       → { count, reset }
const burstLimits  = new Map();   // username → { count, windowEnd }
const apiCache     = new Map();   // cacheKey → { data, expiresAt }
const dedupCache   = new Map();   // cmdHash  → timestamp

// ════════════════════════════════════════════════════════════════════════════
// SANITISERS
// ════════════════════════════════════════════════════════════════════════════

function san(user) {
  return (user || 'default')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .toLowerCase()
    .substring(0, 40);
}

function sanStr(str, maxLen = 200) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .substring(0, maxLen);
}

function sanStrSafe(str, maxLen = MAX_BODY_FIELD_LEN) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').substring(0, maxLen);
}

function escapeHtml(str, maxLen = 500) {
  return String(str ?? '').substring(0, maxLen)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

function sanInt(val, def = 0, min = 0, max = 999_999) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function sanObj(val) {
  return (val && typeof val === 'object' && !Array.isArray(val)) ? val : {};
}

function sanArr(val, maxLen = 500) {
  if (!Array.isArray(val)) return [];
  return val.slice(0, maxLen);
}

function sanPriority(val) {
  return ['critical', 'high', 'normal', 'low'].includes(val) ? val : 'normal';
}

// ════════════════════════════════════════════════════════════════════════════
// IN-MEMORY API CACHE
// ════════════════════════════════════════════════════════════════════════════

function cacheGet(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { apiCache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  if (apiCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of apiCache) {
      if (now > v.expiresAt) apiCache.delete(k);
    }
    if (apiCache.size > 400) {
      let count = 0;
      for (const k of apiCache.keys()) {
        if (count++ >= 100) break;
        apiCache.delete(k);
      }
    }
  }
  apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function cacheClear(pattern) {
  if (!pattern) { apiCache.clear(); return; }
  for (const k of apiCache.keys()) {
    if (k.includes(pattern)) apiCache.delete(k);
  }
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of apiCache) {
    if (now > v.expiresAt) apiCache.delete(k);
  }
  for (const [k, v] of dedupCache) {
    if (now - v > COMMAND_DEDUP_WINDOW * 10) dedupCache.delete(k);
  }
}, 5 * 60_000).unref?.();

// ════════════════════════════════════════════════════════════════════════════
// ROBUST JSON PARSER
// ════════════════════════════════════════════════════════════════════════════

function cleanControlChars(text) {
  if (typeof text !== 'string') return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    result += (code >= 32 || code === 9 || code === 10 || code === 13) ? text[i] : ' ';
  }
  return result;
}

function robustJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = cleanControlChars(raw.trim());
  const attempts = [
    () => JSON.parse(cleaned),
    () => JSON.parse(cleaned.replace(/,(\s*[}\]])/g, '$1')),
    () => JSON.parse(cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3')),
    () => JSON.parse(cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
      .replace(/:\s*nil\b/g, ': null')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g, (_, p, k) => `${p}"${k}": `)),
    () => JSON.parse(cleaned
      .replace(/--[^\n]*/g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*[=:](?![=:>]))/g, (_, p, k) => `${p}"${k}": `)
      .replace(/:\s*nil\b/g, ': null')
      .replace(/:\s*true\b/g, ': true')
      .replace(/:\s*false\b/g, ': false')),
  ];
  for (const attempt of attempts) {
    try { return attempt(); } catch (_) {}
  }
  return null;
}

function parseFunctionCallSyntax(text) {
  const commands = [];
  if (!text || typeof text !== 'string') return commands;
  const re = /\b([a-z][a-z0-9_]*)\s*\(\s*\{/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const fnName = match[1];
    if (!VALID_ACTIONS.has(fnName) && !ACTION_ALIASES[fnName]) continue;
    const startIdx = match.index + match[0].length - 1;
    let depth = 0, endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx === -1) continue;
    const bodyStr = text.substring(startIdx, endIdx + 1);
    const jsonStr = cleanControlChars(bodyStr)
      .replace(/--[^\n]*/g, '').replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
      .replace(/:\s*nil\b/g, ': null')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g, (_, p, k) => `${p}"${k}": `);
    const parsed = robustJsonParse(jsonStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const resolvedAction = ACTION_ALIASES[fnName] || fnName;
      if (resolvedAction === 'batch_commands' && Array.isArray(parsed.commands)) {
        for (const sub of parsed.commands) { if (sub?.action) commands.push(sub); }
      } else {
        commands.push({ action: resolvedAction, ...parsed });
      }
    } else if (fnName !== 'batch_commands') {
      commands.push({ action: ACTION_ALIASES[fnName] || fnName });
    }
  }
  return commands;
}

function extractCommandsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const allCommands = [], seen = new Set();

  function addCmd(cmd) {
    if (!cmd?.action) return;
    const key = JSON.stringify(cmd);
    if (!seen.has(key)) { seen.add(key); allCommands.push(cmd); }
  }

  function processItem(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { for (const sub of item) processItem(sub); return; }
    if (!item.action) return;
    if (item.action === 'batch_commands' && Array.isArray(item.commands)) {
      for (const sub of item.commands) { if (sub?.action) addCmd(sub); }
    } else { addCmd(item); }
  }

  const codeBlockRe = /```(?:json|JSON|Json|js|JS|lua|LUA)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = codeBlockRe.exec(text)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    const parsed = robustJsonParse(raw);
    if (parsed) { processItem(parsed); }
    else { for (const c of parseFunctionCallSyntax(raw)) addCmd(c); }
  }

  const textWithoutBlocks = text.replace(/```[\s\S]*?```/g, '');
  for (const c of parseFunctionCallSyntax(textWithoutBlocks)) addCmd(c);

  if (allCommands.length === 0) {
    const jsonRe = /(\{[^`]*"action"\s*:\s*"[^"]+[^`]*?\})/gs;
    while ((m = jsonRe.exec(textWithoutBlocks)) !== null) {
      const p = robustJsonParse(m[1]);
      if (p?.action) processItem(p);
    }
  }
  return allCommands;
}

// ════════════════════════════════════════════════════════════════════════════
// ACTION ALIASES — backward-compatible shortcuts
// ════════════════════════════════════════════════════════════════════════════
const ACTION_ALIASES = {
  // Delete
  'del':               'delete_object',
  'rm':                'delete_object',
  'remove_obj':        'delete_object',
  'remove_object':     'delete_object',
  // Script
  'new_script':        'create_script',
  'add_script':        'create_script',
  'make_script':       'create_script',
  'new_local':         'create_local_script',
  'new_localscript':   'create_local_script',
  'new_module':        'create_module',
  'add_module':        'create_module',
  // Part
  'add_part':          'create_part',
  'make_part':         'create_part',
  'new_part':          'create_part',
  'add_model':         'create_model',
  'make_model':        'create_model',
  // Scan
  'scan':              'scan_workspace',
  'read_workspace':    'scan_workspace',
  'workspace_data':    'scan_workspace',
  // Property
  'set_prop':          'set_property',
  'prop':              'set_property',
  'rename':            'rename_object',
  // GUI
  'gui':               'create_gui',
  'add_gui':           'create_gui',
  'make_frame':        'create_frame',
  'add_frame':         'create_frame',
  'make_button':       'create_text_button',
  'add_button':        'create_text_button',
  'make_label':        'create_text_label',
  'add_label':         'create_text_label',
  'make_textbox':      'create_text_box',
  // Light
  'add_pointlight':    'create_light',
  'add_spotlight':     'create_light',
  'make_light':        'create_light',
  // Effects
  'add_particles':     'create_particle',
  'make_fire':         'create_fire',
  'make_smoke':        'create_smoke',
  // Terrain
  'terrain_fill':      'fill_terrain',
  'fill':              'fill_terrain_block',
  // Group
  'group':             'group_parts',
  'ungroup':           'ungroup_model',
  // Misc
  'clone':             'clone_object',
  'duplicate':         'clone_object',
  'move':              'move_object',
  'rotate':            'rotate_object',
  'resize':            'resize_object',
  'anchor':            'anchor_model',
  'unanchor':          'unanchor_model',
  'find':              'search_instances',
  'search':            'search_instances',
  'mention':           'resolve_mention',
  'ping':              'ping',
  'run':               'run_lua',
  'exec':              'run_lua',
  'execute_text':      'execute_json',
  'batch':             'batch_commands',
  'inject':            'inject_script',
  'quick':             'inject_quick_script',
  'test':              'play_test',
  'playtest':          'play_test',
  'npc':               'create_npc',
  'docs':              'search_docs',
  'toolbox':           'search_toolbox',
  'insert':            'insert_model',
  'weld':              'weld_parts',
  'weld_all':          'weld_model',
};

// ════════════════════════════════════════════════════════════════════════════
// VALID ACTIONS
// ════════════════════════════════════════════════════════════════════════════
const VALID_ACTIONS = new Set([
  // Core
  'none', 'ping', 'get_info', 'get_all_actions', 'echo',
  'message', 'print_output', 'get_output', 'run_lua',
  // Waypoints & History
  'save_waypoint', 'undo', 'redo',
  // Scripts
  'create_script', 'new_script', 'add_script',
  'create_local_script', 'new_local_script',
  'create_module', 'new_module',
  'inject_script', 'batch_inject',
  'edit_script', 'read_script', 'list_scripts',
  'read_script_lines', 'duplicate_script',
  'disable_script', 'enable_script', 'rename_script',
  'delete_script', 'move_script', 'copy_script', 'watch_script',
  // Remotes & Bindables
  'create_remote', 'create_remote_event', 'create_remote_function',
  'create_bindable_event', 'create_bindable_function',
  'create_unreliable_remote', 'batch_remote', 'create_remote_property',
  // Workspace & Scan
  'scan_workspace', 'read_workspace', 'workspace_data', 'request_scan',
  'workspace_stats', 'workspace_tree',
  // Search & Query
  'search_instances', 'search', 'find',
  'resolve_mention', 'mention',
  'get_descendants', 'get_properties',
  'list_children', 'find_by_class', 'count_instances',
  'list_services', 'find_by_tag', 'find_by_attribute',
  // Batch Operations
  'batch_commands', 'batch_modify', 'batch_create', 'batch_rename',
  'batch_set_property', 'batch_parent', 'batch_delete',
  'batch_tag', 'batch_attribute',
  // Parts & Geometry
  'create_part', 'create_wedge', 'create_sphere', 'create_cylinder',
  'create_truss', 'create_corner_wedge',
  'create_mesh', 'create_special_mesh',
  'create_model', 'create_union', 'create_platform', 'create_negative_part',
  // Object Management
  'clone_object', 'clone', 'duplicate',
  'create_folder', 'create_instance', 'create_configuration',
  'parent_to', 'move_to_service',
  'insert_rbx_model', 'load_asset', 'insert_asset',
  // Values
  'create_value', 'create_number_value', 'create_bool_value',
  'create_string_value', 'create_int_value', 'create_object_value',
  'create_color3_value', 'create_vector3_value',
  'create_cframe_value', 'create_ray_value',
  // Transform & Modify
  'modify_part', 'move_object', 'rotate_object', 'resize_object',
  'snap_to_grid', 'align_objects', 'randomize_colors',
  'mirror_object', 'flip_object', 'center_object', 'fit_to_grid',
  // Delete
  'delete_object', 'delete', 'remove',
  'delete_multiple', 'delete_children', 'delete_empty_folders',
  // Group
  'group_parts', 'group', 'ungroup_model', 'ungroup',
  // Anchor
  'anchor_all', 'unanchor_all', 'anchor_model', 'anchor', 'unanchor_model', 'unanchor',
  // Selection & Properties
  'select_object', 'select_multiple', 'deselect_all',
  'set_property', 'set_value', 'copy_properties', 'rename_object',
  'lock_object', 'unlock_object',
  'toggle_visible', 'set_visible', 'set_enabled', 'toggle_anchored',
  'set_attribute', 'get_attribute', 'set_tags',
  // Model Operations
  'set_primary_part', 'scale_model', 'weld_model', 'break_joints',
  'add_collection_tag', 'remove_collection_tag', 'get_tags', 'find_tagged',
  // GUI Elements
  'create_gui', 'create_frame', 'create_scrolling_frame',
  'create_text_label', 'create_text_button', 'create_text_box',
  'create_image_label', 'create_image_button',
  'create_viewport_frame', 'create_canvas_group',
  'create_billboard', 'create_surface_gui',
  'create_proximity_prompt', 'create_click_detector', 'create_selectbox',
  'add_proximity_prompt', 'add_click_detector',
  'add_highlight', 'remove_highlight', 'create_local_player_gui',
  // UI Layouts & Modifiers
  'create_ui_list_layout', 'create_ui_grid_layout',
  'create_ui_table_layout', 'create_ui_page_layout',
  'create_ui_padding', 'create_ui_corner',
  'create_ui_stroke', 'create_ui_gradient',
  'create_ui_aspect_ratio', 'create_ui_size_constraint',
  'create_ui_flex_item', 'create_ui_scale',
  // Welds & Joints
  'weld_parts', 'create_weld', 'create_attachment', 'create_motor6d',
  'create_snap', 'create_glue',
  // Constraints
  'create_constraint', 'create_hinge', 'create_spring', 'create_rope', 'create_rod',
  'create_plane_constraint', 'create_prismatic', 'create_cylindrical',
  'create_ballsocket', 'create_universal', 'create_no_collision',
  'create_align_position', 'create_align_orientation',
  'create_linear_velocity', 'create_angular_velocity',
  'create_torque', 'create_line_force', 'create_vector_force', 'create_body_thrust',
  // Characters & NPCs
  'create_npc', 'create_humanoid', 'modify_humanoid',
  'create_tool', 'create_seat', 'create_vehicle_seat',
  'create_spawn', 'create_team', 'create_animation',
  'create_tycoon_plot', 'create_checkpoint',
  'create_ragdoll', 'create_r6_rig', 'create_r15_rig',
  // Visual Effects
  'create_particle', 'add_particle',
  'create_light', 'add_light', 'add_effect', 'remove_effect',
  'create_fire', 'remove_fire', 'add_fire',
  'create_smoke', 'remove_smoke', 'add_smoke',
  'create_sparkles', 'add_sparkles',
  'create_trail', 'add_trail',
  'create_beam', 'add_beam',
  'create_explosion', 'add_explosion',
  'create_force_field', 'add_force_field',
  'create_selection_box', 'create_selection_sphere', 'create_box_handle_adornment',
  // Audio
  'create_sound', 'add_sound', 'create_sound_group', 'play_sound', 'stop_sound',
  // Decals & Textures
  'place_decal', 'place_texture', 'create_special_decal',
  // Environment
  'set_lighting', 'create_sky', 'remove_sky', 'create_atmosphere',
  // Terrain
  'fill_terrain', 'fill_terrain_block', 'fill_block',
  'fill_terrain_ball', 'fill_ball', 'fill_sphere',
  'fill_terrain_cylinder', 'fill_cylinder',
  'fill_terrain_wedge', 'fill_wedge_terrain',
  'fill_water', 'fill_lava', 'fill_grass', 'fill_rock', 'fill_sand',
  'fill_snow', 'fill_mud', 'fill_ground', 'fill_ice',
  'fill_cobblestone', 'fill_brick', 'fill_basalt', 'fill_slate', 'fill_sandstone',
  'replace_terrain', 'replace_material',
  'smooth_terrain', 'clear_terrain', 'terrain_clear',
  'terraform_flat', 'terraform_hills', 'terraform_crater',
  'terraform_island', 'terraform_mountain',
  'terrain_paint', 'terrain_sculpt', 'terrain_heightmap',
  'create_river', 'create_ocean', 'create_cave', 'create_cliff',
  'list_terrain_materials',
  // World Setup
  'change_baseplate', 'create_water_part', 'set_gravity', 'set_camera',
  'create_door', 'create_window', 'create_stairs', 'create_ramp',
  'create_tree', 'create_rock', 'create_wall', 'create_building', 'create_road',
  'clear_workspace',
  // Play Test
  'play_test', 'run_test', 'stop_test',
  // Project
  'set_project',
  // Logs
  'get_logs',
  // Asset Library & Modules
  'get_asset_library', 'get_assets', 'list_assets',
  'get_module', 'deploy_module', 'list_modules',
  'use_icon_module', 'install_icon', 'deploy_icon', 'install_topbarplus',
  'import_module', 'use_module', 'load_module', 'get_asset_script',
  'use_folder_script', 'use_localscript', 'inject_quick_script',
  'quick_script', 'use_asset_folder_script', 'list_asset_folder',
  'use_asset_decal', 'insert_model',
  // Themes
  'get_theme', 'theme_get', 'theme',
  'set_theme', 'get_studio_theme', 'studio_theme',
  'list_themes', 'theme_list', 'themes',
  'apply_theme', 'theme_apply', 'apply_theme_colors',
  'get_theme_color', 'theme_color',
  'compare_themes', 'theme_compare',
  'preview_theme', 'theme_preview', 'remove_theme_preview',
  // Script Templates
  'create_datastore_script', 'create_leaderstats_script',
  'create_admin_panel', 'create_badge_script', 'create_shop_script',
  'create_sound_manager', 'create_notification_script',
  'setup_topbar', 'create_topbar_button',
  'create_anticheat_script', 'create_loading_screen',
  'create_mobile_controls', 'create_camera_script',
  'create_round_system', 'create_inventory_system', 'create_currency_system',
  // External API (server-side)
  'search_toolbox', 'search_docs',
  'get_game_info', 'get_avatar_info', 'get_user_info', 'validate_asset',
  // Debug
  'debug_info', 'queue_status',
]);

// Admin-only actions (require valid ADMIN_TOKEN)
const ADMIN_ONLY_ACTIONS = new Set([
  'run_lua', 'play_test', 'run_test', 'clear_workspace',
  'delete_object', 'delete', 'remove', 'delete_multiple', 'delete_children',
  'delete_script', 'delete_empty_folders', 'create_anticheat_script',
]);

// Internal plugin callback actions (data FROM plugin → server)
const INTERNAL_ACTIONS = new Set([
  'game_scan', 'workspace_data', 'output_data',
  'script_content', 'script_list', 'script_lines',
  'log_output', 'mention_resolved', 'search_result',
  'descendants', 'object_properties', 'action_list',
  'asset_library', 'asset_id_result', 'asset_folder_list', 'assets_listed',
  'theme_data', 'themes_list', 'theme_applied', 'theme_compare',
  'module_deployed', 'modules_list', 'terrain_materials',
]);

// Action categories for the info endpoint
const ACTION_CATEGORIES = {
  scripting:  ['create_script', 'create_local_script', 'create_module', 'inject_script', 'edit_script', 'read_script', 'list_scripts', 'run_lua'],
  parts:      ['create_part', 'create_wedge', 'create_sphere', 'create_cylinder', 'create_mesh', 'modify_part', 'move_object', 'rotate_object', 'resize_object'],
  gui:        ['create_gui', 'create_frame', 'create_text_label', 'create_text_button', 'create_text_box', 'create_image_label', 'create_billboard'],
  effects:    ['create_particle', 'create_fire', 'create_smoke', 'create_sparkles', 'create_trail', 'create_beam', 'create_light', 'create_sound'],
  terrain:    ['fill_terrain', 'fill_water', 'fill_grass', 'smooth_terrain', 'clear_terrain', 'terraform_flat', 'terraform_hills'],
  templates:  ['create_datastore_script', 'create_leaderstats_script', 'create_admin_panel', 'create_shop_script', 'create_round_system'],
  search:     ['search_toolbox', 'search_docs', 'search_instances', 'find_by_class', 'find_by_tag'],
  info:       ['get_game_info', 'get_avatar_info', 'get_user_info', 'validate_asset', 'scan_workspace'],
};

// ════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

function setSession(username, token, placeId, userId) {
  const u = san(username);
  const existing = sessionStore.get(u);
  sessionStore.set(u, {
    token:      String(token).substring(0, SESSION_TOKEN_MAX_LEN),
    placeId:    placeId ? sanStr(String(placeId), 30) : null,
    userId:     userId  ? sanStr(String(userId),  20) : null,
    createdAt:  existing?.createdAt || Date.now(),
    lastSeen:   Date.now(),
    reconnects: (existing?.reconnects || 0) + (existing ? 1 : 0),
    cmdCount:   existing?.cmdCount   || 0,
  });
  appendSessionAudit(u, 'connect', { placeId, userId });
}

function getSession(username) {
  const s = sessionStore.get(san(username));
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessionStore.delete(san(username));
    return null;
  }
  s.lastSeen = Date.now();
  return s;
}

function touchSession(username) {
  const s = sessionStore.get(san(username));
  if (s) { s.lastSeen = Date.now(); s.cmdCount = (s.cmdCount || 0) + 1; }
}

function getSessionStats(username) {
  const s = getSession(san(username));
  if (!s) return null;
  return {
    hasSession: true,
    placeId:    s.placeId  || null,
    userId:     s.userId   || null,
    ageMs:      Date.now() - s.createdAt,
    lastSeenMs: Date.now() - s.lastSeen,
    reconnects: s.reconnects || 0,
    cmdCount:   s.cmdCount   || 0,
  };
}

// Session expiry cleanup every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionStore) {
    if (now - v.createdAt > SESSION_TTL) {
      appendSessionAudit(k, 'expired', {});
      sessionStore.delete(k);
    }
  }
}, 30 * 60_000).unref?.();

function appendSessionAudit(username, event, data) {
  try {
    const fp  = sessionAuditFile(username);
    let   log = readJson(fp, []);
    log.unshift({ event, ...data, ts: Date.now() });
    if (log.length > 100) log = log.slice(0, 100);
    writeJson(fp, log);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN TOKEN
// ════════════════════════════════════════════════════════════════════════════

function verifyAdminToken(req) {
  const envToken = process.env.ADMIN_TOKEN;
  if (!envToken || envToken === 'nexusadmin2024' || envToken.length < MIN_ADMIN_TOKEN_LEN) return false;
  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim()                             ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');
  if (!candidate) return false;
  try {
    const padLen = 256;
    const a = Buffer.from(candidate.padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(envToken.padEnd(padLen).substring(0, padLen));
    return crypto.timingSafeEqual(a, b) && candidate === envToken;
  } catch (_) { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// HMAC SIGNATURE VERIFICATION (optional — skip if PLUGIN_HMAC_SECRET not set)
// ════════════════════════════════════════════════════════════════════════════

function verifyPluginHmac(req, body) {
  const secret = process.env.PLUGIN_HMAC_SECRET;
  if (!secret || secret.length < 16) return true;
  const sig = (req.headers?.['x-nexus-signature'] || req.headers?.['x-roblox-signature'] || '').trim();
  if (!sig) return true;   // plugin does not yet support signing — allow
  try {
    const payload  = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(sig.padEnd(200).substring(0, 200));
    const b = Buffer.from(expected.padEnd(200).substring(0, 200));
    return crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// SESSION TOKEN VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

function verifySessionToken(username, candidateToken, candidatePlaceId) {
  if (!candidateToken) return 'missing';
  const s = getSession(username);
  if (!s) return 'no_session';
  try {
    const padLen = 256;
    const a = Buffer.from(String(candidateToken).padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(s.token.padEnd(padLen).substring(0, padLen));
    if (!crypto.timingSafeEqual(a, b) || candidateToken !== s.token) return 'invalid';
  } catch (_) { return 'invalid'; }
  if (s.placeId && candidatePlaceId && String(candidatePlaceId) !== s.placeId) return 'place_mismatch';
  return 'ok';
}

// ════════════════════════════════════════════════════════════════════════════
// RATE LIMITING — user + IP + burst
// ════════════════════════════════════════════════════════════════════════════

function checkRateLimit(user, maxPerMin = RATE_LIMIT_PER_MIN) {
  const now = Date.now(), key = san(user);
  if (!rateLimits.has(key)) rateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = rateLimits.get(key);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= maxPerMin;
}

function checkIpRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now(), key = String(ip).substring(0, 45);
  if (!ipRateLimits.has(key)) ipRateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = ipRateLimits.get(key);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= RATE_LIMIT_IP_PER_MIN;
}

function checkBurstLimit(user) {
  const now = Date.now(), key = san(user);
  if (!burstLimits.has(key)) burstLimits.set(key, { count: 0, windowEnd: now + BURST_WINDOW_MS });
  const bl = burstLimits.get(key);
  if (now > bl.windowEnd) { bl.count = 0; bl.windowEnd = now + BURST_WINDOW_MS; }
  return ++bl.count <= RATE_LIMIT_BURST;
}

// Periodic rate-limit map cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits)   { if (now > v.reset     + 60_000) rateLimits.delete(k);   }
  for (const [k, v] of ipRateLimits) { if (now > v.reset     + 60_000) ipRateLimits.delete(k); }
  for (const [k, v] of burstLimits)  { if (now > v.windowEnd + 60_000) burstLimits.delete(k);  }
}, 5 * 60_000).unref?.();

function getClientIp(req) {
  return (req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || '')
    .toString().split(',')[0].trim();
}

// ════════════════════════════════════════════════════════════════════════════
// GENERIC FILE I/O
// ════════════════════════════════════════════════════════════════════════════

function readJson(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJson(filePath, data) {
  try { writeFileSync(filePath, JSON.stringify(data)); return true; } catch (_) { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// PRIORITY QUEUE
// ════════════════════════════════════════════════════════════════════════════

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 };

function getPriorityQueue(u)     { return readJson(priorityQFile(u), []); }
function savePriorityQueue(u, q) { writeJson(priorityQFile(u), q); }

function pushPriorityQueue(u, cmd, priority = 'normal') {
  const q = getPriorityQueue(u);
  q.push({ ...cmd, _priority: priority, _ts: Date.now() });
  if (q.length > MAX_PRIORITY_QUEUE) q.splice(0, q.length - MAX_PRIORITY_QUEUE);
  q.sort((a, b) => {
    const pa = PRIORITY_ORDER[a._priority] ?? 2;
    const pb = PRIORITY_ORDER[b._priority] ?? 2;
    return pa !== pb ? pa - pb : a._ts - b._ts;
  });
  savePriorityQueue(u, q);
}

function drainPriorityQueue(u) {
  const q = getPriorityQueue(u);
  if (q.length === 0) return [];
  savePriorityQueue(u, []);
  return q;
}

// ════════════════════════════════════════════════════════════════════════════
// COMMAND DEDUPLICATION
// ════════════════════════════════════════════════════════════════════════════

function isDuplicateCommand(cmd) {
  const dedupActions = new Set(['delete_object', 'clear_workspace', 'play_test', 'run_lua', 'clear_terrain']);
  if (!dedupActions.has(cmd?.action)) return false;
  const hash = crypto.createHash('md5')
    .update(JSON.stringify({
      action: cmd.action,
      name:   cmd.name,
      code:   (cmd.code || '').substring(0, 100),
    }))
    .digest('hex');
  const lastTime = dedupCache.get(hash);
  if (lastTime && (Date.now() - lastTime) < COMMAND_DEDUP_WINDOW) return true;
  dedupCache.set(hash, Date.now());
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// REGULAR QUEUE
// ════════════════════════════════════════════════════════════════════════════

function getQueue(u)     { return readJson(queueFile(u), []); }
function saveQueue(u, q) { writeJson(queueFile(u), q); }
function clearQueue(u)   { saveQueue(u, []); savePriorityQueue(u, []); }

function pushQueue(u, cmd, priority = 'normal') {
  if (isDuplicateCommand(cmd)) return false;

  // Remove stale commands on every push
  let q = getQueue(u).filter(c => (Date.now() - (c._ts || 0)) < QUEUE_CMD_MAX_AGE);

  if (priority === 'critical' || priority === 'high') {
    pushPriorityQueue(u, cmd, priority);
    return true;
  }

  q.push({ ...cmd, _ts: Date.now() });
  if (q.length > MAX_QUEUE_SIZE) q.splice(0, q.length - MAX_QUEUE_SIZE);
  saveQueue(u, q);
  return true;
}

function drainQueue(u) {
  const pq = drainPriorityQueue(u);
  const nq = getQueue(u).filter(c => (Date.now() - (c._ts || 0)) < QUEUE_CMD_MAX_AGE);
  clearQueue(u);
  return [...pq, ...nq];
}

// ════════════════════════════════════════════════════════════════════════════
// POLL / ONLINE CHECK
// ════════════════════════════════════════════════════════════════════════════

function bumpPoll(u)  { try { writeFileSync(pollFile(u), String(Date.now())); } catch (_) {} }
function lastPoll(u)  { return parseInt(readJson(pollFile(u)) ?? '0') || 0; }
function isOnline(u)  { return (Date.now() - lastPoll(u)) < 8_000; }

// ════════════════════════════════════════════════════════════════════════════
// OUTPUT
// ════════════════════════════════════════════════════════════════════════════

function saveOutput(u, arr) { writeJson(outFile(u), { outputs: sanArr(arr, 200), ts: Date.now() }); }
function getOutputData(u)   { return readJson(outFile(u), { outputs: [] }); }

// ════════════════════════════════════════════════════════════════════════════
// LOGS
// ════════════════════════════════════════════════════════════════════════════

function pushLog(e) {
  try {
    let l = readJson(LOG_FILE, []);
    l.unshift({ ...e, ts: Date.now() });
    if (l.length > MAX_LOG_ENTRIES) l = l.slice(0, MAX_LOG_ENTRIES);
    writeJson(LOG_FILE, l);
  } catch (_) {}
}

function pushHist(e) {
  try {
    let h = readJson(HIST_FILE, []);
    h.unshift({ ...e, ts: Date.now() });
    if (h.length > MAX_HIST_ENTRIES) h = h.slice(0, MAX_HIST_ENTRIES);
    writeJson(HIST_FILE, h);
  } catch (_) {}
}

function pushUserCmdHistory(u, action, details) {
  try {
    let h = readJson(userCmdHistFile(u), []);
    h.unshift({ action, details: sanStr(details || '', 100), ts: Date.now() });
    if (h.length > MAX_USER_CMD_HIST) h = h.slice(0, MAX_USER_CMD_HIST);
    writeJson(userCmdHistFile(u), h);
  } catch (_) {}
}

function getUserCmdHistory(u, limit = 50) {
  return readJson(userCmdHistFile(u), [])
    .slice(0, sanInt(limit, 50, 1, MAX_USER_CMD_HIST));
}

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL STATS
// ════════════════════════════════════════════════════════════════════════════

function getGlobalStats() {
  return readJson(STATS_FILE, {
    totalCommands:  0,
    totalUsers:     0,
    totalSessions:  0,
    startedAt:      Date.now(),
    userStats:      {},
    popularActions: {},
  });
}

function saveGlobalStats(s) { writeJson(STATS_FILE, s); }

function bumpStats(user, action) {
  try {
    const s = getGlobalStats();
    s.totalCommands  = (s.totalCommands  || 0) + 1;
    s.userStats      = s.userStats      || {};
    s.popularActions = s.popularActions || {};

    if (!s.userStats[user]) {
      s.userStats[user] = { commands: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      s.totalUsers       = Object.keys(s.userStats).length;
    }
    const us      = s.userStats[user];
    us.commands   = (us.commands || 0) + 1;
    us.lastSeen   = Date.now();
    us.lastAction = sanStr(action || 'unknown', 50);

    const act = sanStr(action || 'unknown', 50);
    s.popularActions[act] = (s.popularActions[act] || 0) + 1;

    saveGlobalStats(s);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// LOG SERVICE
// ════════════════════════════════════════════════════════════════════════════

function saveLogSvc(u, logs) {
  try {
    const existing = readJson(logSvcFile(u), []);
    const combined = [...sanArr(logs, 100), ...existing].slice(0, MAX_LOGSVC_ENTRIES);
    writeJson(logSvcFile(u), combined);
  } catch (_) {}
}

function getLogSvc(u) { return readJson(logSvcFile(u), []); }

// ════════════════════════════════════════════════════════════════════════════
// DATA HELPERS
// ════════════════════════════════════════════════════════════════════════════

const saveScriptContent  = (u, d) => writeJson(scriptFile(u),       { ...d, _ts: Date.now() });
const getScriptContent   = u      => readJson(scriptFile(u));
const saveScriptList     = (u, d) => writeJson(scriptListF(u),       { ...d, _ts: Date.now() });
const getScriptList      = u      => readJson(scriptListF(u));
const saveScriptLines    = (u, d) => writeJson(scriptLinesF(u),      { ...d, _ts: Date.now() });
const getScriptLines     = u      => readJson(scriptLinesF(u));
const saveMention        = (u, d) => {
  let l = readJson(mentionFile(u), []);
  l.unshift({ ...d, _ts: Date.now() });
  if (l.length > MAX_MENTION_ENTRIES) l = l.slice(0, MAX_MENTION_ENTRIES);
  writeJson(mentionFile(u), l);
};
const getMentions        = u      => readJson(mentionFile(u), []);
const saveSearch         = (u, d) => writeJson(searchFile(u),        { ...d, _ts: Date.now() });
const getSearch          = u      => readJson(searchFile(u));
const saveGameScan       = (u, d) => writeJson(gameScanFile(u),      { ...d, _ts: Date.now() });
const getGameScan        = u      => readJson(gameScanFile(u));
const saveDescendants    = (u, d) => writeJson(descendantsFile(u),   { ...d, _ts: Date.now() });
const getDescendants     = u      => readJson(descendantsFile(u));
const saveProperties     = (u, d) => writeJson(propertiesFile(u),    { ...d, _ts: Date.now() });
const getProperties      = u      => readJson(propertiesFile(u));
const saveActionList     = (u, d) => writeJson(actionListFile(u),    { ...d, _ts: Date.now() });
const getActionList      = u      => readJson(actionListFile(u));
const saveAssetLib       = (u, d) => writeJson(assetLibFile(u),      { ...d, _ts: Date.now() });
const getAssetLib        = u      => readJson(assetLibFile(u));
const saveAssetId        = (u, d) => writeJson(assetIdFile(u),       { ...d, _ts: Date.now() });
const getAssetId         = u      => readJson(assetIdFile(u));
const saveAssetFolder    = (u, d) => writeJson(assetFolderFile(u),   { ...d, _ts: Date.now() });
const getAssetFolder     = u      => readJson(assetFolderFile(u));
const saveThemeData      = (u, d) => writeJson(themeDataFile(u),     { ...d, _ts: Date.now() });
const getThemeData       = u      => readJson(themeDataFile(u));
const saveThemesList     = (u, d) => writeJson(themesListFile(u),    { ...d, _ts: Date.now() });
const getThemesList      = u      => readJson(themesListFile(u));
const saveThemeApplied   = (u, d) => writeJson(themeAppliedFile(u),  { ...d, _ts: Date.now() });
const getThemeApplied    = u      => readJson(themeAppliedFile(u));
const saveThemeCompare   = (u, d) => writeJson(themeCompareFile(u),  { ...d, _ts: Date.now() });
const getThemeCompare    = u      => readJson(themeCompareFile(u));
const saveModuleList     = (u, d) => writeJson(moduleListFile(u),    { ...d, _ts: Date.now() });
const getModuleList      = u      => readJson(moduleListFile(u));
const saveModuleDeploy   = (u, d) => writeJson(moduleDeployFile(u),  { ...d, _ts: Date.now() });
const getModuleDeploy    = u      => readJson(moduleDeployFile(u));
const saveTerrainResult  = (u, d) => writeJson(terrainFile(u),       { ...d, _ts: Date.now() });
const getTerrainResult   = u      => readJson(terrainFile(u));

function saveProject(u, d) {
  writeJson(projectFile(u), {
    projectId:   sanStr(d.projectId   || '', 100),
    projectName: sanStr(d.projectName || '', 100),
    placeId:     sanStr(d.placeId     || '', 50),
    updatedAt:   Date.now(),
  });
}
function getProject(u) {
  return readJson(projectFile(u), { projectId: '', projectName: '', placeId: '', updatedAt: 0 });
}

// Webhook config helpers
function saveWebhook(u, url) {
  if (!url) { try { unlinkSync(webhookFile(u)); } catch (_) {} return; }
  writeJson(webhookFile(u), { url: sanStr(String(url), 300), updatedAt: Date.now() });
}
function getWebhook(u) { return readJson(webhookFile(u), null); }

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOK DISPATCH — fire-and-forget
// ════════════════════════════════════════════════════════════════════════════

async function dispatchWebhook(u, event, data) {
  const wh = getWebhook(u);
  if (!wh?.url) return;
  const url = wh.url;
  if (!url.startsWith('https://')) return;
  try {
    await safeFetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` },
      body:    JSON.stringify({ event, user: u, data, ts: Date.now() }),
    }, 5_000, 0);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
// STALE FILE CLEANUP
// ════════════════════════════════════════════════════════════════════════════

function cleanStaleFiles(maxAgeMs = 3 * 60 * 60 * 1_000) {
  let cleaned = 0;
  try {
    const now = Date.now();
    for (const fname of readdirSync(TMP)) {
      if (!FILE_PREFIXES.some(p => fname.startsWith(p))) continue;
      const fp = `${TMP}/${fname}`;
      try {
        if (now - statSync(fp).mtimeMs > maxAgeMs) { unlinkSync(fp); cleaned++; }
      } catch (_) {}
    }
  } catch (_) {}
  return cleaned;
}

// ════════════════════════════════════════════════════════════════════════════
// SAFE FETCH (with retries + timeout)
// ════════════════════════════════════════════════════════════════════════════

async function safeFetch(url, options = {}, timeoutMs = 10_000, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp  = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (resp.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '2', 10);
        await new Promise(r => setTimeout(r, Math.min(retryAfter * 1_000, 5_000)));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (err?.name === 'AbortError') break;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
    }
  }
  throw lastError || new Error('safeFetch: all retries failed');
}

// ════════════════════════════════════════════════════════════════════════════
// ROBLOX API HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getRobloxApiKey() {
  const key = process.env.ROBLOX_OPEN_CLOUD_KEY || '';
  return key.length >= 20 ? key : null;
}

// ─── Toolbox Search ───────────────────────────────────────────────────────────

async function robloxToolboxSearch(keyword, assetType = 'Model', limit = 10, cursor = null) {
  const cacheKey = `toolbox:${keyword}:${assetType}:${limit}:${cursor || ''}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = getRobloxApiKey();
  if (!apiKey) throw Object.assign(new Error('ROBLOX_OPEN_CLOUD_KEY is not configured.'), { code: 503 });

  const VALID_TYPES = new Set(['Model', 'Plugin', 'Audio', 'Decal', 'Image', 'MeshPart', 'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear']);
  const safeType    = VALID_TYPES.has(assetType) ? assetType : 'Model';
  const safeLimit   = Math.min(Math.max(1, limit), 100);

  const params = new URLSearchParams({
    keyword:   String(keyword).substring(0, 100),
    assetType: safeType,
    limit:     String(safeLimit),
    ...(cursor ? { cursor } : {}),
  });

  let resp;
  try {
    resp = await safeFetch(
      `https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`,
      { method: 'GET', headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` } },
      12_000, 2
    );
  } catch (err) {
    throw Object.assign(new Error(`Failed to connect to Roblox Toolbox API: ${err?.message || 'timeout'}`), { code: 502 });
  }

  if (resp.status === 401 || resp.status === 403)
    throw Object.assign(new Error('Invalid API key. Check ROBLOX_OPEN_CLOUD_KEY.'), { code: resp.status });
  if (resp.status === 429)
    throw Object.assign(new Error('Roblox Toolbox rate limit reached. Try again later.'), { code: 429 });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Roblox Toolbox HTTP ${resp.status}: ${sanStr(errBody, 100)}`), { code: resp.status });
  }

  let data;
  try { data = await resp.json(); } catch (_) {
    throw Object.assign(new Error('Non-JSON response from Roblox Toolbox.'), { code: 502 });
  }

  const rawItems = data.data || data.assets || data.results || [];
  const assets   = rawItems.map(item => ({
    assetId:     String(item.assetId || item.id || ''),
    name:        sanStr(item.name || item.assetName || 'Untitled', 120),
    description: sanStr(item.description || '', 250),
    assetType:   sanStr(item.assetType || safeType, 30),
    creator: {
      name:   sanStr(item.creator?.name || item.creatorName || 'Unknown', 80),
      type:   sanStr(item.creator?.type || 'User', 20),
      userId: String(item.creator?.userId || item.creatorTargetId || ''),
    },
    thumbnail: sanStr(item.thumbnail?.url || item.thumbnailUrl || '', 300),
    updated:   item.updated || item.createdUtc || null,
  })).filter(a => a.assetId);

  const result = { assets, nextCursor: data.nextPageCursor || null, total: data.totalCount || assets.length };
  cacheSet(cacheKey, result, CACHE_TOOLBOX_TTL);
  return result;
}

// ─── Asset Validation ─────────────────────────────────────────────────────────

async function validateAndPrepareAsset(assetId) {
  const id = parseInt(String(assetId).replace(/\D/g, ''), 10);
  if (!id || id <= 0 || id > 99_999_999_999)
    throw Object.assign(new Error(`Invalid asset ID: "${sanStr(String(assetId), 30)}"`), { code: 400 });

  const cacheKey = `asset:${id}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  let assetData = null;
  for (const url of [
    `https://catalog.roblox.com/v1/catalog/items/${id}/details`,
    `https://economy.roblox.com/v2/assets/${id}/details`,
  ]) {
    try {
      const r = await safeFetch(url, { headers: { Accept: 'application/json' } }, 8_000, 1);
      if (r.ok) { assetData = await r.json(); break; }
    } catch (_) {}
  }

  if (!assetData) {
    try {
      const r = await safeFetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        { headers: { Accept: 'application/json' } }, 8_000, 1
      );
      if (r.ok || r.status === 302)
        assetData = { name: `Asset #${id}`, assetType: 'Model', creator: {} };
    } catch (_) {}
  }

  const insertableTypes = new Set(['Model', 'Plugin', 'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear', 'Animation', 'MeshPart', 'Unknown']);

  if (!assetData) {
    const result = {
      valid: true, assetId: String(id), name: `Asset #${id}`,
      assetType: 'Unknown', creator: { name: 'Unknown', type: 'User' },
      isPublic: true, unverified: true, insertable: true,
      insertCommand: buildInsertCommand(id, `Asset #${id}`),
    };
    cacheSet(cacheKey, result, CACHE_ASSET_TTL / 4);
    return result;
  }

  const rawType   = sanStr(assetData.assetType || assetData.itemType || 'Model', 30);
  const assetName = sanStr(assetData.name || `Asset #${id}`, 120);
  const isPublic  = !(assetData.sales === 0 && assetData.isForSale === false);

  const result = {
    valid: true, assetId: String(id), name: assetName,
    description: sanStr(assetData.description || '', 250),
    assetType:   rawType,
    creator: {
      name:   sanStr(assetData.creator?.name || 'Unknown', 80),
      type:   sanStr(assetData.creator?.creatorType || 'User', 20),
      userId: String(assetData.creator?.creatorTargetId || ''),
    },
    isPublic, insertable: insertableTypes.has(rawType),
    insertCommand: buildInsertCommand(id, assetName),
  };
  cacheSet(cacheKey, result, CACHE_ASSET_TTL);
  return result;
}

function buildInsertCommand(assetId, assetName) {
  const safeName = sanStr(String(assetName || 'Asset'), 80)
    .replace(/[^a-zA-Z0-9 _\-]/g, '').trim() || 'Asset';
  return (
    `-- Auto-generated by Nexus AI ${WEB_VERSION}\n` +
    `local IS = game:GetService("InsertService")\n` +
    `local ok, res = pcall(function() return IS:LoadAsset(${assetId}) end)\n` +
    `if ok then\n` +
    `    res.Name = "${safeName}"\n` +
    `    res.Parent = workspace\n` +
    `    print("[NexusAI] Inserted: ${safeName} (${assetId})")\n` +
    `else warn("[NexusAI] Insert failed ${assetId}: " .. tostring(res)) end`
  );
}

// ─── Roblox User Info ─────────────────────────────────────────────────────────

async function fetchRobloxUserInfo(userId) {
  const id = parseInt(String(userId).replace(/\D/g, ''), 10);
  if (!id || id <= 0) throw new Error('Invalid userId');

  const cacheKey = `userinfo:${id}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const resp = await safeFetch(
    `https://users.roblox.com/v1/users/${id}`,
    { headers: { Accept: 'application/json' } },
    8_000, 1
  );
  if (!resp.ok) throw new Error(`Roblox API error: ${resp.status}`);

  const d = await resp.json();
  const result = {
    userId:      id,
    username:    escapeHtml(d.name || ''),
    displayName: escapeHtml(d.displayName || d.name || ''),
    description: sanStr(d.description || '', 300),
    isBanned:    d.isBanned || false,
    created:     d.created  || null,
    avatarUrl:   `https://www.roblox.com/headshot-thumbnail/image?userId=${id}&width=150&height=150&format=png`,
  };
  cacheSet(cacheKey, result, CACHE_USERINFO_TTL);
  return result;
}

// ─── Roblox Game Info ─────────────────────────────────────────────────────────

async function fetchRobloxGameInfo(universeIdOrPlaceId, isPlace = false) {
  const id = parseInt(String(universeIdOrPlaceId).replace(/\D/g, ''), 10);
  if (!id || id <= 0) throw new Error('Invalid universeId/placeId');

  const cacheKey = `gameinfo:${id}:${isPlace}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  let universeId = id;
  if (isPlace) {
    try {
      const r = await safeFetch(
        `https://apis.roblox.com/universes/v1/places/${id}/universe`,
        { headers: { Accept: 'application/json' } }, 8_000, 1
      );
      if (r.ok) {
        const d = await r.json();
        universeId = d.universeId || id;
      }
    } catch (_) {}
  }

  const resp = await safeFetch(
    `https://games.roblox.com/v1/games?universeIds=${universeId}`,
    { headers: { Accept: 'application/json' } }, 8_000, 1
  );
  if (!resp.ok) throw new Error(`Roblox Games API error: ${resp.status}`);

  const d    = await resp.json();
  const game = (d.data || [])[0];
  if (!game) throw new Error('Game not found');

  const result = {
    universeId,
    placeId:        game.rootPlaceId || id,
    name:           sanStr(game.name        || '', 120),
    description:    sanStr(game.description || '', 500),
    creator: {
      name: sanStr(game.creator?.name || '', 80),
      type: sanStr(game.creator?.type || 'User', 20),
    },
    playing:        game.playing        || 0,
    visits:         game.visits         || 0,
    maxPlayers:     game.maxPlayers     || 0,
    favoritedCount: game.favoritedCount || 0,
    isAllGenres:    game.isAllGenres    || false,
    genre:          sanStr(game.genre   || '', 30),
    thumbnailUrl:   `https://www.roblox.com/asset-thumbnail/image?assetId=${game.rootPlaceId || id}&width=768&height=432&format=png`,
  };
  cacheSet(cacheKey, result, CACHE_GAMEINFO_TTL);
  return result;
}

// ─── Luau / Roblox Documentation Search ──────────────────────────────────────

async function searchLuauDocs(query, docType = 'all', limit = 5) {
  const q      = sanStr(query, 150).trim();
  const maxRes = Math.min(Math.max(1, limit), 20);
  if (!q) throw new Error('Query cannot be empty.');

  const cacheKey = `docs:${q}:${docType}:${limit}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  // Try Roblox Creator Docs API first
  try {
    const params = new URLSearchParams({
      query:  q,
      type:   docType === 'all' ? '' : docType,
      limit:  String(maxRes),
      locale: 'en-us',
    });
    const resp = await safeFetch(
      `https://create.roblox.com/api/search/docs?${params}`,
      { headers: { Accept: 'application/json', 'User-Agent': `NexusAI/${WEB_VERSION}` } },
      8_000, 1
    );
    if (resp.ok) {
      const data = await resp.json();
      const raw  = data.results || data.data || [];
      if (raw.length > 0) {
        const result = {
          results: raw.slice(0, maxRes).map(r => ({
            title:    sanStr(r.title    || r.name        || 'No Title',  120),
            url:      sanStr(r.url      || r.path        || '',          300),
            snippet:  sanStr(r.snippet  || r.excerpt     || r.description || '', 300),
            category: sanStr(r.category || r.type        || 'docs',       50),
          })),
          source: 'roblox_creator_docs',
          query:  q,
        };
        cacheSet(cacheKey, result, 10 * 60_000);
        return result;
      }
    }
  } catch (_) {}

  // Local index fallback
  const localIndex = buildLocalDocsIndex();
  const qLower     = q.toLowerCase();
  const tokens     = qLower.split(/\s+/).filter(Boolean);

  const scored = localIndex
    .map(entry => {
      let score = 0;
      const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
      for (const t of tokens) {
        if (haystack.includes(t))                          score += t.length;
        if (entry.title.toLowerCase().startsWith(t))       score += 10;
        if (entry.title.toLowerCase() === t)               score += 20;
      }
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRes);

  if (scored.length === 0) {
    return {
      results: [{ title: 'Roblox Creator Documentation', url: 'https://create.roblox.com/docs', snippet: `No results found for "${q}".`, category: 'fallback' }],
      source: 'local_fallback',
      query:  q,
    };
  }

  const result = {
    results: scored.map(({ score: _s, keywords: _k, ...rest }) => rest),
    source:  'local_index',
    query:   q,
  };
  cacheSet(cacheKey, result, 60 * 60_000);
  return result;
}

function buildLocalDocsIndex() {
  return [
    { title: 'Instance', url: 'https://create.roblox.com/docs/reference/engine/classes/Instance', snippet: 'Base class for all objects. Methods: FindFirstChild, WaitForChild, Destroy, Clone, GetChildren, GetDescendants, IsA.', category: 'api', keywords: 'instance object findfirstchild waitforchild destroy clone getchildren getdescendants parent name classname isa' },
    { title: 'Workspace', url: 'https://create.roblox.com/docs/reference/engine/classes/Workspace', snippet: 'Primary service for all 3D objects. Gravity, CurrentCamera. game:GetService("Workspace") or workspace.', category: 'api', keywords: 'workspace gravity camera service game world 3d' },
    { title: 'BasePart / Part / MeshPart', url: 'https://create.roblox.com/docs/reference/engine/classes/BasePart', snippet: 'Physical part. Properties: Size, Position, CFrame, Anchored, CanCollide, BrickColor, Material, Transparency.', category: 'api', keywords: 'part basepart size position cframe anchored cancollide material transparency brickcolor meshpart union' },
    { title: 'CFrame', url: 'https://create.roblox.com/docs/reference/engine/datatypes/CFrame', snippet: 'Position + rotation. CFrame.new(x,y,z), CFrame.Angles(rx,ry,rz), CFrame.lookAt(pos,target).', category: 'api', keywords: 'cframe position rotation matrix lookvector angles lookat transform right up' },
    { title: 'Vector3', url: 'https://create.roblox.com/docs/reference/engine/datatypes/Vector3', snippet: '3D vector. Vector3.new(x,y,z). X, Y, Z, Magnitude, Unit. Lerp, Dot, Cross.', category: 'api', keywords: 'vector3 xyz magnitude unit lerp dot cross new math direction force' },
    { title: 'Color3', url: 'https://create.roblox.com/docs/reference/engine/datatypes/Color3', snippet: 'RGB colour. Color3.new(r,g,b), Color3.fromRGB(r,g,b). R/G/B values are 0–1.', category: 'api', keywords: 'color3 rgb fromrgb fromhsv colour color' },
    { title: 'UDim2', url: 'https://create.roblox.com/docs/reference/engine/datatypes/UDim2', snippet: 'GUI size/position. UDim2.new(scaleX, offsetX, scaleY, offsetY).', category: 'api', keywords: 'udim2 gui size position scale offset ui frame' },
    { title: 'Script / LocalScript / ModuleScript', url: 'https://create.roblox.com/docs/reference/engine/classes/Script', snippet: 'Script: server-side. LocalScript: client-side. ModuleScript: shared via require().', category: 'api', keywords: 'script localscript modulescript server client source enabled require' },
    { title: 'RemoteEvent & RemoteFunction', url: 'https://create.roblox.com/docs/reference/engine/classes/RemoteEvent', snippet: 'Server–client communication. OnServerEvent, OnClientEvent, FireServer, FireClient, FireAllClients.', category: 'api', keywords: 'remoteevent remotefunction onserverevent onclientevent fireserver fireclient fireallclients invoke' },
    { title: 'BindableEvent & BindableFunction', url: 'https://create.roblox.com/docs/reference/engine/classes/BindableEvent', snippet: 'Script-to-script communication on the same side. Event:Fire(), Event.Event:Connect(). Function:Invoke().', category: 'api', keywords: 'bindableevent bindablefunction fire event connect invoke callback internal' },
    { title: 'Players Service', url: 'https://create.roblox.com/docs/reference/engine/classes/Players', snippet: 'Manage players. PlayerAdded, PlayerRemoving, GetPlayers, LocalPlayer, GetPlayerFromCharacter.', category: 'api', keywords: 'players playeradded playerremoving getplayers localplayer character management' },
    { title: 'DataStoreService', url: 'https://create.roblox.com/docs/reference/engine/classes/DataStoreService', snippet: 'GetDataStore(name). GetAsync, SetAsync, UpdateAsync, RemoveAsync. Always wrap with pcall!', category: 'api', keywords: 'datastore getasync setasync updateasync removeasync save load persistent data' },
    { title: 'TweenService', url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', snippet: 'Create(instance, TweenInfo.new(time), goals). Play, Pause, Cancel, Completed.', category: 'api', keywords: 'tweenservice tween animation tweeninfo play pause cancel smooth easing' },
    { title: 'RunService', url: 'https://create.roblox.com/docs/reference/engine/classes/RunService', snippet: 'Heartbeat, RenderStepped, Stepped. IsServer, IsClient, IsStudio.', category: 'api', keywords: 'runservice heartbeat renderstepped stepped frame loop isserver isclient isstudio' },
    { title: 'UserInputService', url: 'https://create.roblox.com/docs/reference/engine/classes/UserInputService', snippet: 'InputBegan, InputEnded, GetKeysPressed, IsKeyDown, MouseMoved. LocalScript only.', category: 'api', keywords: 'userinputservice input keyboard mouse touch inputbegan inputended keycode' },
    { title: 'CollectionService', url: 'https://create.roblox.com/docs/reference/engine/classes/CollectionService', snippet: 'AddTag, RemoveTag, GetTagged(tag), HasTag, GetTags. Used for modular tag-based systems.', category: 'api', keywords: 'collectionservice tag addtag removetag gettagged hastag modular' },
    { title: 'InsertService', url: 'https://create.roblox.com/docs/reference/engine/classes/InsertService', snippet: 'LoadAsset(assetId) returns a Model. Use pcall. Asset must be public.', category: 'api', keywords: 'insertservice loadasset asset insert model catalog pcall' },
    { title: 'HttpService', url: 'https://create.roblox.com/docs/reference/engine/classes/HttpService', snippet: 'GetAsync, PostAsync, JSONEncode, JSONDecode. Must be enabled in Game Settings.', category: 'api', keywords: 'httpservice getasync postasync http json encode decode webhook api' },
    { title: 'ReplicatedStorage & ServerStorage', url: 'https://create.roblox.com/docs/reference/engine/classes/ReplicatedStorage', snippet: 'ReplicatedStorage: accessible by server and client. ServerStorage: server only.', category: 'api', keywords: 'replicatedstorage serverstorage storage replicate module asset' },
    { title: 'MessagingService', url: 'https://create.roblox.com/docs/reference/engine/classes/MessagingService', snippet: 'Cross-server messaging. PublishAsync(topic, message), SubscribeAsync(topic, callback).', category: 'api', keywords: 'messagingservice cross server publish subscribe topic broadcast' },
    { title: 'MarketplaceService', url: 'https://create.roblox.com/docs/reference/engine/classes/MarketplaceService', snippet: 'PromptProductPurchase, PromptGamePassPurchase, UserOwnsGamePassAsync, GetProductInfo.', category: 'api', keywords: 'marketplaceservice purchase gamepass product prompt owns shop store' },
    { title: 'BadgeService', url: 'https://create.roblox.com/docs/reference/engine/classes/BadgeService', snippet: 'AwardBadge(userId, badgeId), UserHasBadgeAsync(userId, badgeId), GetBadgeInfoAsync.', category: 'api', keywords: 'badgeservice award badge hasbadge getbadgeinfo user' },
    { title: 'Teams Service', url: 'https://create.roblox.com/docs/reference/engine/classes/Teams', snippet: 'game:GetService("Teams"). Create Team with BrickColor. Assign via Player.Team.', category: 'api', keywords: 'teams service team brickcolor player assign color' },
    { title: 'ContextActionService', url: 'https://create.roblox.com/docs/reference/engine/classes/ContextActionService', snippet: 'BindAction(name, fn, createButton, input...). UnbindAction(name). SetTitle, SetImage.', category: 'api', keywords: 'contextactionservice bindaction unbindaction mobile button input touch gamepad' },
    { title: 'PhysicsService', url: 'https://create.roblox.com/docs/reference/engine/classes/PhysicsService', snippet: 'Collision groups. RegisterCollisionGroup, SetPartCollisionGroup, CollisionGroupSetCollidable.', category: 'api', keywords: 'physicsservice collision group register collidable part' },
    { title: 'StarterGui / StarterPlayer', url: 'https://create.roblox.com/docs/reference/engine/classes/StarterGui', snippet: 'StarterGui: initial GUI for players. StarterPlayer: startup scripts. StarterCharacterScripts, StarterPlayerScripts.', category: 'api', keywords: 'startergui starterplayer startercharacterscripts starterplayerscripts gui character' },
    { title: 'ScreenGui / Frame / TextLabel / TextButton / TextBox', url: 'https://create.roblox.com/docs/reference/engine/classes/ScreenGui', snippet: '2D GUI elements. Size, Position, BackgroundColor3, TextColor3, Font, Visible.', category: 'api', keywords: 'screengui frame textlabel textbutton textbox gui udim2 backgroundcolor3 textcolor3 font' },
    { title: 'ImageLabel & ImageButton', url: 'https://create.roblox.com/docs/reference/engine/classes/ImageLabel', snippet: 'Image (rbxassetid://id), ImageColor3, ImageTransparency, ScaleType.', category: 'api', keywords: 'imagelabel imagebutton image rbxassetid scale stretch fit crop' },
    { title: 'BillboardGui & SurfaceGui', url: 'https://create.roblox.com/docs/reference/engine/classes/BillboardGui', snippet: 'GUI attached to a Part. BillboardGui faces the camera. SurfaceGui renders on a surface.', category: 'api', keywords: 'billboardgui surfacegui part attach face camera 3d npc overhead' },
    { title: 'UIListLayout / UIGridLayout', url: 'https://create.roblox.com/docs/reference/engine/classes/UIListLayout', snippet: 'Automatically arrange children. Padding, FillDirection, SortOrder.', category: 'api', keywords: 'uilistlayout uigridlayout layout padding filldir horizontal vertical grid' },
    { title: 'UICorner / UIStroke / UIPadding / UIGradient', url: 'https://create.roblox.com/docs/reference/engine/classes/UICorner', snippet: 'Styling modifiers. UICorner: rounded corners. UIStroke: border. UIPadding: margins. UIGradient.', category: 'api', keywords: 'uicorner uistroke uipadding uigradient corner border margin gradient rounded' },
    { title: 'Humanoid', url: 'https://create.roblox.com/docs/reference/engine/classes/Humanoid', snippet: 'Health, MaxHealth, WalkSpeed, JumpPower. TakeDamage, MoveTo, LoadAnimation. Died, HealthChanged.', category: 'api', keywords: 'humanoid health walkspeed jumpower takedamage moveto loadanimation died npc' },
    { title: 'AnimationTrack', url: 'https://create.roblox.com/docs/reference/engine/classes/AnimationTrack', snippet: 'Humanoid:LoadAnimation(anim). track:Play(), track:Stop(), AdjustSpeed(). Stopped, KeyframeReached.', category: 'api', keywords: 'animation animationtrack play stop loadanimation speed keyframe r15 r6' },
    { title: 'Terrain', url: 'https://create.roblox.com/docs/reference/engine/classes/Terrain', snippet: 'FillBlock(cframe, size, material), FillBall, FillCylinder. ReplaceMaterial. Enum.Material.', category: 'api', keywords: 'terrain fillblock fillball fillcylinder material grass water rock sand smooth' },
    { title: 'Lighting Service', url: 'https://create.roblox.com/docs/reference/engine/classes/Lighting', snippet: 'Ambient, Brightness, ClockTime, FogEnd, FogStart. Children: Sky, Atmosphere, BloomEffect.', category: 'api', keywords: 'lighting ambient brightness clock fog sky atmosphere bloom environment' },
    { title: 'Constraints (Hinge, Spring, Rope)', url: 'https://create.roblox.com/docs/reference/engine/classes/HingeConstraint', snippet: 'Connect parts via Attachments. HingeConstraint, SpringConstraint, RopeConstraint, WeldConstraint.', category: 'api', keywords: 'constraint hinge spring rope rod weld attachment physics joint motor' },
    { title: 'ParticleEmitter / Fire / Smoke', url: 'https://create.roblox.com/docs/reference/engine/classes/ParticleEmitter', snippet: 'ParticleEmitter: Texture, Rate, Lifetime. Fire: Size, Heat. Smoke: Color, Density.', category: 'api', keywords: 'particleemitter fire smoke sparkles trail beam particle vfx' },
    { title: 'Luau — task Library', url: 'https://create.roblox.com/docs/reference/engine/libraries/task', snippet: 'task.wait(n), task.spawn(fn), task.delay(t,fn), task.cancel(thread). More accurate than wait().', category: 'guide', keywords: 'task wait spawn delay cancel coroutine thread async timing yield' },
    { title: 'Luau — Type Checking', url: 'https://create.roblox.com/docs/luau/types', snippet: 'local x: number = 5. Types: string, number, boolean, nil, any. typeof() for runtime check.', category: 'guide', keywords: 'luau type typing annotation number string boolean typeof checking inference' },
    { title: 'Luau — Metatables & OOP', url: 'https://create.roblox.com/docs/luau/metatables', snippet: 'Class.__index = Class. setmetatable({}, Class). Inherit via __index chain.', category: 'guide', keywords: 'metatable oop class object new inherit setmetatable module pattern' },
    { title: 'Luau — pcall & xpcall', url: 'https://create.roblox.com/docs/luau/functions#pcall', snippet: 'pcall(fn, ...) → ok, result. Always use pcall for DataStore, HTTP, InsertService.', category: 'guide', keywords: 'pcall xpcall error handler try catch protection safe' },
    { title: 'Luau — Tables', url: 'https://create.roblox.com/docs/luau/tables', snippet: 'Array: {1,2,3}. Dictionary: {key="val"}. ipairs, pairs. table.insert/remove/find/sort.', category: 'guide', keywords: 'table array dictionary ipairs pairs insert remove find sort length data structure' },
    { title: 'Luau — String Library', url: 'https://create.roblox.com/docs/luau/string', snippet: 'string.format, sub, find, match, gsub, split, upper, lower, len, tostring.', category: 'guide', keywords: 'string format sub find match gsub split upper lower len concat' },
    { title: 'Luau — Math Library', url: 'https://create.roblox.com/docs/luau/math', snippet: 'math.floor, ceil, round, abs, max, min, random, sqrt, sin, cos, tan, pi, huge, clamp.', category: 'guide', keywords: 'math floor ceil round abs max min random sqrt sin cos tan pi huge clamp' },
    { title: 'DataStore — Best Practices', url: 'https://create.roblox.com/docs/cloud/open-cloud/data-store-api-handling', snippet: 'Always pcall. UpdateAsync is safer than SetAsync. Retry with exponential backoff. SessionLocking.', category: 'guide', keywords: 'datastore best practice updateasync retry session lock save load player data' },
    { title: 'Remote Events — Best Practices', url: 'https://create.roblox.com/docs/scripting/events/remote', snippet: 'Always validate input on the server. Never trust client data. Use RemoteFunction sparingly.', category: 'guide', keywords: 'remote event best practice security validate server client trust exploit' },
    { title: 'ProfileService (3rd party)', url: 'https://github.com/MadStudioRoblox/ProfileService', snippet: 'Popular DataStore library. ProfileStore:LoadProfileAsync(key). Profile:Get/Set. Session-locked.', category: 'guide', keywords: 'profileservice datastore third party library load save session lock popular' },
    { title: 'Knit Framework', url: 'https://sleitnick.github.io/Knit/', snippet: 'Roblox framework. Knit.CreateService, Knit.CreateController. Automatic server/client communication.', category: 'guide', keywords: 'knit framework service controller roblox architecture module' },
    { title: 'Enum Reference', url: 'https://create.roblox.com/docs/reference/engine/enums', snippet: 'Enum.Material, Enum.KeyCode, Enum.Font, Enum.SortOrder, Enum.HorizontalAlignment. Use Enum.X.Y.', category: 'api', keywords: 'enum material keycode font sortorder horizontal vertical alignment fill direction' },
    { title: 'Attributes API', url: 'https://create.roblox.com/docs/scripting/attributes', snippet: 'instance:SetAttribute(name, value). GetAttribute(name). GetAttributes(). AttributeChanged event.', category: 'api', keywords: 'attribute setattribute getattribute getattributes attributechanged metadata' },
    { title: 'Roblox Signals & Events', url: 'https://create.roblox.com/docs/scripting/events/bindable', snippet: 'Connect(fn), Once(fn), Wait(). Disconnect via connection:Disconnect(). RBXScriptConnection.', category: 'api', keywords: 'signal event connect once wait disconnect rbxscriptconnection' },
    { title: 'ProximityPrompt', url: 'https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt', snippet: 'ActionText, ObjectText, HoldDuration, MaxActivationDistance. Triggered event. TriggerEnded.', category: 'api', keywords: 'proximityprompt interact trigger hold distance action text' },
    { title: 'PathfindingService', url: 'https://create.roblox.com/docs/reference/engine/classes/PathfindingService', snippet: 'CreatePath(), ComputeAsync(start, end), GetWaypoints(). AgentParameters: radius, height, jumpHeight.', category: 'api', keywords: 'pathfinding npc navigation ai moveto waypoints compute agent' },
    { title: 'ReplicaService (3rd party)', url: 'https://madstudioroblox.github.io/ReplicaService/', snippet: 'State replication library. ReplicaServer, ReplicaController. State changes auto-reflected to client.', category: 'guide', keywords: 'replicaservice replica state replication library server client sync' },
    { title: 'Spring Module', url: 'https://devforum.roblox.com/t/spring-module/237126', snippet: 'Physics spring animation. Spring.new(mass, force, damping, speed). Spring:shove(vector).', category: 'guide', keywords: 'spring module animation camera sway bob damping mass physics' },
    { title: 'TweenInfo', url: 'https://create.roblox.com/docs/reference/engine/datatypes/TweenInfo', snippet: 'TweenInfo.new(Time, EasingStyle, EasingDirection, RepeatCount, Reverses, DelayTime).', category: 'api', keywords: 'tweeninfo time easingstyle easingdirection repeat reverses delay linear quad' },
    { title: 'Enum.EasingStyle', url: 'https://create.roblox.com/docs/reference/engine/enums/EasingStyle', snippet: 'Linear, Quad, Cubic, Quart, Quint, Sine, Exponential, Circular, Elastic, Back, Bounce.', category: 'api', keywords: 'easingstyle linear quad cubic sine elastic bounce back tween animation' },
    { title: 'SoundService', url: 'https://create.roblox.com/docs/reference/engine/classes/SoundService', snippet: 'PlayLocalSound, GetListener, SetListener. AmbientReverb, DistanceFactor, RolloffScale.', category: 'api', keywords: 'soundservice sound audio music ambient reverb listener' },
    { title: 'Camera API', url: 'https://create.roblox.com/docs/reference/engine/classes/Camera', snippet: 'Workspace.CurrentCamera. CameraType, CFrame, FieldOfView, ViewportSize. GetPartsObscuringTarget.', category: 'api', keywords: 'camera cameratype cframe fov viewport follow track scriptable custom' },
    { title: 'MemoryStoreService', url: 'https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService', snippet: 'Fast temporary per-server storage. GetSortedMap, GetQueue. SetAsync, GetAsync. Max TTL 45 days.', category: 'api', keywords: 'memorystoreservice fast cache temporary sorted map queue cross server' },
    { title: 'roblox-ts (TypeScript for Roblox)', url: 'https://roblox-ts.com/', snippet: 'TypeScript for Roblox. npm install. tsconfig.json. types: @rbxts/types. rbxtsc compile.', category: 'guide', keywords: 'typescript roblox-ts ts npm compile types rbxts' },
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION
// ════════════════════════════════════════════════════════════════════════════

function authorizeCommand(req, senderUser, targetUser, action) {
  const isAdmin = verifyAdminToken(req);
  if (isAdmin) return { ok: true };

  if (senderUser !== targetUser)
    return { ok: false, status: 403, error: 'Forbidden: You can only target your own session.' };

  if (action && ADMIN_ONLY_ACTIONS.has(action))
    return { ok: false, status: 403, error: `Forbidden: "${escapeHtml(action, 60)}" requires an Admin Token.` };

  const candidate =
    (req.headers?.['x-session-token'] || '').trim() ||
    (req.body?._session_token ? String(req.body._session_token).trim() : '');

  if (!candidate) return { ok: true };

  const placeId = req.body?._place_id ? sanStr(String(req.body._place_id), 30) : null;
  const result  = verifySessionToken(targetUser, candidate, placeId);

  switch (result) {
    case 'ok':             return { ok: true };
    case 'no_session':     return { ok: true };
    case 'place_mismatch': return { ok: false, status: 403, error: 'PlaceId mismatch.' };
    default:               return { ok: false, status: 401, error: 'Invalid session token.' };
  }
}

function filterSafeBatch(commands, isAdmin) {
  if (isAdmin) return { safe: commands, removed: [] };
  const safe = [], removed = [];
  for (const cmd of sanArr(commands, 200)) {
    if (ADMIN_ONLY_ACTIONS.has(cmd?.action)) removed.push(sanStr(cmd.action, 50));
    else safe.push(cmd);
  }
  return { safe, removed };
}

// ════════════════════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ════════════════════════════════════════════════════════════════════════════

function setSecurityHeaders(req, res) {
  const origin = req.headers?.['origin'] || '';
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGINS.has(origin) ? origin : (origin ? 'null' : '*'));
  res.setHeader('Vary',                          'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Session-Token,' +
    ' X-Nexus-Nonce, X-Roblox-Signature, X-Nexus-Signature');
  res.setHeader('Access-Control-Max-Age',       '86400');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  res.setHeader('X-Frame-Options',              'DENY');
  res.setHeader('X-XSS-Protection',             '1; mode=block');
  res.setHeader('Referrer-Policy',              'strict-origin-when-cross-origin');
  res.setHeader('X-Nexus-Version',              WEB_VERSION);
  res.setHeader('X-Api-Version',                API_VERSION);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
    setSecurityHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET')     return await handleGet(req, res);
    if (req.method === 'POST')    return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed.', allowed: ['GET', 'POST', 'OPTIONS'] });
  } catch (err) {
    console.error('[NEXUS v12] Unhandled error:', err?.message || err);
    try {
      return res.status(500).json({
        status:  'error',
        error:   'Internal server error.',
        message: sanStr(String(err?.message || 'Unknown'), 200),
        version: WEB_VERSION,
        ts:      Date.now(),
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handleGet(req, res) {
  const q = req.query || {};

  // ── Version Info ──────────────────────────────────────────────────────────
  if (q.version === '1') {
    return res.status(200).json({
      ok:                      true,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      api_version:             API_VERSION,
      update_url:              'https://discord.gg/FzAF48mvK5',
      changelog:               `v12.0 — Priority queue, IP rate limiting, API cache, HMAC, multi-target, action aliases, 60+ docs`,
      v12_features: [
        'Priority Queue (critical / high / normal / low)',
        'Command Deduplication (prevent accidental duplicates)',
        'In-Memory API Cache (Toolbox 5min, Asset 30min, UserInfo 10min)',
        'IP Rate Limiting (300/min per IP)',
        'Burst Protection (20 cmd / 5 sec)',
        'HMAC Signature Verification (optional)',
        'Multi-Target Command Support',
        'Webhook Notifications (per-user)',
        'Action Aliases (50+ shortcuts)',
        'Per-User Command History',
        'Session Audit Log',
        'Game Info API',
        'User / Avatar Info API (cached)',
        'Auto Queue Cleanup (>30 min old commands removed)',
        'Structured Health Endpoint',
        'Popular Actions Analytics',
        'Action Categories',
        '60+ Luau/Roblox Docs Index Entries',
        '200+ Valid Actions',
      ],
      valid_actions_count:  VALID_ACTIONS.size,
      action_aliases_count: Object.keys(ACTION_ALIASES).length,
      admin_only_actions:   [...ADMIN_ONLY_ACTIONS],
      action_categories:    Object.keys(ACTION_CATEGORIES),
      security_model: {
        session_token:  'Plugin generates token on connect',
        self_only:      'Non-admin can only target own session',
        place_binding:  'Session locked to placeId',
        ip_rate_limit:  `${RATE_LIMIT_IP_PER_MIN}/min per IP`,
        user_rate_limit:`${RATE_LIMIT_PER_MIN}/min per user`,
        burst_limit:    `${RATE_LIMIT_BURST} cmd per ${BURST_WINDOW_MS}ms`,
        hmac:           'Optional X-Nexus-Signature HMAC-SHA256',
        cors:           'Strict whitelist for browser origins',
        dedup:          `${COMMAND_DEDUP_WINDOW}ms deduplication for destructive actions`,
      },
    });
  }

  // ── Health Check ──────────────────────────────────────────────────────────
  if (q.health === '1') {
    const s    = getGlobalStats();
    const upMs = Date.now() - (s.startedAt || Date.now());
    return res.status(200).json({
      ok:                      true,
      status:                  'healthy',
      web_version:             WEB_VERSION,
      api_version:             API_VERSION,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      uptime:                  upMs,
      uptimeHuman:             `${Math.floor(upMs / 3600000)}h ${Math.floor((upMs % 3600000) / 60000)}m`,
      totalCommands:           s.totalCommands    || 0,
      totalUsers:              s.totalUsers       || 0,
      activeSessions:          sessionStore.size,
      cacheSize:               apiCache.size,
      dedupCacheSize:          dedupCache.size,
      popularActions:          Object.entries(s.popularActions || {})
        .sort(([, a], [, b]) => b - a).slice(0, 10)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
      ts: Date.now(),
    });
  }

  // ── Roblox User Info ──────────────────────────────────────────────────────
  if (q.userinfo === '1') {
    const uid = parseInt(q.userId || '0', 10);
    if (!uid || uid <= 0 || uid > 9_999_999_999)
      return res.status(400).json({ ok: false, error: 'Invalid userId.' });
    try {
      const info = await fetchRobloxUserInfo(uid);
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return res.status(502).json({ ok: false, error: sanStr(e?.message || 'Failed to fetch user info.', 100) });
    }
  }

  // ── Roblox Game Info ──────────────────────────────────────────────────────
  if (q.gameinfo === '1') {
    const isPlace = q.type === 'place';
    const id      = parseInt(q.id || '0', 10);
    if (!id) return res.status(400).json({ ok: false, error: 'Parameter "id" is required.' });
    try {
      const info = await fetchRobloxGameInfo(id, isPlace);
      return res.status(200).json({ ok: true, ...info });
    } catch (e) {
      return res.status(502).json({ ok: false, error: sanStr(e?.message || 'Failed to fetch game info.', 100) });
    }
  }

  // ── Connection Check ──────────────────────────────────────────────────────
  if (q.check != null) {
    const u    = san(q.user || '');
    const s    = getGlobalStats();
    const sess = getSession(u);
    const qLen = getQueue(u).length + getPriorityQueue(u).length;
    return res.status(200).json({
      connected:               isOnline(u),
      online:                  isOnline(u),
      _pluginConnected:        isOnline(u),
      _lastPoll:               lastPoll(u),
      user:                    u,
      queueLength:             qLen,
      sessionStats:            getSessionStats(u),
      hasSession:              !!sess,
      placeId:                 sess?.placeId || null,
      userId:                  sess?.userId  || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(u),
      globalStats: { totalCommands: s.totalCommands || 0, totalUsers: s.totalUsers || 0 },
    });
  }

  // ── Cache Management (admin only) ─────────────────────────────────────────
  if (q.clear_cache != null) {
    if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Admin token required.' });
    cacheClear(q.pattern || null);
    return res.status(200).json({ ok: true, message: 'Cache cleared.', pattern: q.pattern || null, ts: Date.now() });
  }

  const gu = san(q.user || '');

  // ── Data Getters ──────────────────────────────────────────────────────────
  if (q.get_project       != null) return res.status(200).json({ ok: true, ...getProject(gu) });
  if (q.get_output        != null) return res.status(200).json(getOutputData(gu));
  if (q.get_workspace     != null) { const d = getGameScan(gu) || readJson(wsFile(gu)); return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No data available.' }); }
  if (q.get_script        != null) { const d = getScriptContent(gu); return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No script available.' }); }
  if (q.get_script_list   != null) { const d = getScriptList(gu);    return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No list available.' }); }
  if (q.get_script_lines  != null) { const d = getScriptLines(gu);   return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No lines available.' }); }
  if (q.get_mentions      != null) { const m = getMentions(gu);      return res.status(200).json({ ok: true, mentions: m, count: m.length }); }
  if (q.get_search        != null) { const d = getSearch(gu);        return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No results available.' }); }
  if (q.get_game_scan     != null) { const d = getGameScan(gu);      return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No scan data.' }); }
  if (q.get_descendants   != null) { const d = getDescendants(gu);   return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No descendants data.' }); }
  if (q.get_properties    != null) { const d = getProperties(gu);    return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No properties data.' }); }
  if (q.get_action_list   != null) { const d = getActionList(gu);    return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No action list.' }); }
  if (q.get_asset_lib     != null) { const d = getAssetLib(gu);      return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No asset library.' }); }
  if (q.get_asset_id      != null) { const d = getAssetId(gu);       return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No asset id.' }); }
  if (q.get_asset_folder  != null) { const d = getAssetFolder(gu);   return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No folder data.' }); }
  if (q.get_theme_data    != null) { const d = getThemeData(gu);     return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No theme data.' }); }
  if (q.get_themes_list   != null) { const d = getThemesList(gu);    return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No themes list.' }); }
  if (q.get_theme_applied != null) { const d = getThemeApplied(gu);  return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No applied theme.' }); }
  if (q.get_theme_compare != null) { const d = getThemeCompare(gu);  return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No compare data.' }); }
  if (q.get_module_list   != null) { const d = getModuleList(gu);    return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No module list.' }); }
  if (q.get_module_deploy != null) { const d = getModuleDeploy(gu);  return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No deploy data.' }); }
  if (q.get_terrain       != null) { const d = getTerrainResult(gu); return d ? res.status(200).json({ ok: true, ...d }) : res.status(200).json({ ok: false, error: 'No terrain data.' }); }

  // ── Command History ───────────────────────────────────────────────────────
  if (q.get_cmd_history != null) {
    const limit = sanInt(q.limit, 50, 1, MAX_USER_CMD_HIST);
    return res.status(200).json({ ok: true, history: getUserCmdHistory(gu, limit), user: gu });
  }

  // ── Queue Stats ───────────────────────────────────────────────────────────
  if (q.queue_stats != null) {
    const nq = getQueue(gu);
    const pq = getPriorityQueue(gu);
    return res.status(200).json({
      ok:            true,
      user:          gu,
      normalQueue:   nq.length,
      priorityQueue: pq.length,
      total:         nq.length + pq.length,
      oldest:        nq[0]?._ts ? Date.now() - nq[0]._ts : null,
      pluginOnline:  isOnline(gu),
    });
  }

  // ── Log Service ───────────────────────────────────────────────────────────
  if (q.get_logsvc != null) {
    const logs  = getLogSvc(gu);
    const since = sanInt(q.since, 0, 0, Number.MAX_SAFE_INTEGER);
    const level = q.level || null;
    let result  = since ? logs.filter(l => (l.ts || 0) > since) : logs;
    if (level) result = result.filter(l => l.level === level || l.type === level);
    return res.status(200).json({ ok: true, logs: result, count: result.length });
  }

  // ── Admin: Logs & Stats ───────────────────────────────────────────────────
  if (q.get_logs != null) {
    if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Admin token required.' });
    const logs   = readJson(LOG_FILE, []);
    const limit  = sanInt(q.limit, 100, 1, MAX_LOG_ENTRIES);
    const filter = q.filter_user ? san(q.filter_user) : null;
    const result = filter ? logs.filter(l => l.user === filter || l.target === filter) : logs;
    return res.status(200).json({ ok: true, logs: result.slice(0, limit), count: result.length });
  }

  if (q.get_history != null) {
    if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Admin token required.' });
    const hist  = readJson(HIST_FILE, []);
    const limit = sanInt(q.limit, 50, 1, MAX_HIST_ENTRIES);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit), count: hist.length });
  }

  if (q.get_stats != null) {
    const s = getGlobalStats();
    return res.status(200).json({
      ok:             true,
      totalCommands:  s.totalCommands  || 0,
      totalUsers:     s.totalUsers     || 0,
      totalSessions:  s.totalSessions  || 0,
      startedAt:      s.startedAt      || 0,
      uptime:         Date.now() - (s.startedAt || Date.now()),
      activeSessions: sessionStore.size,
      popularActions: Object.entries(s.popularActions || {})
        .sort(([, a], [, b]) => b - a).slice(0, 20)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
    });
  }

  if (q.clear_queue != null) {
    if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Admin token required.' });
    const u = san(q.user || '');
    if (!u) return res.status(400).json({ ok: false, error: '"user" is required.' });
    clearQueue(u);
    return res.status(200).json({ ok: true, message: 'Queue cleared.', user: u });
  }

  if (q.get_actions != null) {
    return res.status(200).json({
      ok:                true,
      actions:           [...VALID_ACTIONS],
      count:             VALID_ACTIONS.size,
      admin_only:        [...ADMIN_ONLY_ACTIONS],
      categories:        ACTION_CATEGORIES,
      aliases:           ACTION_ALIASES,
      aliases_count:     Object.keys(ACTION_ALIASES).length,
    });
  }

  if (q.cleanup === '1') {
    if (!verifyAdminToken(req)) return res.status(401).json({ ok: false, error: 'Admin token required.' });
    const maxAge = sanInt(q.max_age, 3 * 3600, 60, 86400) * 1_000;
    return res.status(200).json({ ok: true, cleaned: cleanStaleFiles(maxAge) });
  }

  // ── Plugin Polling (default GET) ──────────────────────────────────────────
  const pu = san(q.user || q.u || '');
  if (!pu) return res.status(400).json({ error: '"user" is required.', queue: [] });

  if (q.session_token) {
    const token   = sanStr(String(q.session_token), SESSION_TOKEN_MAX_LEN).trim();
    const placeId = q.place_id ? sanStr(String(q.place_id), 30) : null;
    const userId  = q.user_id  ? sanStr(String(q.user_id),  20) : null;
    if (token.length >= 16) setSession(pu, token, placeId, userId);
  } else {
    touchSession(pu);
  }

  bumpPoll(pu);

  const queue = drainQueue(pu);
  const proj  = getProject(pu);

  return res.status(200).json({
    queue,
    count:                   queue.length,
    priorityCount:           queue.filter(c => c._priority === 'critical' || c._priority === 'high').length,
    required_plugin_version: REQUIRED_PLUGIN_VERSION,
    web_version:             WEB_VERSION,
    api_version:             API_VERSION,
    currentProject:          proj,
    projectId:               proj.projectId   || '',
    projectName:             proj.projectName || '',
    placeId:                 proj.placeId     || '',
    ts:                      Date.now(),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handlePost(req, res) {
  const body    = req.body || {};
  const ip      = getClientIp(req);
  const ratUser = san(body._user || body.user || 'anon');

  if (!checkIpRateLimit(ip))
    return res.status(429).json({ status: 'error', error: 'IP rate limit reached.', retryAfter: 60 });

  if (!checkRateLimit(ratUser))
    return res.status(429).json({ status: 'error', error: `Rate limit: max ${RATE_LIMIT_PER_MIN} req/min.`, retryAfter: 60 });

  if (!checkBurstLimit(ratUser))
    return res.status(429).json({ status: 'error', error: `Burst limit: max ${RATE_LIMIT_BURST} cmd per 5 seconds.`, retryAfter: 5 });

  if (!verifyPluginHmac(req, body))
    return res.status(401).json({ status: 'error', error: 'Invalid HMAC signature.', hint: 'Check PLUGIN_HMAC_SECRET.' });

  const actionType     = sanStr(body.action || body.type || '', 80);
  const u              = san(body._user || '');
  const resolvedAction = ACTION_ALIASES[actionType] || actionType;

  // ── Reset Queue ───────────────────────────────────────────────────────────
  if (resolvedAction === 'reset') {
    const target = san(body._user || body.user || '');
    if (!target) return res.status(400).json({ error: '"user" is required.' });
    const auth = authorizeCommand(req, ratUser, target, null);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    clearQueue(target);
    return res.status(200).json({ status: 'ok', message: 'Queue reset.', user: target });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (resolvedAction === 'status') {
    const target = san(body._user || body.user || '');
    const sess   = getSession(target);
    const nq     = getQueue(target);
    const pq     = getPriorityQueue(target);
    return res.status(200).json({
      connected:               isOnline(target),
      online:                  isOnline(target),
      lastPoll:                lastPoll(target),
      queueLength:             nq.length + pq.length,
      priorityQueue:           pq.length,
      normalQueue:             nq.length,
      sessionStats:            getSessionStats(target),
      hasSession:              !!sess,
      placeId:                 sess?.placeId || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:             WEB_VERSION,
      currentProject:          getProject(target),
    });
  }

  // ── Set Project ───────────────────────────────────────────────────────────
  if (resolvedAction === 'set_project') {
    if (!u) return res.status(400).json({ error: '"user" is required.' });
    const auth = authorizeCommand(req, ratUser, u, 'set_project');
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const projectId   = sanStr(body.projectId   || body.project_id   || '', 100);
    const projectName = sanStr(body.projectName || body.project_name || '', 100);
    const placeId     = sanStr(body.placeId     || body.place_id     || '', 50);
    saveProject(u, { projectId, projectName, placeId });
    pushLog({ action: 'set_project', user: u, projectId, projectName, placeId });
    return res.status(200).json({ status: 'ok', projectId, projectName, placeId });
  }

  // ── Set Webhook ───────────────────────────────────────────────────────────
  if (resolvedAction === 'set_webhook') {
    if (!u) return res.status(400).json({ error: '"user" is required.' });
    const auth = authorizeCommand(req, ratUser, u, null);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const webhookUrl = body.url ? sanStr(String(body.url), 300) : null;
    if (webhookUrl && !webhookUrl.startsWith('https://'))
      return res.status(400).json({ error: 'Webhook URL must use HTTPS.' });
    saveWebhook(u, webhookUrl);
    return res.status(200).json({ status: 'ok', webhookSet: !!webhookUrl, user: u });
  }

  // ── Multi-Target Command (admin only) ─────────────────────────────────────
  if (resolvedAction === 'multi_target' && Array.isArray(body.targets)) {
    if (!verifyAdminToken(req))
      return res.status(401).json({ error: 'Admin token required for multi_target.' });
    const targets  = sanArr(body.targets, 20).map(t => san(String(t)));
    const cmd      = sanObj(body.command);
    const act      = sanStr(cmd.action || '', 80);
    const priority = sanPriority(body.priority);
    if (!act || !VALID_ACTIONS.has(act))
      return res.status(400).json({ error: `Invalid action: ${escapeHtml(act, 60)}` });
    let pushed = 0;
    const results = {};
    for (const target of targets) {
      const sent = pushQueue(target, { ...cmd, action: act, _user: u, _target_user: target }, priority);
      results[target] = { sent, online: isOnline(target) };
      if (sent) pushed++;
    }
    bumpStats(u || 'admin', `multi:${act}`);
    return res.status(200).json({ status: 'ok', pushed, targets: results, ts: Date.now() });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLUGIN CALLBACKS — data FROM plugin → server
  // ══════════════════════════════════════════════════════════════════════════

  const internalHandlers = {
    'game_scan': () => {
      const d = { data: sanObj(body.data), ts: body.ts || Date.now(), user: u };
      saveGameScan(u, d);
      writeJson(wsFile(u), { ...d, _ts: Date.now() });
      return res.status(200).json({ status: 'ok', ts: d.ts });
    },
    'workspace_data': () => {
      pushLog({ action: 'workspace_read', user: u });
      writeJson(wsFile(u), { ...body, _ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'output_data': () => {
      saveOutput(u, sanArr(body.outputs));
      return res.status(200).json({ status: 'ok' });
    },
    'script_content': () => {
      saveScriptContent(u, {
        name:       sanStr(body.name       || '', 100),
        parent:     sanStr(body.parent     || '', 100),
        fullPath:   sanStr(body.fullPath   || '', 200),
        scriptType: sanStr(body.scriptType || 'Script', 30),
        source:     String(body.source     || ''),
        lineCount:  sanInt(body.lineCount, 0, 0, 99_999),
        disabled:   !!body.disabled,
        updatedAt:  Date.now(),
      });
      pushLog({ action: 'script_read', user: u, name: sanStr(body.name || '', 50) });
      return res.status(200).json({ status: 'ok', name: sanStr(body.name || '', 50) });
    },
    'script_list': () => {
      saveScriptList(u, { parent: sanStr(body.parent || '', 100), scripts: sanArr(body.scripts), count: sanInt(body.count, 0, 0, 99_999), updatedAt: Date.now() });
      return res.status(200).json({ status: 'ok', count: sanInt(body.count, 0, 0, 99_999) });
    },
    'script_lines': () => {
      saveScriptLines(u, { name: sanStr(body.name || '', 100), lineStart: sanInt(body.lineStart, 1, 1, 99_999), lineEnd: sanInt(body.lineEnd, 1, 1, 99_999), total: sanInt(body.total, 0, 0, 99_999), content: sanStrSafe(body.content || ''), updatedAt: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'log_output': () => {
      const logs = sanArr(body.logs, 100);
      saveLogSvc(u, logs);
      return res.status(200).json({ status: 'ok', received: logs.length });
    },
    'mention_resolved': () => {
      saveMention(u, { mention: sanStr(body.mention || '', 100), object: sanObj(body.object), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'search_result': () => {
      saveSearch(u, { query: sanStr(body.query || '', 200), results: sanArr(body.results), count: sanInt(body.count, 0, 0, 99_999), ts: Date.now() });
      return res.status(200).json({ status: 'ok', count: sanInt(body.count, 0, 0, 99_999) });
    },
    'descendants': () => {
      saveDescendants(u, { target: sanStr(body.target || '', 100), descendants: sanArr(body.descendants), count: sanInt(body.count, 0, 0, 99_999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'object_properties': () => {
      saveProperties(u, { name: sanStr(body.name || '', 100), properties: sanObj(body.properties), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'action_list': () => {
      saveActionList(u, { actions: sanArr(body.actions), count: sanInt(body.count, 0, 0, 9_999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'asset_library': () => {
      saveAssetLib(u, { category: sanStr(body.category || 'all', 50), data: sanObj(body.data || body.summary), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'assets_listed': () => {
      saveAssetLib(u, { category: sanStr(body.category || 'all', 50), data: sanObj(body.data || body.summary), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'asset_id_result': () => {
      saveAssetId(u, { category: sanStr(body.category || '', 50), sub: sanStr(body.sub || '', 50), name: sanStr(body.name || '', 100), id: sanStr(body.id || '', 100), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'asset_folder_list': () => {
      saveAssetFolder(u, { folder: sanStr(body.folder || 'all', 50), contents: sanObj(body.contents), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'theme_data': () => {
      saveThemeData(u, { name: sanStr(body.name || body.theme || 'nexus_ai', 50), label: sanStr(body.label || '', 50), theme: sanObj(body.theme || body.data), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'themes_list': () => {
      saveThemesList(u, { themes: sanArr(body.themes), count: sanInt(body.count, 0, 0, 999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'theme_list': () => {
      saveThemesList(u, { themes: sanArr(body.themes), count: sanInt(body.count, 0, 0, 999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'theme_applied': () => {
      saveThemeApplied(u, { target: sanStr(body.target || '', 100), theme: sanStr(body.theme || '', 50), count: sanInt(body.count, 0, 0, 9_999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'theme_compare': () => {
      saveThemeCompare(u, { theme_a: sanObj(body.theme_a), theme_b: sanObj(body.theme_b), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'module_deployed': () => {
      saveModuleDeploy(u, { name: sanStr(body.name || '', 100), parent: sanStr(body.parent || '', 100), source: sanStr(body.source || '', 100), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'modules_list': () => {
      saveModuleList(u, { folder: sanStr(body.folder || 'modulescripts', 100), modules: sanArr(body.modules), count: sanInt(body.count, 0, 0, 999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
    'terrain_materials': () => {
      saveTerrainResult(u, { materials: sanArr(body.materials), count: sanInt(body.count, 0, 0, 999), ts: Date.now() });
      return res.status(200).json({ status: 'ok' });
    },
  };

  if (internalHandlers[actionType]) return internalHandlers[actionType]();
  if (INTERNAL_ACTIONS.has(resolvedAction)) return res.status(200).json({ status: 'ok' });

  // ── Admin log endpoints ───────────────────────────────────────────────────
  if (resolvedAction === 'get_logs' || resolvedAction === 'get_history') {
    if (!verifyAdminToken(req)) return res.status(401).json({ error: 'Admin token required.' });
    if (resolvedAction === 'get_logs')
      return res.status(200).json({ logs: readJson(LOG_FILE, []).slice(0, sanInt(body.limit, 100, 1, 300)) });
    return res.status(200).json({ history: readJson(HIST_FILE, []).slice(0, sanInt(body.limit, 50, 1, 150)) });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERVER-SIDE API ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  // ── search_toolbox ────────────────────────────────────────────────────────
  if (resolvedAction === 'search_toolbox') {
    const sender    = san(body._user || '');
    const keyword   = sanStr(body.keyword || body.query || body.term || '', 100).trim();
    const assetType = sanStr(body.asset_type || body.assetType || 'Model', 30);
    const limit     = sanInt(body.limit || body.count, 10, 1, 50);
    const cursor    = body.cursor ? sanStr(String(body.cursor), 200) : null;

    if (!keyword) return res.status(400).json({ status: 'error', error: '"keyword" is required.', action: 'search_toolbox' });

    const VALID_TYPES = new Set(['Model', 'Plugin', 'Audio', 'Decal', 'Image', 'MeshPart', 'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear']);
    const finalType   = VALID_TYPES.has(assetType) ? assetType : 'Model';

    try {
      const result = await robloxToolboxSearch(keyword, finalType, limit, cursor);
      bumpStats(sender || 'web', 'search_toolbox');
      pushLog({ action: 'search_toolbox', user: sender || 'web', keyword: sanStr(keyword, 50), assetType: finalType, found: result.assets.length });
      const target = san(body._target_user || sender);
      if (target && isOnline(target)) {
        pushQueue(target, {
          action: 'search_result_toolbox', keyword, assetType: finalType,
          assets: result.assets.slice(0, 20), nextCursor: result.nextCursor,
          total: result.total, _user: sender,
        }, 'normal');
      }
      const fromCache = !!cacheGet(`toolbox:${keyword}:${finalType}:${limit}:${cursor || ''}`);
      return res.status(200).json({
        status: 'ok', action: 'search_toolbox',
        keyword, assetType: finalType,
        assets: result.assets, nextCursor: result.nextCursor,
        total: result.total, count: result.assets.length,
        pluginNotified: target ? isOnline(san(body._target_user || sender)) : false,
        fromCache, ts: Date.now(),
      });
    } catch (err) {
      const code = err?.code || 500;
      pushLog({ action: 'search_toolbox_error', user: sender || 'web', error: sanStr(err?.message || '', 100) });
      return res.status(code === 400 ? 400 : code === 429 ? 429 : 502).json({
        status: 'error', action: 'search_toolbox',
        message: sanStr(err?.message || 'Failed.', 200), code, ts: Date.now(),
      });
    }
  }

  // ── insert_model ──────────────────────────────────────────────────────────
  if (resolvedAction === 'insert_model') {
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);
    const assetId  = body.asset_id || body.assetId || body.id || '';
    const parent   = sanStr(body.parent || body.parentPath || 'workspace', 100);
    const priority = sanPriority(body.priority);

    if (!assetId) return res.status(400).json({ status: 'error', error: '"asset_id" is required.', action: 'insert_model' });
    if (!target)  return res.status(400).json({ status: 'error', error: '"_user" is required.',    action: 'insert_model' });

    const auth = authorizeCommand(req, sender, target, 'insert_rbx_model');
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    try {
      const validated = await validateAndPrepareAsset(assetId);
      if (!validated.insertable && validated.assetType !== 'Unknown')
        return res.status(400).json({
          status: 'error', action: 'insert_model',
          message: `AssetType "${validated.assetType}" cannot be inserted.`,
          assetType: validated.assetType, ts: Date.now(),
        });

      pushQueue(target, {
        action: 'insert_rbx_model', asset_id: validated.assetId,
        name: validated.name, parent, insert_code: validated.insertCommand,
        _user: sender, _target_user: target,
      }, priority);
      bumpStats(sender || 'web', 'insert_model');
      pushLog({ action: 'insert_model', user: sender || 'web', target, assetId: validated.assetId, assetName: sanStr(validated.name, 50), parent });
      pushUserCmdHistory(sender, 'insert_model', `${validated.name} (${validated.assetId})`);

      return res.status(200).json({
        status: 'ok', action: 'insert_model',
        assetId: validated.assetId, name: validated.name,
        description: validated.description || '', assetType: validated.assetType,
        creator: validated.creator, isPublic: validated.isPublic,
        unverified: validated.unverified || false, insertable: validated.insertable,
        insertCommand: validated.insertCommand, parent,
        pluginConnected: isOnline(target), queued: true, priority,
        queueLength: getQueue(target).length, ts: Date.now(),
      });
    } catch (err) {
      const code = err?.code || 500;
      pushLog({ action: 'insert_model_error', user: sender || 'web', error: sanStr(err?.message || '', 100) });
      return res.status(code === 400 ? 400 : 502).json({
        status: 'error', action: 'insert_model',
        message: sanStr(err?.message || 'Failed.', 200), ts: Date.now(),
      });
    }
  }

  // ── search_docs ───────────────────────────────────────────────────────────
  if (resolvedAction === 'search_docs') {
    const sender  = san(body._user || '');
    const query   = sanStr(body.query || body.keyword || body.q || '', 150).trim();
    const docType = ['api', 'guide', 'all'].includes(body.doc_type) ? body.doc_type : 'all';
    const limit   = sanInt(body.limit, 5, 1, 20);

    if (!query) return res.status(400).json({ status: 'error', error: '"query" is required.', action: 'search_docs' });

    try {
      const result = await searchLuauDocs(query, docType, limit);
      bumpStats(sender || 'web', 'search_docs');
      pushLog({ action: 'search_docs', user: sender || 'web', query: sanStr(query, 50), found: result.results.length, source: result.source });
      return res.status(200).json({ status: 'ok', action: 'search_docs', query, docType, results: result.results, count: result.results.length, source: result.source, ts: Date.now() });
    } catch (err) {
      pushLog({ action: 'search_docs_error', user: sender || 'web', error: sanStr(err?.message || '', 100) });
      return res.status(500).json({ status: 'error', action: 'search_docs', message: sanStr(err?.message || 'Failed.', 200), ts: Date.now() });
    }
  }

  // ── get_game_info ─────────────────────────────────────────────────────────
  if (resolvedAction === 'get_game_info') {
    const sender  = san(body._user || '');
    const isPlace = body.type === 'place' || !!body.place_id;
    const id      = parseInt(String(body.id || body.universe_id || body.place_id || '0').replace(/\D/g, ''), 10);
    if (!id) return res.status(400).json({ status: 'error', error: '"id" is required.', action: 'get_game_info' });
    try {
      const info = await fetchRobloxGameInfo(id, isPlace);
      bumpStats(sender || 'web', 'get_game_info');
      return res.status(200).json({ status: 'ok', action: 'get_game_info', ...info, ts: Date.now() });
    } catch (err) {
      return res.status(502).json({ status: 'error', action: 'get_game_info', message: sanStr(err?.message || 'Failed.', 200), ts: Date.now() });
    }
  }

  // ── get_user_info / get_avatar_info ───────────────────────────────────────
  if (resolvedAction === 'get_user_info' || resolvedAction === 'get_avatar_info') {
    const sender = san(body._user || '');
    const userId = parseInt(String(body.user_id || body.userId || body.id || '0').replace(/\D/g, ''), 10);
    if (!userId) return res.status(400).json({ status: 'error', error: '"user_id" is required.' });
    try {
      const info = await fetchRobloxUserInfo(userId);
      bumpStats(sender || 'web', resolvedAction);
      return res.status(200).json({ status: 'ok', action: resolvedAction, ...info, ts: Date.now() });
    } catch (err) {
      return res.status(502).json({ status: 'error', action: resolvedAction, message: sanStr(err?.message || 'Failed.', 200), ts: Date.now() });
    }
  }

  // ── validate_asset ────────────────────────────────────────────────────────
  if (resolvedAction === 'validate_asset') {
    const sender  = san(body._user || '');
    const assetId = body.asset_id || body.assetId || body.id || '';
    if (!assetId) return res.status(400).json({ status: 'error', error: '"asset_id" is required.' });
    try {
      const validated = await validateAndPrepareAsset(assetId);
      bumpStats(sender || 'web', 'validate_asset');
      return res.status(200).json({ status: 'ok', action: 'validate_asset', ...validated, ts: Date.now() });
    } catch (err) {
      const code = err?.code || 500;
      return res.status(code === 400 ? 400 : 502).json({ status: 'error', action: 'validate_asset', message: sanStr(err?.message || '', 200), ts: Date.now() });
    }
  }

  // ── batch_commands ────────────────────────────────────────────────────────
  if (resolvedAction === 'batch_commands') {
    const sender   = san(body._user || '');
    const target   = san(body.target || body._target_user || sender);
    const priority = sanPriority(body.priority);
    if (!target) return res.status(400).json({ error: '"target" is required.' });

    let rawCommands = [];
    if (Array.isArray(body.commands))   rawCommands = body.commands;
    else if (typeof body.text === 'string') rawCommands = extractCommandsFromText(body.text);

    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target)
      return res.status(403).json({ error: 'Forbidden: Cannot target another user.' });
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    }

    const { safe, removed } = filterSafeBatch(rawCommands, isAdmin);
    let pushed = 0;
    const skipped = [...removed];

    for (const cmd of safe) {
      if (!cmd?.action) continue;
      const act = ACTION_ALIASES[sanStr(cmd.action, 80)] || sanStr(cmd.action, 80);
      if (!VALID_ACTIONS.has(act)) { skipped.push(act); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user:          String(body._user || 'web').substring(0, 50),
        _target_user:   target,
        _apiKey:        undefined,
      }, priority);
      pushed++;
    }

    bumpStats(sender || 'web', 'batch_commands');
    pushLog({ action: 'batch_commands', user: sender || 'web', target, count: pushed, skipped, priority });
    pushUserCmdHistory(sender, 'batch_commands', `${pushed} commands → ${target}`);
    dispatchWebhook(sender, 'batch_commands', { pushed, target }).catch(() => {});

    return res.status(200).json({
      status:          'ok',
      pushed,
      skipped,
      priority,
      warning:         removed.length > 0 ? `${removed.length} destructive actions removed.` : undefined,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts:              Date.now(),
    });
  }

  // ── execute_json / execute_text ───────────────────────────────────────────
  if ((resolvedAction === 'execute_json' || resolvedAction === 'execute_text') &&
      (body.text || body.commands)) {
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);
    const priority = sanPriority(body.priority);
    if (!target) return res.status(400).json({ error: '"_target_user" is required.' });

    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && sender !== target)
      return res.status(403).json({ error: 'Forbidden: execute cannot target another user.' });
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    }

    const inputText = body.text || (Array.isArray(body.commands) ? JSON.stringify({ commands: body.commands }) : '');
    const extracted = extractCommandsFromText(String(inputText));
    let pushed = 0;
    const skipped = [];

    for (const cmd of extracted) {
      if (!cmd?.action) continue;
      const act = ACTION_ALIASES[sanStr(cmd.action, 80)] || sanStr(cmd.action, 80);
      if (!VALID_ACTIONS.has(act)) { skipped.push(act); continue; }
      if (!isAdmin && ADMIN_ONLY_ACTIONS.has(act)) { skipped.push(`[admin-only] ${act}`); continue; }
      pushQueue(target, {
        ...cmd, action: act,
        _user:        String(body._user || 'web').substring(0, 50),
        _target_user: target,
        _apiKey:      undefined,
      }, priority);
      pushed++;
    }

    bumpStats(sender || 'web', 'execute_json');
    pushLog({ action: 'execute_json', user: sender || 'web', target, count: pushed, skipped });
    pushUserCmdHistory(sender, 'execute_json', `${pushed} extracted commands`);

    return res.status(200).json({ status: 'ok', pushed, skipped, priority, pluginConnected: isOnline(target), queueLength: getQueue(target).length, ts: Date.now() });
  }

  // ── inject_command ────────────────────────────────────────────────────────
  if (resolvedAction === 'inject_command' && body.command) {
    const sender   = san(body._user || '');
    const target   = san(body._target_user || sender);
    const priority = sanPriority(body.priority);
    if (!target) return res.status(400).json({ error: '"target" is required.' });
    const cmd = body.command;
    if (!cmd?.action) return res.status(400).json({ error: '"command.action" is required.' });
    const act = ACTION_ALIASES[sanStr(cmd.action, 80)] || sanStr(cmd.action, 80);
    if (!VALID_ACTIONS.has(act)) return res.status(400).json({ error: `Invalid action: ${escapeHtml(act, 60)}` });
    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    pushQueue(target, {
      ...cmd, action: act,
      _user:          String(body._user || 'web').substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    }, priority);
    bumpStats(sender || 'web', act);
    pushLog({ action: act, user: sender || 'web', target, name: sanStr(cmd.name || '', 50), parent: sanStr(cmd.parent || '', 50) });
    pushUserCmdHistory(sender, act, sanStr(cmd.name || '', 50));
    return res.status(200).json({ status: 'ok', pushed: 1, action: act, priority, pluginConnected: isOnline(target), queueLength: getQueue(target).length, ts: Date.now() });
  }

  // ── Single Action Dispatch ────────────────────────────────────────────────
  if (body.action || actionType) {
    const rawAct   = sanStr(body.action || actionType, 80);
    const act      = ACTION_ALIASES[rawAct] || rawAct;
    const priority = sanPriority(body.priority || body._priority);

    if (INTERNAL_ACTIONS.has(act)) return res.status(200).json({ status: 'ok' });

    if (!VALID_ACTIONS.has(act)) {
      const suggestion = Object.entries(ACTION_ALIASES)
        .find(([alias]) => alias.includes(rawAct) || rawAct.includes(alias));
      return res.status(400).json({
        error: `Invalid action: ${escapeHtml(act, 60)}`,
        hint:  suggestion
          ? `Did you mean: "${suggestion[1]}" (alias of "${suggestion[0]}")?`
          : `See valid actions at GET?get_actions=1`,
        valid_actions_count: VALID_ACTIONS.size,
      });
    }

    const sender = san(body._user || '');
    const target = san(body._target_user || sender);
    if (!target) return res.status(400).json({ error: '"_target_user" or "_user" is required.' });

    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    pushQueue(target, {
      ...body, action: act,
      _user:          String(body._user || 'web').substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    }, priority);

    bumpStats(sender || 'web', act);
    pushLog({ action: act, user: sender || 'web', target, name: sanStr(body.name || '', 50), parent: sanStr(body.parent || '', 50) });
    pushHist({ action: act, details: sanStr(body.name || JSON.stringify(body).substring(0, 80), 200), user: sender || 'web', target });
    pushUserCmdHistory(sender, act, sanStr(body.name || '', 60));
    dispatchWebhook(sender, 'command_queued', { action: act, target }).catch(() => {});

    return res.status(200).json({
      status:          'ok',
      action:          act,
      target,
      priority,
      wasAlias:        act !== rawAct,
      originalAction:  act !== rawAct ? rawAct : undefined,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length + getPriorityQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      api_version:     API_VERSION,
      ts:              Date.now(),
    });
  }

  // ── Unknown request ───────────────────────────────────────────────────────
  return res.status(400).json({
    status:      'error',
    error:       'Request not recognised.',
    hint:        'Include a valid action, type, or query parameter.',
    web_version: WEB_VERSION,
    api_version: API_VERSION,
    ts:          Date.now(),
  });
}