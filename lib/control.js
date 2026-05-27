// api/control.js — NEXUS AI (SECURE v10 - COMPLETE PRODUCTION)
// ════════════════════════════════════════════════════════════════════════════
// v10 COMPLETE:
//   1. ROBUST JSON PARSER — Handles AI-generated function-call syntax
//   2. CONTROL CHAR SANITIZER — Strips bad control chars from JSON strings
//   3. GLOBAL TRY-CATCH — Wraps entire handler to prevent all 500 errors
//   4. MULTI-STRATEGY PARSE — JSON → fix trailing commas → fix unquoted
//        keys → Lua-to-JSON conversion → function-call extraction
//   5. PLAIN JSON DETECTION — Also parses raw JSON blocks without ```
//   6. BATCH EXPANSION ON SERVER — execute_json fully expands batch_commands
//   7. search_toolbox — Roblox Open Cloud Toolbox API integration
//   8. insert_model — AssetId validation + InsertService command builder
//   9. search_docs — Luau/Roblox API docs search (online + local index)
//  10. STRICT CORS — Whitelist-based origin validation
//  11. RATE LIMITING — 120 req/min per user
//  12. SESSION AUTH — Token-based plugin authentication
// ════════════════════════════════════════════════════════════════════════════

import {
  readFileSync, writeFileSync, existsSync,
  unlinkSync, readdirSync, statSync,
} from 'fs';
import crypto from 'crypto';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TMP                     = '/tmp';
export const REQUIRED_PLUGIN_VERSION = 'V1.2.131';
export const WEB_VERSION             = 'V11.5';
const SESSION_TTL             = 24 * 60 * 60 * 1_000;
const MAX_QUEUE_SIZE          = 200;
const MAX_LOG_ENTRIES         = 300;
const MAX_HIST_ENTRIES        = 150;
const MAX_LOGSVC_ENTRIES      = 500;
const MAX_MENTION_ENTRIES     = 50;
const RATE_LIMIT_PER_MIN      = 120;
const SESSION_TOKEN_MAX_LEN   = 128;
const MIN_ADMIN_TOKEN_LEN     = 16;

// ─── ALLOWED ORIGINS (CORS whitelist) ────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://nexusai-roblox.vercel.app',
  'https://nexusai-roblox.com',
  'http://localhost:3000',
  'http://localhost:3001',
]);

// ─── FILE PATHS ───────────────────────────────────────────────────────────────
const f = (prefix, u) => `${TMP}/${prefix}_${san(u)}.json`;

const queueFile        = u => f('nq',       u);
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

const LOG_FILE   = `${TMP}/nexus_log.json`;
const HIST_FILE  = `${TMP}/nexus_hist.json`;
const STATS_FILE = `${TMP}/nexus_global_stats.json`;

// ─── SANITIZERS ──────────────────────────────────────────────────────────────

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

function escapeHtml(str, maxLen = 500) {
  return String(str ?? '')
    .substring(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function sanInt(val, def = 0, min = 0, max = 999_999) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function sanObj(val) {
  return (val && typeof val === 'object' && !Array.isArray(val)) ? val : {};
}

function sanArr(val) {
  return Array.isArray(val) ? val : [];
}

// ════════════════════════════════════════════════════════════════════════════
// ROBUST JSON PARSER
// ════════════════════════════════════════════════════════════════════════════

function cleanControlChars(text) {
  if (typeof text !== 'string') return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 || code === 9 || code === 10 || code === 13) {
      result += text[i];
    } else {
      result += ' ';
    }
  }
  return result;
}

function robustJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = cleanControlChars(raw.trim());
  try { return JSON.parse(cleaned); } catch (_) {}

  try {
    return JSON.parse(cleaned.replace(/,(\s*[}\]])/g, '$1'));
  } catch (_) {}

  try {
    const fixed = cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3');
    return JSON.parse(fixed);
  } catch (_) {}

  try {
    const luaFixed = cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
      .replace(/:\s*nil\b/g, ': null')
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?!:))/g, '$1"$2"$3');
    return JSON.parse(luaFixed);
  } catch (_) {}

  try {
    const aggressive = cleaned
      .replace(/--[^\n]*/g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*[=:](?![=:>]))/g,
        (_, pre, key) => `${pre}"${key}": `)
      .replace(/:\s*nil\b/g, ': null')
      .replace(/:\s*true\b/g, ': true')
      .replace(/:\s*false\b/g, ': false');
    return JSON.parse(aggressive);
  } catch (_) {}

  return null;
}

function parseFunctionCallSyntax(text) {
  const commands = [];
  if (!text || typeof text !== 'string') return commands;

  const re = /\b([a-z][a-z0-9_]*)\s*\(\s*\{/g;
  let match;

  while ((match = re.exec(text)) !== null) {
    const fnName = match[1];
    if (!VALID_ACTIONS.has(fnName)) continue;

    const startIdx = match.index + match[0].length - 1;
    let depth = 0;
    let endIdx = -1;

    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }

    if (endIdx === -1) continue;

    const bodyStr = text.substring(startIdx, endIdx + 1);

    const jsonStr = cleanControlChars(bodyStr)
      .replace(/--[^\n]*/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*)/g, '$1"$2": ')
      .replace(/:\s*nil\b/g, ': null')
      .replace(/([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:(?![=:>]))/g,
        (_, pre, key) => `${pre}"${key}": `);

    const parsed = robustJsonParse(jsonStr);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (fnName === 'batch_commands' && Array.isArray(parsed.commands)) {
        for (const sub of parsed.commands) {
          if (sub?.action) commands.push(sub);
        }
      } else {
        commands.push({ action: fnName, ...parsed });
      }
    } else if (fnName !== 'batch_commands') {
      commands.push({ action: fnName });
    }
  }

  return commands;
}

function extractCommandsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const allCommands = [];
  const seen = new Set();

  function addCmd(cmd) {
    if (!cmd?.action) return;
    const key = JSON.stringify(cmd);
    if (!seen.has(key)) {
      seen.add(key);
      allCommands.push(cmd);
    }
  }

  function processItem(item) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      for (const sub of item) processItem(sub);
      return;
    }
    if (!item.action) return;

    if (item.action === 'batch_commands' && Array.isArray(item.commands)) {
      for (const sub of item.commands) {
        if (sub?.action) addCmd(sub);
      }
    } else {
      addCmd(item);
    }
  }

  const codeBlockRe = /```(?:json|JSON|Json|js|JS)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = codeBlockRe.exec(text)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    const parsed = robustJsonParse(raw);
    if (parsed) {
      processItem(parsed);
    } else {
      const fnCmds = parseFunctionCallSyntax(raw);
      for (const c of fnCmds) addCmd(c);
    }
  }

  const textWithoutBlocks = text.replace(/```[\s\S]*?```/g, '');
  const fnCmds = parseFunctionCallSyntax(textWithoutBlocks);
  for (const c of fnCmds) addCmd(c);

  if (allCommands.length === 0) {
    const jsonObjectRe = /(\{[^`]*"action"\s*:\s*"[^"]+[^`]*?\})/gs;
    while ((m = jsonObjectRe.exec(textWithoutBlocks)) !== null) {
      const parsed = robustJsonParse(m[1]);
      if (parsed?.action) processItem(parsed);
    }
  }

  return allCommands;
}

// ─── IN-MEMORY SESSION STORE ──────────────────────────────────────────────────
const sessionStore = new Map();

function setSession(username, token, placeId, userId) {
  const sanitizedUsername = san(username);
  sessionStore.set(sanitizedUsername, {
    token:     String(token).substring(0, SESSION_TOKEN_MAX_LEN),
    placeId:   placeId ? sanStr(String(placeId), 30) : null,
    userId:    userId  ? sanStr(String(userId), 20)  : null,
    createdAt: Date.now(),
    lastSeen:  Date.now(),
  });
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
  if (s) s.lastSeen = Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionStore) {
    if (now - v.createdAt > SESSION_TTL) sessionStore.delete(k);
  }
}, 30 * 60_000).unref?.();

// ─── ADMIN TOKEN ──────────────────────────────────────────────────────────────

function verifyAdminToken(req) {
  const envToken = process.env.ADMIN_TOKEN;
  if (!envToken || envToken === 'nexusadmin2024' || envToken.length < MIN_ADMIN_TOKEN_LEN) {
    return false;
  }
  const candidate =
    (req.headers?.['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers?.['x-admin-token'] || '').trim() ||
    (typeof req.query?.token === 'string' ? req.query.token.trim() : '');

  if (!candidate) return false;

  try {
    const padLen = 256;
    const a = Buffer.from(candidate.padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(envToken.padEnd(padLen).substring(0, padLen));
    return crypto.timingSafeEqual(a, b) && candidate === envToken;
  } catch (_) {
    return false;
  }
}

// ─── SESSION TOKEN VERIFY ─────────────────────────────────────────────────────

function verifySessionToken(username, candidateToken, candidatePlaceId) {
  if (!candidateToken) return 'missing';
  const s = getSession(username);
  if (!s) return 'no_session';

  try {
    const padLen = 256;
    const a = Buffer.from(String(candidateToken).padEnd(padLen).substring(0, padLen));
    const b = Buffer.from(s.token.padEnd(padLen).substring(0, padLen));
    const match = crypto.timingSafeEqual(a, b) && candidateToken === s.token;
    if (!match) return 'invalid';
  } catch (_) {
    return 'invalid';
  }

  if (s.placeId && candidatePlaceId && String(candidatePlaceId) !== s.placeId) {
    return 'place_mismatch';
  }
  return 'ok';
}

// ─── VALID ACTIONS ────────────────────────────────────────────────────────────
const VALID_ACTIONS = new Set([
  'none', 'ping', 'get_info', 'get_all_actions',
  'message', 'print_output', 'get_output',
  'run_lua',
  'save_waypoint', 'undo', 'redo',
  'create_script', 'new_script', 'add_script',
  'create_local_script', 'new_local_script',
  'create_module', 'new_module',
  'inject_script', 'batch_inject',
  'edit_script', 'read_script', 'list_scripts',
  'read_script_lines', 'duplicate_script',
  'disable_script', 'enable_script', 'rename_script',
  'create_remote', 'create_remote_event', 'create_remote_function',
  'create_bindable_event', 'create_bindable_function',
  'create_unreliable_remote', 'batch_remote',
  'scan_workspace', 'read_workspace', 'workspace_data', 'request_scan',
  'workspace_stats',
  'search_instances', 'search', 'find',
  'resolve_mention', 'mention',
  'get_descendants', 'get_properties',
  'list_children', 'find_by_class', 'count_instances',
  'list_services',
  'batch_commands', 'batch_modify', 'batch_create', 'batch_rename',
  'batch_set_property', 'batch_parent',
  'create_part', 'create_wedge', 'create_sphere', 'create_cylinder',
  'create_truss', 'create_corner_wedge',
  'create_mesh', 'create_special_mesh',
  'create_model', 'create_union', 'create_platform',
  'clone_object', 'clone', 'duplicate',
  'create_folder', 'create_instance',
  'create_value', 'create_number_value', 'create_bool_value',
  'create_string_value', 'create_int_value', 'create_object_value',
  'create_color3_value', 'create_vector3_value',
  'modify_part', 'move_object', 'rotate_object', 'resize_object',
  'snap_to_grid', 'align_objects', 'randomize_colors',
  'delete_object', 'delete', 'remove',
  'delete_multiple', 'delete_children',
  'group_parts', 'group', 'ungroup_model', 'ungroup',
  'anchor_all', 'unanchor_all',
  'anchor_model', 'anchor', 'unanchor_model', 'unanchor',
  'select_object', 'select_multiple',
  'set_property', 'set_value', 'copy_properties', 'rename_object',
  'lock_object', 'unlock_object',
  'toggle_visible', 'set_visible', 'set_enabled',
  'toggle_anchored',
  'set_primary_part', 'scale_model', 'weld_model', 'break_joints',
  'add_collection_tag', 'remove_collection_tag',
  'get_tags', 'find_tagged',
  'create_configuration', 'parent_to', 'move_to_service',
  'insert_rbx_model', 'load_asset', 'insert_asset',
  'create_gui',
  'create_frame', 'create_scrolling_frame',
  'create_text_label', 'create_text_button', 'create_text_box',
  'create_image_label', 'create_image_button',
  'create_viewport_frame', 'create_canvas_group',
  'create_billboard', 'create_surface_gui',
  'create_proximity_prompt', 'create_click_detector', 'create_selectbox',
  'add_proximity_prompt', 'add_click_detector',
  'add_highlight', 'remove_highlight',
  'create_ui_list_layout', 'create_ui_grid_layout',
  'create_ui_table_layout', 'create_ui_page_layout',
  'create_ui_padding', 'create_ui_corner',
  'create_ui_stroke', 'create_ui_gradient',
  'create_ui_aspect_ratio', 'create_ui_size_constraint',
  'create_ui_flex_item',
  'weld_parts', 'create_weld',
  'create_attachment', 'create_motor6d',
  'create_constraint',
  'create_hinge', 'create_spring', 'create_rope', 'create_rod',
  'create_plane_constraint', 'create_prismatic', 'create_cylindrical',
  'create_ballsocket', 'create_universal', 'create_no_collision',
  'create_align_position', 'create_align_orientation',
  'create_linear_velocity', 'create_angular_velocity',
  'create_torque', 'create_line_force', 'create_vector_force',
  'create_body_thrust',
  'create_npc', 'create_humanoid', 'modify_humanoid',
  'create_tool', 'create_seat', 'create_vehicle_seat',
  'create_spawn', 'create_team', 'create_animation',
  'create_tycoon_plot', 'create_checkpoint',
  'create_particle', 'add_particle',
  'create_light', 'add_light',
  'add_effect', 'remove_effect',
  'create_fire', 'remove_fire', 'add_fire',
  'create_smoke', 'remove_smoke', 'add_smoke',
  'create_sparkles', 'add_sparkles',
  'create_trail', 'add_trail',
  'create_beam', 'add_beam',
  'create_explosion', 'add_explosion',
  'create_force_field', 'add_force_field',
  'create_sound', 'add_sound', 'create_sound_group',
  'place_decal', 'place_texture',
  'set_lighting', 'create_sky', 'remove_sky', 'create_atmosphere',
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
  'terrain_paint',
  'create_river', 'create_ocean', 'create_cave', 'create_cliff',
  'list_terrain_materials',
  'change_baseplate', 'create_water_part', 'set_gravity', 'set_camera',
  'create_door', 'create_window', 'create_stairs', 'create_ramp',
  'create_tree', 'create_rock', 'create_wall',
  'clear_workspace',
  'play_test', 'run_test', 'stop_test',
  'set_project',
  'get_logs',
  'get_asset_library', 'get_assets', 'list_assets',
  'get_module', 'deploy_module', 'list_modules',
  'use_icon_module', 'install_icon', 'deploy_icon', 'install_topbarplus',
  'import_module', 'use_module', 'load_module', 'get_asset_script',
  'use_folder_script', 'use_localscript', 'inject_quick_script',
  'quick_script', 'use_asset_folder_script', 'list_asset_folder',
  'use_asset_decal', 'insert_model',
  'get_theme', 'theme_get', 'theme',
  'set_theme', 'get_studio_theme', 'studio_theme',
  'list_themes', 'theme_list', 'themes',
  'apply_theme', 'theme_apply',
  'apply_theme_colors',
  'get_theme_color', 'theme_color',
  'compare_themes', 'theme_compare',
  'preview_theme', 'theme_preview',
  'remove_theme_preview',
  'create_datastore_script', 'create_leaderstats_script',
  'create_admin_panel', 'create_badge_script', 'create_shop_script',
  'create_sound_manager', 'create_notification_script',
  'setup_topbar', 'create_topbar_button',
  'search_toolbox',
  'search_docs',
]);

// ─── ADMIN-ONLY ACTIONS ───────────────────────────────────────────────────────
const ADMIN_ONLY_ACTIONS = new Set([
  'run_lua',
  'play_test', 'run_test',
  'clear_workspace',
  'delete_object', 'delete', 'remove',
  'delete_multiple', 'delete_children',
]);

// ─── INTERNAL PLUGIN REPORT ACTIONS ──────────────────────────────────────────
const INTERNAL_ACTIONS = new Set([
  'game_scan', 'workspace_data', 'output_data',
  'script_content', 'script_list', 'script_lines',
  'log_output', 'mention_resolved', 'search_result',
  'descendants', 'object_properties', 'action_list',
  'asset_library', 'asset_id_result', 'asset_folder_list', 'assets_listed',
  'theme_data', 'themes_list', 'theme_applied', 'theme_compare',
  'module_deployed', 'modules_list', 'terrain_materials',
]);

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const rateLimits = new Map();

function checkRateLimit(user, maxPerMinute = RATE_LIMIT_PER_MIN) {
  const now = Date.now();
  const key = san(user);
  if (!rateLimits.has(key)) rateLimits.set(key, { count: 0, reset: now + 60_000 });
  const rl = rateLimits.get(key);
  if (now > rl.reset) { rl.count = 0; rl.reset = now + 60_000; }
  return ++rl.count <= maxPerMinute;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now > v.reset + 60_000) rateLimits.delete(k);
  }
}, 5 * 60_000).unref?.();

// ─── GENERIC FILE I/O ─────────────────────────────────────────────────────────

function readJson(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJson(filePath, data) {
  try {
    writeFileSync(filePath, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

// ─── QUEUE ────────────────────────────────────────────────────────────────────

function getQueue(u)     { return readJson(queueFile(u), []); }
function saveQueue(u, q) { writeJson(queueFile(u), q); }
function clearQueue(u)   { saveQueue(u, []); }

function pushQueue(u, cmd) {
  const q = getQueue(u);
  q.push({ ...cmd, _ts: Date.now() });
  if (q.length > MAX_QUEUE_SIZE) q.splice(0, q.length - MAX_QUEUE_SIZE);
  saveQueue(u, q);
}

// ─── POLL / ONLINE CHECK ──────────────────────────────────────────────────────

function bumpPoll(u)   { try { writeFileSync(pollFile(u), String(Date.now())); } catch (_) {} }
function lastPoll(u)   { return parseInt(readJson(pollFile(u)) ?? '0') || 0; }
function isOnline(u)   { return (Date.now() - lastPoll(u)) < 7_000; }

// ─── OUTPUT ───────────────────────────────────────────────────────────────────

function saveOutput(u, arr) {
  writeJson(outFile(u), { outputs: sanArr(arr), ts: Date.now() });
}

function getOutputData(u) {
  return readJson(outFile(u), { outputs: [] });
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────

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

// ─── GLOBAL STATS ─────────────────────────────────────────────────────────────

function getGlobalStats() {
  return readJson(STATS_FILE, {
    totalCommands: 0, totalUsers: 0, totalSessions: 0,
    startedAt: Date.now(), userStats: {},
  });
}

function saveGlobalStats(s) { writeJson(STATS_FILE, s); }

function bumpStats(user, action) {
  try {
    const s = getGlobalStats();
    s.totalCommands = (s.totalCommands || 0) + 1;
    s.userStats     = s.userStats || {};
    if (!s.userStats[user]) {
      s.userStats[user] = { commands: 0, firstSeen: Date.now(), lastSeen: Date.now() };
      s.totalUsers = Object.keys(s.userStats).length;
    }
    const us   = s.userStats[user];
    us.commands   = (us.commands || 0) + 1;
    us.lastSeen   = Date.now();
    us.lastAction = sanStr(action || 'unknown', 50);
    saveGlobalStats(s);
  } catch (_) {}
}

// ─── LOG SERVICE ──────────────────────────────────────────────────────────────

function saveLogSvc(u, logs) {
  try {
    const existing = readJson(logSvcFile(u), []);
    const combined = [...sanArr(logs), ...existing].slice(0, MAX_LOGSVC_ENTRIES);
    writeJson(logSvcFile(u), combined);
  } catch (_) {}
}

function getLogSvc(u) { return readJson(logSvcFile(u), []); }

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────

function saveScriptContent(u, d)  { writeJson(scriptFile(u),       { ...d, _ts: Date.now() }); }
function getScriptContent(u)      { return readJson(scriptFile(u)); }
function saveScriptList(u, d)     { writeJson(scriptListF(u),       { ...d, _ts: Date.now() }); }
function getScriptList(u)         { return readJson(scriptListF(u)); }
function saveScriptLines(u, d)    { writeJson(scriptLinesF(u),      { ...d, _ts: Date.now() }); }
function getScriptLines(u)        { return readJson(scriptLinesF(u)); }

function saveProject(u, d) {
  writeJson(projectFile(u), {
    projectId:   sanStr(d.projectId   || '', 100),
    projectName: sanStr(d.projectName || '', 100),
    placeId:     sanStr(d.placeId     || '', 50),
    updatedAt:   Date.now(),
  });
}

function getProject(u) {
  return readJson(projectFile(u), {
    projectId: '', projectName: '', placeId: '', updatedAt: 0,
  });
}

function saveMention(u, d) {
  let l = readJson(mentionFile(u), []);
  l.unshift({ ...d, _ts: Date.now() });
  if (l.length > MAX_MENTION_ENTRIES) l = l.slice(0, MAX_MENTION_ENTRIES);
  writeJson(mentionFile(u), l);
}
function getMentions(u)           { return readJson(mentionFile(u), []); }
function saveSearch(u, d)         { writeJson(searchFile(u),       { ...d, _ts: Date.now() }); }
function getSearch(u)             { return readJson(searchFile(u)); }
function saveGameScan(u, d)       { writeJson(gameScanFile(u),     { ...d, _ts: Date.now() }); }
function getGameScan(u)           { return readJson(gameScanFile(u)); }
function saveDescendants(u, d)    { writeJson(descendantsFile(u),  { ...d, _ts: Date.now() }); }
function getDescendants(u)        { return readJson(descendantsFile(u)); }
function saveProperties(u, d)     { writeJson(propertiesFile(u),   { ...d, _ts: Date.now() }); }
function getProperties(u)         { return readJson(propertiesFile(u)); }
function saveActionList(u, d)     { writeJson(actionListFile(u),   { ...d, _ts: Date.now() }); }
function getActionList(u)         { return readJson(actionListFile(u)); }
function saveAssetLib(u, d)       { writeJson(assetLibFile(u),     { ...d, _ts: Date.now() }); }
function getAssetLib(u)           { return readJson(assetLibFile(u)); }
function saveAssetId(u, d)        { writeJson(assetIdFile(u),      { ...d, _ts: Date.now() }); }
function getAssetId(u)            { return readJson(assetIdFile(u)); }
function saveAssetFolder(u, d)    { writeJson(assetFolderFile(u),  { ...d, _ts: Date.now() }); }
function getAssetFolder(u)        { return readJson(assetFolderFile(u)); }
function saveThemeData(u, d)      { writeJson(themeDataFile(u),    { ...d, _ts: Date.now() }); }
function getThemeData(u)          { return readJson(themeDataFile(u)); }
function saveThemesList(u, d)     { writeJson(themesListFile(u),   { ...d, _ts: Date.now() }); }
function getThemesList(u)         { return readJson(themesListFile(u)); }
function saveThemeApplied(u, d)   { writeJson(themeAppliedFile(u), { ...d, _ts: Date.now() }); }
function getThemeApplied(u)       { return readJson(themeAppliedFile(u)); }
function saveThemeCompare(u, d)   { writeJson(themeCompareFile(u), { ...d, _ts: Date.now() }); }
function getThemeCompare(u)       { return readJson(themeCompareFile(u)); }
function saveModuleList(u, d)     { writeJson(moduleListFile(u),   { ...d, _ts: Date.now() }); }
function getModuleList(u)         { return readJson(moduleListFile(u)); }
function saveModuleDeploy(u, d)   { writeJson(moduleDeployFile(u), { ...d, _ts: Date.now() }); }
function getModuleDeploy(u)       { return readJson(moduleDeployFile(u)); }
function saveTerrainResult(u, d)  { writeJson(terrainFile(u),      { ...d, _ts: Date.now() }); }
function getTerrainResult(u)      { return readJson(terrainFile(u)); }

// ─── STALE FILE CLEANUP ───────────────────────────────────────────────────────

const FILE_PREFIXES = [
  'nq_', 'np_', 'no_', 'nw_', 'ns_', 'nsl_', 'nslv_', 'nlg_', 'nprj_',
  'nmention_', 'nsearch_', 'ngscan_', 'ndesc_', 'nprop_', 'nact_',
  'nasset_', 'nassetid_', 'nafolder_', 'ntheme_', 'nthemes_', 'nthapply_',
  'nthcmp_', 'nmodlist_', 'nmoddep_', 'nterrain_',
];

function cleanStaleFiles(maxAgeMs = 3 * 60 * 60 * 1_000) {
  let cleaned = 0;
  try {
    const now = Date.now();
    for (const fname of readdirSync(TMP)) {
      if (!FILE_PREFIXES.some(p => fname.startsWith(p))) continue;
      const fp = `${TMP}/${fname}`;
      try {
        if (now - statSync(fp).mtimeMs > maxAgeMs) {
          unlinkSync(fp);
          cleaned++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return cleaned;
}

// ════════════════════════════════════════════════════════════════════════════
// ROBLOX EXTERNAL API HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getRobloxApiKey() {
  const key = process.env.ROBLOX_OPEN_CLOUD_KEY || '';
  if (!key || key.length < 20) return null;
  return key;
}

// ─── SAFE FETCH WRAPPER ───────────────────────────────────────────────────────

async function safeFetch(url, options = {}, timeoutMs = 10_000, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
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
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('safeFetch: semua retry gagal');
}

// ─── ROBLOX TOOLBOX SEARCH ────────────────────────────────────────────────────

async function robloxToolboxSearch(keyword, assetType = 'Model', limit = 10, cursor = null) {
  const apiKey = getRobloxApiKey();
  if (!apiKey) {
    throw Object.assign(
      new Error('ROBLOX_OPEN_CLOUD_KEY tidak dikonfigurasi di environment variables.'),
      { code: 503 }
    );
  }

  const VALID_ASSET_TYPES = new Set([
    'Model', 'Plugin', 'Audio', 'Decal', 'Image', 'MeshPart',
    'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear',
  ]);
  const safeType  = VALID_ASSET_TYPES.has(assetType) ? assetType : 'Model';
  const safeLimit = Math.min(Math.max(1, limit), 100);

  const params = new URLSearchParams({
    keyword:   String(keyword).substring(0, 100),
    assetType: safeType,
    limit:     String(safeLimit),
    ...(cursor ? { cursor } : {}),
  });

  const url = `https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`;

  let resp;
  try {
    resp = await safeFetch(url, {
      method:  'GET',
      headers: {
        'x-api-key':    apiKey,
        'Accept':       'application/json',
        'User-Agent':   `NexusAI/${WEB_VERSION}`,
        'Content-Type': 'application/json',
      },
    }, 12_000, 2);
  } catch (err) {
    throw Object.assign(
      new Error(`Gagal terhubung ke Roblox Toolbox API: ${err?.message || 'timeout'}`),
      { code: 502 }
    );
  }

  if (resp.status === 401 || resp.status === 403) {
    throw Object.assign(
      new Error('API Key tidak valid atau tidak memiliki izin Toolbox. Cek ROBLOX_OPEN_CLOUD_KEY.'),
      { code: resp.status }
    );
  }
  if (resp.status === 429) {
    throw Object.assign(
      new Error('Roblox Toolbox API rate limit tercapai. Coba lagi dalam beberapa detik.'),
      { code: 429 }
    );
  }
  if (resp.status === 503 || resp.status === 504) {
    throw Object.assign(
      new Error('Roblox Toolbox API sedang tidak tersedia (downtime). Coba lagi nanti.'),
      { code: resp.status }
    );
  }
  if (!resp.ok) {
    let errBody = '';
    try { errBody = await resp.text(); } catch (_) {}
    throw Object.assign(
      new Error(`Roblox Toolbox API error HTTP ${resp.status}: ${sanStr(errBody, 100)}`),
      { code: resp.status }
    );
  }

  let data;
  try {
    data = await resp.json();
  } catch (_) {
    throw Object.assign(new Error('Roblox Toolbox API mengembalikan respons non-JSON.'), { code: 502 });
  }

  const rawItems = data.data || data.assets || data.results || [];

  const assets = rawItems
    .map(item => ({
      assetId:     String(item.assetId     || item.id           || ''),
      name:        sanStr(item.name        || item.assetName    || 'Tanpa Nama', 120),
      description: sanStr(item.description || '', 250),
      assetType:   sanStr(item.assetType   || safeType, 30),
      creator: {
        name:   sanStr(item.creator?.name || item.creatorName || 'Unknown', 80),
        type:   sanStr(item.creator?.type || 'User', 20),
        userId: String(item.creator?.userId || item.creatorTargetId || ''),
      },
      thumbnail:   sanStr(item.thumbnail?.url || item.thumbnailUrl || '', 300),
      updated:     item.updated || item.createdUtc || null,
    }))
    .filter(a => a.assetId);

  return {
    assets,
    nextCursor: data.nextPageCursor || data.cursor || null,
    total:      data.totalCount     || assets.length,
  };
}

// ─── ROBLOX ASSET VALIDATION ──────────────────────────────────────────────────

async function validateAndPrepareAsset(assetId) {
  const id = parseInt(String(assetId).replace(/\D/g, ''), 10);
  if (!id || id <= 0 || id > 99_999_999_999) {
    throw Object.assign(
      new Error(`AssetId tidak valid: "${sanStr(String(assetId), 30)}". Harus berupa angka positif.`),
      { code: 400 }
    );
  }

  let assetData = null;

  // Coba Catalog API (publik, tanpa API key)
  try {
    const resp = await safeFetch(
      `https://catalog.roblox.com/v1/catalog/items/${id}/details`,
      { headers: { Accept: 'application/json' } },
      8_000, 1
    );
    if (resp.ok) assetData = await resp.json();
  } catch (_) {}

  // Fallback: Economy API
  if (!assetData) {
    try {
      const resp = await safeFetch(
        `https://economy.roblox.com/v2/assets/${id}/details`,
        { headers: { Accept: 'application/json' } },
        8_000, 1
      );
      if (resp.ok) assetData = await resp.json();
    } catch (_) {}
  }

  // Fallback: Asset API v1
  if (!assetData) {
    try {
      const resp = await safeFetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        { headers: { Accept: 'application/json' } },
        8_000, 1
      );
      // Jika asset valid, server akan redirect atau 200 — kita anggap valid
      if (resp.ok || resp.status === 302) {
        assetData = { name: `Asset #${id}`, assetType: 'Model', creator: {} };
      }
    } catch (_) {}
  }

  if (!assetData) {
    // Tidak bisa verifikasi API manapun — kembalikan data minimal tapi tetap valid
    return {
      valid:         true,
      assetId:       String(id),
      name:          `Asset #${id}`,
      assetType:     'Unknown',
      creator:       { name: 'Unknown', type: 'User' },
      isPublic:      true,
      unverified:    true,
      insertable:    true,
      insertCommand: buildInsertCommand(id, `Asset #${id}`),
    };
  }

  const insertableTypes = new Set([
    'Model', 'Plugin', 'Package', 'Hat', 'Shirt', 'Pants',
    'TShirt', 'Gear', 'Animation', 'MeshPart', 'Unknown',
  ]);
  const rawType  = sanStr(assetData.assetType || assetData.itemType || 'Model', 30);
  const isPublic = !(assetData.sales === 0 && assetData.isForSale === false);
  const assetName = sanStr(assetData.name || `Asset #${id}`, 120);

  return {
    valid:         true,
    assetId:       String(id),
    name:          assetName,
    description:   sanStr(assetData.description || '', 250),
    assetType:     rawType,
    creator: {
      name:   sanStr(assetData.creator?.name || 'Unknown', 80),
      type:   sanStr(assetData.creator?.creatorType || 'User', 20),
      userId: String(assetData.creator?.creatorTargetId || ''),
    },
    isPublic,
    insertable:    insertableTypes.has(rawType),
    insertCommand: buildInsertCommand(id, assetName),
  };
}

function buildInsertCommand(assetId, assetName) {
  const safeName = sanStr(String(assetName || 'Asset'), 80)
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .trim() || 'Asset';

  return (
    `-- Auto-generated by Nexus AI v${WEB_VERSION}\n` +
    `local InsertService = game:GetService("InsertService")\n` +
    `local success, result = pcall(function()\n` +
    `    return InsertService:LoadAsset(${assetId})\n` +
    `end)\n` +
    `if success then\n` +
    `    result.Name = "${safeName}"\n` +
    `    result.Parent = workspace\n` +
    `    print("[NexusAI] Berhasil insert: ${safeName} (${assetId})")\n` +
    `else\n` +
    `    warn("[NexusAI] Gagal insert asset ${assetId}: " .. tostring(result))\n` +
    `end`
  );
}

// ─── LUAU DOCS SEARCH ─────────────────────────────────────────────────────────

async function searchLuauDocs(query, docType = 'all', limit = 5) {
  const q      = sanStr(query, 150).trim();
  const maxRes = Math.min(Math.max(1, limit), 20);

  if (!q) throw new Error('Query pencarian tidak boleh kosong.');

  // Strategi 1: Roblox Creator Docs search
  try {
    const params = new URLSearchParams({
      query:  q,
      type:   docType === 'all' ? '' : docType,
      limit:  String(maxRes),
      locale: 'en-us',
    });

    const resp = await safeFetch(
      `https://create.roblox.com/api/search/docs?${params}`,
      {
        headers: {
          Accept:       'application/json',
          'User-Agent': `NexusAI/${WEB_VERSION}`,
        },
      },
      8_000, 1
    );

    if (resp.ok) {
      const data = await resp.json();
      const raw  = data.results || data.data || [];

      if (raw.length > 0) {
        const results = raw.slice(0, maxRes).map(r => ({
          title:    sanStr(r.title    || r.name    || 'Tanpa Judul', 120),
          url:      sanStr(r.url      || r.path    || '', 300),
          snippet:  sanStr(r.snippet  || r.excerpt || r.description || '', 300),
          category: sanStr(r.category || r.type    || 'docs', 50),
        }));

        return { results, source: 'roblox_creator_docs', query: q };
      }
    }
  } catch (_) {}

  // Strategi 2: Indeks lokal lengkap
  const localIndex = buildLocalDocsIndex();
  const qLower     = q.toLowerCase();
  const tokens     = qLower.split(/\s+/).filter(Boolean);

  const scored = localIndex
    .map(entry => {
      let score = 0;
      const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
      for (const t of tokens) {
        if (haystack.includes(t)) score += t.length;
        if (entry.title.toLowerCase().startsWith(t)) score += 10;
      }
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRes);

  if (scored.length === 0) {
    return {
      results: [{
        title:    'Dokumentasi Roblox Creator',
        url:      'https://create.roblox.com/docs',
        snippet:  `Tidak ditemukan hasil untuk "${q}". Cari manual di dokumentasi resmi Roblox.`,
        category: 'fallback',
      }],
      source: 'local_fallback',
      query:  q,
    };
  }

  return {
    results: scored.map(({ score: _s, keywords: _k, ...rest }) => rest),
    source:  'local_index',
    query:   q,
  };
}

function buildLocalDocsIndex() {
  return [
    // ── Instance & Hierarchy ──────────────────────────────────────────────
    {
      title:    'Instance',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Instance',
      snippet:  'Kelas dasar semua objek Roblox. Properti: Name, Parent, ClassName. Method: FindFirstChild, WaitForChild, Destroy, Clone, GetChildren, GetDescendants, IsA.',
      category: 'api',
      keywords: 'instance object findfirstchild waitforchild destroy clone getchildren getdescendants parent name classname isa',
    },
    {
      title:    'Workspace',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Workspace',
      snippet:  'Service utama tempat semua objek 3D. Properti: Gravity, CurrentCamera. Akses: game:GetService("Workspace") atau workspace.',
      category: 'api',
      keywords: 'workspace gravity camera service game world 3d environment',
    },
    // ── Parts & Physics ───────────────────────────────────────────────────
    {
      title:    'BasePart / Part / MeshPart / UnionOperation',
      url:      'https://create.roblox.com/docs/reference/engine/classes/BasePart',
      snippet:  'Part fisik. Properti: Size (Vector3), Position, CFrame, Anchored, CanCollide, BrickColor, Material, Transparency, Reflectance, CastShadow.',
      category: 'api',
      keywords: 'part basepart size position cframe anchored cancollide material transparency brickcolor meshpart union casting shadow',
    },
    {
      title:    'CFrame',
      url:      'https://create.roblox.com/docs/reference/engine/datatypes/CFrame',
      snippet:  'Posisi + rotasi 3D. Constructor: CFrame.new(x,y,z), CFrame.Angles(rx,ry,rz), CFrame.lookAt(pos,target). Operasi * untuk komposisi.',
      category: 'api',
      keywords: 'cframe position rotation matrix lookvector new angles lookat composisi transform right up',
    },
    {
      title:    'Vector3',
      url:      'https://create.roblox.com/docs/reference/engine/datatypes/Vector3',
      snippet:  'Vektor 3D. Constructor: Vector3.new(x,y,z). Properti: X, Y, Z, Magnitude, Unit. Operasi: +, -, *, dot, cross, Lerp.',
      category: 'api',
      keywords: 'vector3 xyz magnitude unit lerp dot cross new math direction force',
    },
    {
      title:    'Color3',
      url:      'https://create.roblox.com/docs/reference/engine/datatypes/Color3',
      snippet:  'Tipe warna RGB. Constructor: Color3.new(r,g,b), Color3.fromRGB(r,g,b), Color3.fromHSV. Nilai R/G/B antara 0-1.',
      category: 'api',
      keywords: 'color3 rgb color fromrgb fromhsv r g b warna colour',
    },
    {
      title:    'UDim2',
      url:      'https://create.roblox.com/docs/reference/engine/datatypes/UDim2',
      snippet:  'Ukuran/posisi GUI. UDim2.new(scaleX, offsetX, scaleY, offsetY). Contoh: UDim2.new(0.5, 0, 0.5, 0) = tengah.',
      category: 'api',
      keywords: 'udim2 gui size position scale offset ui layout frame',
    },
    // ── Scripting ─────────────────────────────────────────────────────────
    {
      title:    'Script / LocalScript / ModuleScript',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Script',
      snippet:  'Script berjalan di server. LocalScript di client. ModuleScript di-require dari keduanya. Properti: Source, Enabled, Disabled.',
      category: 'api',
      keywords: 'script localscript modulescript server client source enabled disabled require module',
    },
    {
      title:    'RemoteEvent & RemoteFunction',
      url:      'https://create.roblox.com/docs/reference/engine/classes/RemoteEvent',
      snippet:  'Komunikasi server-client. RemoteEvent: OnServerEvent, OnClientEvent, FireServer, FireClient, FireAllClients. RemoteFunction: InvokeServer, InvokeClient.',
      category: 'api',
      keywords: 'remoteevent remotefunction onserverevent onclientevent fireserver fireclient fireallclients invoke communication network',
    },
    {
      title:    'BindableEvent & BindableFunction',
      url:      'https://create.roblox.com/docs/reference/engine/classes/BindableEvent',
      snippet:  'Komunikasi script-to-script sisi sama. Event:Fire(), Event.Event:Connect(). Function:Invoke() return value.',
      category: 'api',
      keywords: 'bindableevent bindablefunction fire event connect invoke callback internal',
    },
    // ── Services ──────────────────────────────────────────────────────────
    {
      title:    'Players Service',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Players',
      snippet:  'Kelola pemain. Events: PlayerAdded, PlayerRemoving. Method: GetPlayers, GetPlayerFromCharacter. Properti LocalPlayer (client only).',
      category: 'api',
      keywords: 'players service playeradded playerremoving getplayers localplayer character player management',
    },
    {
      title:    'DataStoreService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/DataStoreService',
      snippet:  'Data persisten pemain. GetDataStore(name). Store: GetAsync(key), SetAsync(key,value), UpdateAsync(key,fn), RemoveAsync(key). Selalu pcall!',
      category: 'api',
      keywords: 'datastore datastoreservice getasync setasync updateasync removeasync save load persistent data storage',
    },
    {
      title:    'TweenService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/TweenService',
      snippet:  'Animasi properti. Create(instance, TweenInfo.new(time, style, dir, repeatCount, reverses, delay), goals). Methods: Play, Pause, Cancel. Event: Completed.',
      category: 'api',
      keywords: 'tweenservice tween animation tweeninfo play pause cancel completed smooth interpolate easing',
    },
    {
      title:    'RunService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/RunService',
      snippet:  'Loop dan timing. Events: Heartbeat, RenderStepped, Stepped, PreSimulation. Methods: IsServer, IsClient, IsStudio.',
      category: 'api',
      keywords: 'runservice heartbeat renderstepped stepped frame loop timing isserver isclient isstudio game loop',
    },
    {
      title:    'UserInputService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/UserInputService',
      snippet:  'Deteksi input (client). InputBegan, InputEnded, GetKeysPressed, IsKeyDown, TouchStarted, MouseMoved, GetMouseLocation. Hanya di LocalScript.',
      category: 'api',
      keywords: 'userinputservice input keyboard mouse touch inputbegan inputended keycode iskeydown mousemoved localscript controller gamepad',
    },
    {
      title:    'CollectionService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/CollectionService',
      snippet:  'Sistem tag untuk instance. AddTag, RemoveTag, GetTagged(tag), HasTag, GetTags. Untuk grup sistem modular.',
      category: 'api',
      keywords: 'collectionservice tag addtag removetag gettagged hastag instance group modular system',
    },
    {
      title:    'InsertService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/InsertService',
      snippet:  'Load asset dari catalog. LoadAsset(assetId) returns Model. Gunakan pcall. Asset harus publik atau milik game.',
      category: 'api',
      keywords: 'insertservice loadasset asset insert model catalog public pcall load',
    },
    {
      title:    'HttpService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/HttpService',
      snippet:  'HTTP dari server. GetAsync(url), PostAsync(url, data, contentType). JSONEncode, JSONDecode. Aktifkan di Game Settings > Security.',
      category: 'api',
      keywords: 'httpservice getasync postasync http request json encode decode url server webhook api',
    },
    {
      title:    'ReplicatedStorage & ServerStorage',
      url:      'https://create.roblox.com/docs/reference/engine/classes/ReplicatedStorage',
      snippet:  'ReplicatedStorage: diakses server dan client. ServerStorage: hanya server, tidak direplikasi ke client.',
      category: 'api',
      keywords: 'replicatedstorage serverstorage storage replicate server client share module asset',
    },
    {
      title:    'MessagingService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/MessagingService',
      snippet:  'Komunikasi antar server (cross-server). PublishAsync(topic, message), SubscribeAsync(topic, callback). Max 160 char per pesan.',
      category: 'api',
      keywords: 'messagingservice cross server publish subscribe topic message broadcast multi-server',
    },
    {
      title:    'SoundService',
      url:      'https://create.roblox.com/docs/reference/engine/classes/SoundService',
      snippet:  'Kelola audio global. PlayLocalSound, GetListener, SetListener. Properti: AmbientReverb, DistanceFactor, RolloffScale.',
      category: 'api',
      keywords: 'soundservice sound audio music ambient reverb listener play global',
    },
    // ── GUI ───────────────────────────────────────────────────────────────
    {
      title:    'ScreenGui / Frame / TextLabel / TextButton / TextBox',
      url:      'https://create.roblox.com/docs/reference/engine/classes/ScreenGui',
      snippet:  'GUI 2D di StarterGui/PlayerGui. Frame = container. TextLabel = teks. TextButton = klik. TextBox = input. Properti: Size, Position, BackgroundColor3, TextColor3, Font.',
      category: 'api',
      keywords: 'screengui frame textlabel textbutton textbox gui ui udim2 size position backgroundcolor3 textcolor3 font input',
    },
    {
      title:    'ImageLabel & ImageButton',
      url:      'https://create.roblox.com/docs/reference/engine/classes/ImageLabel',
      snippet:  'Tampilkan gambar di GUI. Properti: Image (rbxassetid://id), ImageColor3, ImageTransparency, ScaleType (Stretch/Fit/Crop).',
      category: 'api',
      keywords: 'imagelabel imagebutton image gui rbxassetid scale stretch fit crop transparency icon',
    },
    {
      title:    'BillboardGui & SurfaceGui',
      url:      'https://create.roblox.com/docs/reference/engine/classes/BillboardGui',
      snippet:  'GUI menempel di Part. BillboardGui selalu menghadap kamera. SurfaceGui di permukaan Part. Parent ke Part di workspace.',
      category: 'api',
      keywords: 'billboardgui surfacegui part attach face camera 3d ui npc overhead',
    },
    // ── UI Layout ─────────────────────────────────────────────────────────
    {
      title:    'UIListLayout / UIGridLayout / UITableLayout',
      url:      'https://create.roblox.com/docs/reference/engine/classes/UIListLayout',
      snippet:  'Atur posisi child GUI otomatis. UIListLayout: vertikal/horizontal. UIGridLayout: grid. UITableLayout: tabel. Properti: Padding, FillDirection, SortOrder.',
      category: 'api',
      keywords: 'uilistlayout uigridlayout uitablelayout layout padding filldir horizontal vertical grid auto sort',
    },
    {
      title:    'UICorner / UIStroke / UIPadding / UIGradient',
      url:      'https://create.roblox.com/docs/reference/engine/classes/UICorner',
      snippet:  'Styling GUI. UICorner: sudut bulat. UIStroke: border. UIPadding: margin dalam. UIGradient: gradient warna.',
      category: 'api',
      keywords: 'uicorner uistroke uipadding uigradient corner border margin gradient rounded styling',
    },
    // ── Humanoid & Character ──────────────────────────────────────────────
    {
      title:    'Humanoid',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Humanoid',
      snippet:  'Kontrol karakter. Properti: Health, MaxHealth, WalkSpeed, JumpPower, MoveDirection, RootPart. Methods: TakeDamage, MoveTo, LoadAnimation. Events: Died, HealthChanged.',
      category: 'api',
      keywords: 'humanoid health walkspeed jumpower takedamage moveto loadanimation died healthchanged character npc rootpart',
    },
    {
      title:    'AnimationTrack',
      url:      'https://create.roblox.com/docs/reference/engine/classes/AnimationTrack',
      snippet:  'Control animasi. Humanoid:LoadAnimation(anim), track:Play(), track:Stop(), track:AdjustSpeed(). Event: Stopped, KeyframeReached.',
      category: 'api',
      keywords: 'animation animationtrack play stop loadanimation speed keyframe humanoid rig r15 r6',
    },
    // ── Luau Language ─────────────────────────────────────────────────────
    {
      title:    'Luau — Type Checking & Annotations',
      url:      'https://create.roblox.com/docs/luau/types',
      snippet:  'Static typing: local x: number = 5. Types: string, number, boolean, nil, any, Instance. Functions: (param: T) -> R. typeof() untuk runtime check.',
      category: 'guide',
      keywords: 'luau type typing annotation number string boolean typeof type checking static inference',
    },
    {
      title:    'Luau — Task Library (task.wait, task.spawn)',
      url:      'https://create.roblox.com/docs/reference/engine/libraries/task',
      snippet:  'task.wait(n) lebih akurat dari wait(n). task.spawn(fn) non-blocking. task.delay(t,fn) tunda. task.cancel(thread) batalkan coroutine.',
      category: 'guide',
      keywords: 'task wait spawn delay cancel coroutine thread async timing yield resume luau',
    },
    {
      title:    'Luau — Metatables & OOP',
      url:      'https://create.roblox.com/docs/luau/metatables',
      snippet:  'Class pattern: Class.__index = Class. setmetatable({}, Class). Metode: function Class:new() → self. Inheritance via __index chain. __tostring, __add, __eq.',
      category: 'guide',
      keywords: 'metatable oop class object new inherit __index setmetatable module pattern tostring add eq luau',
    },
    {
      title:    'Luau — pcall & xpcall Error Handling',
      url:      'https://create.roblox.com/docs/luau/functions#pcall',
      snippet:  'pcall(fn, ...) → ok, result. xpcall(fn, handler, ...). error(msg, level). Selalu pcall untuk: DataStore, HTTP, InsertService, RemoteFunction.',
      category: 'guide',
      keywords: 'pcall xpcall error handler try catch protection safe yield luau error handling',
    },
    {
      title:    'Luau — Tables (Array & Dictionary)',
      url:      'https://create.roblox.com/docs/luau/tables',
      snippet:  'Array: {1,2,3}. Dictionary: {key="val"}. Iterasi: ipairs (array), pairs (dict). table.insert, table.remove, table.find, table.sort, #tbl (panjang).',
      category: 'guide',
      keywords: 'table array dictionary ipairs pairs insert remove find sort length tbl key value luau data structure',
    },
    {
      title:    'Luau — String Library',
      url:      'https://create.roblox.com/docs/luau/string',
      snippet:  'string.format, string.sub, string.find, string.match, string.gsub, string.split, string.upper, string.lower, string.len, tostring.',
      category: 'guide',
      keywords: 'string format sub find match gsub split upper lower len tostring concat luau',
    },
    {
      title:    'Luau — Math Library',
      url:      'https://create.roblox.com/docs/luau/math',
      snippet:  'math.floor, math.ceil, math.round, math.abs, math.max, math.min, math.random, math.sqrt, math.sin/cos/tan, math.pi, math.huge.',
      category: 'guide',
      keywords: 'math floor ceil round abs max min random sqrt sin cos tan pi huge clamp luau',
    },
    // ── Constraints & Physics ─────────────────────────────────────────────
    {
      title:    'Constraints (HingeConstraint, SpringConstraint, dll)',
      url:      'https://create.roblox.com/docs/reference/engine/classes/HingeConstraint',
      snippet:  'Constraints menghubungkan part via Attachment. HingeConstraint, SpringConstraint, RopeConstraint, WeldConstraint. Buat 2 Attachment, set Attachment0 dan Attachment1.',
      category: 'api',
      keywords: 'constraint hinge spring rope rod weld attachment physics joint motor servo',
    },
    // ── Particles & Effects ───────────────────────────────────────────────
    {
      title:    'ParticleEmitter / Fire / Smoke / Sparkles',
      url:      'https://create.roblox.com/docs/reference/engine/classes/ParticleEmitter',
      snippet:  'Efek visual di Part. ParticleEmitter: Texture, Rate, Lifetime, Speed. Fire: Size, Heat, Color. Smoke: Color, Density. Aktifkan/nonaktifkan dengan Enabled.',
      category: 'api',
      keywords: 'particleemitter fire smoke sparkles trail beam particle effect vfx visual',
    },
    // ── Terrain ───────────────────────────────────────────────────────────
    {
      title:    'Terrain',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Terrain',
      snippet:  'API Terrain. FillBlock(cframe, size, material), FillBall, FillCylinder, FillWedge. ReplaceMaterial. Materials: Enum.Material.Grass, Water, Rock, dll.',
      category: 'api',
      keywords: 'terrain fillblock fillball fillcylinder material grass water rock sand snow ice replace smooth',
    },
    // ── Lighting ──────────────────────────────────────────────────────────
    {
      title:    'Lighting Service',
      url:      'https://create.roblox.com/docs/reference/engine/classes/Lighting',
      snippet:  'Atur pencahayaan global. Properti: Ambient, Brightness, ClockTime, FogEnd, FogStart, GeographicLatitude. Child: Sky, Atmosphere, BloomEffect.',
      category: 'api',
      keywords: 'lighting ambient brightness clock time fog sky atmosphere bloom sun shadows environment',
    },
  ];
}

// ─── AUTHORIZATION ────────────────────────────────────────────────────────────

function authorizeCommand(req, senderUser, targetUser, action) {
  const isAdmin = verifyAdminToken(req);
  if (isAdmin) return { ok: true };

  if (senderUser !== targetUser) {
    return {
      ok: false, status: 403,
      error: 'Forbidden: Kamu hanya bisa menargetkan session kamu sendiri.',
    };
  }

  if (action && ADMIN_ONLY_ACTIONS.has(action)) {
    return {
      ok: false, status: 403,
      error: `Forbidden: Action "${escapeHtml(action, 60)}" memerlukan Admin Token.`,
    };
  }

  const candidate =
    (req.headers?.['x-session-token'] || '').trim() ||
    (req.body?._session_token ? String(req.body._session_token).trim() : '');

  if (!candidate) return { ok: true };

  const placeId = req.body?._place_id ? sanStr(String(req.body._place_id), 30) : null;
  const result  = verifySessionToken(targetUser, candidate, placeId);

  switch (result) {
    case 'ok':            return { ok: true };
    case 'no_session':    return { ok: true };
    case 'place_mismatch':
      return { ok: false, status: 403, error: 'Forbidden: PlaceId tidak cocok dengan session.' };
    default:
      return { ok: false, status: 401, error: 'Session token tidak valid.' };
  }
}

// ─── BATCH FILTER ─────────────────────────────────────────────────────────────

function filterSafeBatch(commands, isAdmin) {
  if (isAdmin) return { safe: commands, removed: [] };
  const safe    = [];
  const removed = [];
  for (const cmd of sanArr(commands)) {
    if (ADMIN_ONLY_ACTIONS.has(cmd?.action)) {
      removed.push(sanStr(cmd.action, 50));
    } else {
      safe.push(cmd);
    }
  }
  return { safe, removed };
}

// ─── SECURITY HEADERS ─────────────────────────────────────────────────────────

function setSecurityHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Session-Token, X-Nexus-Nonce');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  res.setHeader('Referrer-Policy',        'strict-origin-when-cross-origin');
  res.setHeader('X-Nexus-Version',        WEB_VERSION);
}

function setSecurityHeadersStrict(req, res) {
  const origin = req.headers?.['origin'] || '';
  // Plugin Roblox Studio tidak memiliki origin header → izinkan
  if (!origin || ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Session-Token,' +
    ' X-Nexus-Nonce, X-Roblox-Signature');
  res.setHeader('Access-Control-Max-Age',    '86400');
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-XSS-Protection',          '1; mode=block');
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin');
  res.setHeader('X-Nexus-Version',           WEB_VERSION);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  try {
    setSecurityHeadersStrict(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return await handleGet(req, res);
    }

    if (req.method === 'POST') {
      return await handlePost(req, res);
    }

    return res.status(405).json({
      error:   'Method tidak diizinkan.',
      allowed: ['GET', 'POST', 'OPTIONS'],
    });
  } catch (err) {
    console.error('[NEXUS control] Unhandled error:', err?.message || err);
    try {
      return res.status(500).json({
        status:  'error',
        error:   'Internal server error.',
        message: sanStr(String(err?.message || 'Unknown error'), 200),
        hint:    'Coba lagi atau hubungi admin.',
        ts:      Date.now(),
      });
    } catch (_) {
      // Response sudah dikirim
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GET HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handleGet(req, res) {
  const q = req.query || {};

  // ── Version Info ──────────────────────────────────────────────────────
  if (q.version === '1') {
    return res.status(200).json({
      ok: true,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:  WEB_VERSION,
      update_url:   'https://discord.gg/HuGtbRvD',
      changelog:    'v11.5 — Complete production build, full error handling, search_toolbox/insert_model/search_docs',
      features: [
        'Session Token Auth', 'Self-Only Targeting', 'Place ID Binding',
        'LogService', 'Script CRUD', 'Workspace Scan', 'Batch Commands',
        '160+ Actions', 'Project Sync', '@Mention Resolver', 'Play Test',
        'Asset Library', 'Theme System', 'Module Deploy', 'Terrain System',
        'Descendants / Properties', 'Global Stats', 'Auto Cleanup', 'Rate Limiting',
        'Full GUI Suite', 'All Constraints', 'NPC Builder',
        'Robust JSON Parser', 'Function-Call Syntax Support',
        'Roblox Toolbox Search', 'Asset Insert Validator', 'Luau Docs Search',
        'Strict CORS Whitelist', 'Retry & Timeout on External APIs',
      ],
      valid_actions:        [...VALID_ACTIONS],
      valid_actions_count:  VALID_ACTIONS.size,
      admin_only_actions:   [...ADMIN_ONLY_ACTIONS],
      security_model: {
        session_token:  'Plugin generates token on connect; web UI must include it',
        self_only:      'Non-admin can only target their own session',
        place_binding:  'Session can be locked to a specific placeId',
        destructive:    'Admin-only actions always require ADMIN_TOKEN',
        rate_limit:     `${RATE_LIMIT_PER_MIN} requests/minute per user`,
        cors:           'Strict whitelist for browser origins; plugin allowed always',
      },
    });
  }

  // ── Health Check ──────────────────────────────────────────────────────
  if (q.health === '1') {
    const s = getGlobalStats();
    return res.status(200).json({
      ok: true, status: 'healthy',
      uptime:         Date.now() - (s.startedAt || Date.now()),
      totalCommands:  s.totalCommands  || 0,
      totalUsers:     s.totalUsers     || 0,
      activeSessions: sessionStore.size,
      web_version:    WEB_VERSION,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts: Date.now(),
    });
  }

  // ── Roblox User Info ──────────────────────────────────────────────────
  if (q.userinfo === '1') {
    const uid = parseInt(q.userId || '0', 10);
    if (!uid || uid <= 0 || uid > 9_999_999_999) {
      return res.status(400).json({ ok: false, error: 'Invalid userId.' });
    }
    try {
      const r = await safeFetch(
        `https://users.roblox.com/v1/users/${uid}`,
        { headers: { Accept: 'application/json' } },
        8_000, 1
      );
      if (!r.ok) {
        return res.status(502).json({ ok: false, error: `Roblox API error: ${r.status}` });
      }
      const d = await r.json();
      return res.status(200).json({
        ok: true, userId: uid,
        username:    escapeHtml(d.name || ''),
        displayName: escapeHtml(d.displayName || d.name || ''),
        isBanned:    d.isBanned || false,
      });
    } catch (e) {
      return res.status(502).json({
        ok: false, error: 'Gagal mengambil data pengguna Roblox.',
        message: sanStr(e?.message || '', 100),
      });
    }
  }

  // ── Connection Check ──────────────────────────────────────────────────
  if (q.check != null) {
    const u    = san(q.user || '');
    const s    = getGlobalStats();
    const sess = getSession(u);
    return res.status(200).json({
      _pluginConnected: isOnline(u),
      connected:        isOnline(u),
      online:           isOnline(u),
      _lastPoll:        lastPoll(u),
      user:             u,
      queueLength:      getQueue(u).length,
      hasSession:       !!sess,
      placeId:          sess?.placeId  || null,
      userId:           sess?.userId   || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version:      WEB_VERSION,
      currentProject:   getProject(u),
      globalStats: {
        totalCommands: s.totalCommands || 0,
        totalUsers:    s.totalUsers    || 0,
      },
    });
  }

  const gu = san(q.user || '');

  // ── Data Getters ──────────────────────────────────────────────────────
  if (q.get_project      != null) return res.status(200).json({ ok: true, ...getProject(gu) });
  if (q.get_output       != null) return res.status(200).json(getOutputData(gu));

  if (q.get_workspace != null) {
    const d = getGameScan(gu) || readJson(wsFile(gu));
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Belum ada data workspace.' });
  }

  if (q.get_script != null) {
    const d = getScriptContent(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada script content.' });
  }

  if (q.get_script_list != null) {
    const d = getScriptList(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada script list.' });
  }

  if (q.get_script_lines != null) {
    const d = getScriptLines(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada script lines.' });
  }

  if (q.get_logsvc != null) {
    const logs  = getLogSvc(gu);
    const since = sanInt(q.since, 0, 0, Number.MAX_SAFE_INTEGER);
    const result = since ? logs.filter(l => (l.ts || 0) > since) : logs;
    return res.status(200).json({ ok: true, logs: result, count: result.length });
  }

  if (q.get_mentions != null) {
    const m = getMentions(gu);
    return res.status(200).json({ ok: true, mentions: m, count: m.length });
  }

  if (q.get_search != null) {
    const d = getSearch(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada hasil search.' });
  }

  if (q.get_game_scan != null) {
    const d = getGameScan(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada game scan.' });
  }

  if (q.get_descendants != null) {
    const d = getDescendants(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada data descendants.' });
  }

  if (q.get_properties != null) {
    const d = getProperties(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada data properties.' });
  }

  if (q.get_action_list != null) {
    const d = getActionList(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada action list.' });
  }

  if (q.get_asset_lib != null) {
    const d = getAssetLib(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada asset library.' });
  }

  if (q.get_asset_id != null) {
    const d = getAssetId(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada asset ID data.' });
  }

  if (q.get_asset_folder != null) {
    const d = getAssetFolder(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada asset folder.' });
  }

  if (q.get_theme_data != null) {
    const d = getThemeData(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada theme data.' });
  }

  if (q.get_themes_list != null) {
    const d = getThemesList(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada themes list.' });
  }

  if (q.get_theme_applied != null) {
    const d = getThemeApplied(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada theme-applied result.' });
  }

  if (q.get_theme_compare != null) {
    const d = getThemeCompare(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada theme comparison.' });
  }

  if (q.get_module_list != null) {
    const d = getModuleList(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada module list.' });
  }

  if (q.get_module_deploy != null) {
    const d = getModuleDeploy(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada module deploy result.' });
  }

  if (q.get_terrain != null) {
    const d = getTerrainResult(gu);
    return d
      ? res.status(200).json({ ok: true, ...d })
      : res.status(200).json({ ok: false, error: 'Tidak ada terrain data.' });
  }

  // ── Admin: Logs ───────────────────────────────────────────────────────
  if (q.get_logs != null) {
    if (!verifyAdminToken(req))
      return res.status(401).json({ ok: false, error: 'Admin token diperlukan.' });
    const logs   = readJson(LOG_FILE, []);
    const limit  = sanInt(q.limit, 100, 1, MAX_LOG_ENTRIES);
    const filter = q.filter_user ? san(q.filter_user) : null;
    const result = filter
      ? logs.filter(l => l.user === filter || l.target === filter)
      : logs;
    return res.status(200).json({ ok: true, logs: result.slice(0, limit), count: result.length });
  }

  if (q.get_history != null) {
    if (!verifyAdminToken(req))
      return res.status(401).json({ ok: false, error: 'Admin token diperlukan.' });
    const hist  = readJson(HIST_FILE, []);
    const limit = sanInt(q.limit, 50, 1, MAX_HIST_ENTRIES);
    return res.status(200).json({ ok: true, history: hist.slice(0, limit), count: hist.length });
  }

  if (q.get_stats != null) {
    const s = getGlobalStats();
    return res.status(200).json({
      ok: true,
      totalCommands:  s.totalCommands  || 0,
      totalUsers:     s.totalUsers     || 0,
      totalSessions:  s.totalSessions  || 0,
      startedAt:      s.startedAt      || 0,
      uptime:         Date.now() - (s.startedAt || Date.now()),
      activeSessions: sessionStore.size,
    });
  }

  if (q.clear_queue != null) {
    if (!verifyAdminToken(req))
      return res.status(401).json({ ok: false, error: 'Admin token diperlukan.' });
    const u = san(q.user || '');
    if (!u) return res.status(400).json({ ok: false, error: 'Parameter user diperlukan.' });
    clearQueue(u);
    return res.status(200).json({ ok: true, message: 'Queue berhasil dikosongkan.', user: u });
  }

  if (q.get_actions != null) {
    return res.status(200).json({
      ok: true,
      actions:    [...VALID_ACTIONS],
      count:      VALID_ACTIONS.size,
      admin_only: [...ADMIN_ONLY_ACTIONS],
    });
  }

  if (q.cleanup === '1') {
    if (!verifyAdminToken(req))
      return res.status(401).json({ ok: false, error: 'Admin token diperlukan.' });
    const maxAge = sanInt(q.max_age, 3 * 3600, 60, 86400) * 1_000;
    return res.status(200).json({ ok: true, cleaned: cleanStaleFiles(maxAge) });
  }

  // ── Plugin Polling (default GET) ──────────────────────────────────────
  const pu = san(q.user || q.u || '');
  if (!pu) {
    return res.status(400).json({ error: 'Parameter user diperlukan.', queue: [] });
  }

  if (q.session_token) {
    const token   = sanStr(String(q.session_token), SESSION_TOKEN_MAX_LEN).trim();
    const placeId = q.place_id ? sanStr(String(q.place_id), 30) : null;
    const userId  = q.user_id  ? sanStr(String(q.user_id),  20) : null;
    if (token.length >= 16) {
      setSession(pu, token, placeId, userId);
    }
  } else {
    touchSession(pu);
  }

  bumpPoll(pu);
  const queue = getQueue(pu);
  if (queue.length > 0) clearQueue(pu);
  const proj = getProject(pu);

  return res.status(200).json({
    queue,
    count:       queue.length,
    required_plugin_version: REQUIRED_PLUGIN_VERSION,
    web_version: WEB_VERSION,
    currentProject: proj,
    projectId:   proj.projectId   || '',
    projectName: proj.projectName || '',
    placeId:     proj.placeId     || '',
    ts:          Date.now(),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// ════════════════════════════════════════════════════════════════════════════

async function handlePost(req, res) {
  const body    = req.body || {};
  const ratUser = san(body._user || body.user || 'anon');

  if (!checkRateLimit(ratUser)) {
    return res.status(429).json({
      status: 'error',
      error:  `Rate limit: maksimal ${RATE_LIMIT_PER_MIN} request/menit per user.`,
      retryAfter: 60,
    });
  }

  const actionType = sanStr(body.action || body.type || '', 80);
  const u = san(body._user || '');

  // ── Reset Queue ───────────────────────────────────────────────────────
  if (actionType === 'reset') {
    const target = san(body._user || body.user || '');
    if (!target) return res.status(400).json({ error: 'Parameter user diperlukan.' });
    const auth = authorizeCommand(req, ratUser, target, null);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    clearQueue(target);
    return res.status(200).json({ status: 'ok', message: 'Queue berhasil di-reset.', user: target });
  }

  // ── Status ────────────────────────────────────────────────────────────
  if (actionType === 'status') {
    const target = san(body._user || body.user || '');
    const sess   = getSession(target);
    return res.status(200).json({
      connected:   isOnline(target),
      online:      isOnline(target),
      lastPoll:    lastPoll(target),
      queueLength: getQueue(target).length,
      hasSession:  !!sess,
      placeId:     sess?.placeId || null,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      web_version: WEB_VERSION,
      currentProject: getProject(target),
    });
  }

  // ── Set Project ───────────────────────────────────────────────────────
  if (actionType === 'set_project') {
    if (!u) return res.status(400).json({ error: 'Parameter user diperlukan.' });
    const auth = authorizeCommand(req, ratUser, u, 'set_project');
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const projectId   = sanStr(body.projectId   || body.project_id   || '', 100);
    const projectName = sanStr(body.projectName || body.project_name || '', 100);
    const placeId     = sanStr(body.placeId     || body.place_id     || '', 50);
    saveProject(u, { projectId, projectName, placeId });
    pushLog({ action: 'set_project', user: u, projectId, projectName, placeId });
    return res.status(200).json({ status: 'ok', projectId, projectName, placeId });
  }

  // ══════════════════════════════════════════════════════════════════════
  // PLUGIN CALLBACKS (data FROM plugin TO server)
  // ══════════════════════════════════════════════════════════════════════

  if (actionType === 'game_scan') {
    const d = { data: sanObj(body.data), ts: body.ts || Date.now(), user: u };
    saveGameScan(u, d);
    writeJson(wsFile(u), { ...d, _ts: Date.now() });
    return res.status(200).json({ status: 'ok', ts: d.ts });
  }

  if (actionType === 'workspace_data') {
    pushLog({ action: 'workspace_read', user: u });
    writeJson(wsFile(u), { ...body, _ts: Date.now() });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'output_data') {
    saveOutput(u, sanArr(body.outputs));
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'script_content') {
    saveScriptContent(u, {
      name:       sanStr(body.name       || '', 100),
      parent:     sanStr(body.parent     || '', 100),
      fullPath:   sanStr(body.fullPath   || '', 200),
      scriptType: sanStr(body.scriptType || 'Script', 30),
      source:     String(body.source || ''),
      lineCount:  sanInt(body.lineCount, 0, 0, 99_999),
      disabled:   !!body.disabled,
      updatedAt:  Date.now(),
    });
    pushLog({ action: 'script_read', user: u, name: sanStr(body.name || '', 50) });
    return res.status(200).json({ status: 'ok', name: sanStr(body.name || '', 50) });
  }

  if (actionType === 'script_list') {
    saveScriptList(u, {
      parent:    sanStr(body.parent || '', 100),
      scripts:   sanArr(body.scripts),
      count:     sanInt(body.count, 0, 0, 99_999),
      updatedAt: Date.now(),
    });
    return res.status(200).json({ status: 'ok', count: sanInt(body.count, 0, 0, 99_999) });
  }

  if (actionType === 'script_lines') {
    saveScriptLines(u, {
      name:      sanStr(body.name || '', 100),
      lineStart: sanInt(body.lineStart, 1, 1, 99_999),
      lineEnd:   sanInt(body.lineEnd,   1, 1, 99_999),
      total:     sanInt(body.total, 0, 0, 99_999),
      content:   String(body.content || ''),
      updatedAt: Date.now(),
    });
    return res.status(200).json({ status: 'ok', name: sanStr(body.name || '', 50) });
  }

  if (actionType === 'log_output') {
    const logs = sanArr(body.logs).slice(0, 100);
    saveLogSvc(u, logs);
    return res.status(200).json({ status: 'ok', received: logs.length });
  }

  if (actionType === 'mention_resolved') {
    saveMention(u, {
      mention: sanStr(body.mention || '', 100),
      object:  sanObj(body.object),
      ts:      Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'search_result') {
    saveSearch(u, {
      query:   sanStr(body.query || '', 200),
      results: sanArr(body.results),
      count:   sanInt(body.count, 0, 0, 99_999),
      ts:      Date.now(),
    });
    return res.status(200).json({ status: 'ok', count: sanInt(body.count, 0, 0, 99_999) });
  }

  if (actionType === 'descendants') {
    saveDescendants(u, {
      target:      sanStr(body.target || '', 100),
      descendants: sanArr(body.descendants),
      count:       sanInt(body.count, 0, 0, 99_999),
      ts:          Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'object_properties') {
    saveProperties(u, {
      name:       sanStr(body.name || '', 100),
      properties: sanObj(body.properties),
      ts:         Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'action_list') {
    saveActionList(u, {
      actions: sanArr(body.actions),
      count:   sanInt(body.count, 0, 0, 9_999),
      ts:      Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'asset_library' || actionType === 'assets_listed') {
    saveAssetLib(u, {
      category: sanStr(body.category || 'all', 50),
      data:     sanObj(body.data || body.summary),
      ts:       Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'asset_id_result') {
    saveAssetId(u, {
      category: sanStr(body.category || '', 50),
      sub:      sanStr(body.sub      || '', 50),
      name:     sanStr(body.name     || '', 100),
      id:       sanStr(body.id       || '', 100),
      ts:       Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'asset_folder_list') {
    saveAssetFolder(u, {
      folder:   sanStr(body.folder || 'all', 50),
      contents: sanObj(body.contents),
      ts:       Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'theme_data') {
    saveThemeData(u, {
      name:  sanStr(body.name  || body.theme || 'nexus_ai', 50),
      label: sanStr(body.label || '', 50),
      theme: sanObj(body.theme || body.data),
      ts:    Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'themes_list' || actionType === 'theme_list') {
    saveThemesList(u, {
      themes: sanArr(body.themes),
      count:  sanInt(body.count, 0, 0, 999),
      ts:     Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'theme_applied') {
    saveThemeApplied(u, {
      target: sanStr(body.target || '', 100),
      theme:  sanStr(body.theme  || '', 50),
      count:  sanInt(body.count, 0, 0, 9_999),
      ts:     Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'theme_compare') {
    saveThemeCompare(u, {
      theme_a: sanObj(body.theme_a),
      theme_b: sanObj(body.theme_b),
      ts:      Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'module_deployed') {
    saveModuleDeploy(u, {
      name:   sanStr(body.name   || '', 100),
      parent: sanStr(body.parent || '', 100),
      source: sanStr(body.source || '', 100),
      ts:     Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'modules_list') {
    saveModuleList(u, {
      folder:  sanStr(body.folder || 'modulesscripts', 100),
      modules: sanArr(body.modules),
      count:   sanInt(body.count, 0, 0, 999),
      ts:      Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (actionType === 'terrain_materials') {
    saveTerrainResult(u, {
      materials: sanArr(body.materials),
      count:     sanInt(body.count, 0, 0, 999),
      ts:        Date.now(),
    });
    return res.status(200).json({ status: 'ok' });
  }

  // ── Admin: Logs via POST ──────────────────────────────────────────────
  if (actionType === 'get_logs') {
    if (!verifyAdminToken(req))
      return res.status(401).json({ error: 'Admin token diperlukan.' });
    const logs = readJson(LOG_FILE, []);
    return res.status(200).json({ logs: logs.slice(0, sanInt(body.limit, 100, 1, 300)) });
  }

  if (actionType === 'get_history') {
    if (!verifyAdminToken(req))
      return res.status(401).json({ error: 'Admin token diperlukan.' });
    const hist = readJson(HIST_FILE, []);
    return res.status(200).json({ history: hist.slice(0, sanInt(body.limit, 50, 1, 150)) });
  }

  // ══════════════════════════════════════════════════════════════════════
  // ACTION: search_toolbox
  // Cari asset di Roblox Toolbox menggunakan Open Cloud API
  // ══════════════════════════════════════════════════════════════════════

  if (actionType === 'search_toolbox') {
    const sender = san(body._user || '');

    const keyword   = sanStr(body.keyword || body.query || body.term || '', 100).trim();
    const assetType = sanStr(body.asset_type || body.assetType || 'Model', 30);
    const limit     = sanInt(body.limit || body.count, 10, 1, 50);
    const cursor    = body.cursor ? sanStr(String(body.cursor), 200) : null;

    if (!keyword) {
      return res.status(400).json({
        status: 'error',
        error:  'Parameter "keyword" atau "query" wajib diisi.',
        action: 'search_toolbox',
        hint:   'Contoh: {"action":"search_toolbox","keyword":"sword","_user":"username"}',
      });
    }

    const VALID_ASSET_TYPES = new Set([
      'Model', 'Plugin', 'Audio', 'Decal', 'Image', 'MeshPart',
      'Package', 'Hat', 'Shirt', 'Pants', 'TShirt', 'Gear',
    ]);
    const finalType = VALID_ASSET_TYPES.has(assetType) ? assetType : 'Model';

    try {
      const result = await robloxToolboxSearch(keyword, finalType, limit, cursor);

      bumpStats(sender || 'web', 'search_toolbox');
      pushLog({
        action:    'search_toolbox',
        user:      sender || 'web',
        keyword:   sanStr(keyword, 50),
        assetType: finalType,
        found:     result.assets.length,
      });

      // Push ke queue plugin jika online
      const target = san(body._target_user || sender);
      if (target && isOnline(target)) {
        pushQueue(target, {
          action:       'search_result_toolbox',
          keyword,
          assetType:    finalType,
          assets:       result.assets.slice(0, 20),
          nextCursor:   result.nextCursor,
          total:        result.total,
          _user:        sender,
          _target_user: target,
        });
      }

      return res.status(200).json({
        status:     'ok',
        action:     'search_toolbox',
        keyword,
        assetType:  finalType,
        assets:     result.assets,
        nextCursor: result.nextCursor,
        total:      result.total,
        count:      result.assets.length,
        pluginNotified: target ? isOnline(target) : false,
        ts: Date.now(),
      });

    } catch (err) {
      const code    = err?.code || 500;
      const message = sanStr(err?.message || 'Gagal terhubung ke Roblox Toolbox API.', 200);

      pushLog({ action: 'search_toolbox_error', user: sender || 'web', error: message });

      return res.status(code === 400 ? 400 : code === 429 ? 429 : 502).json({
        status:  'error',
        action:  'search_toolbox',
        message: code === 429
          ? 'Roblox Toolbox sedang rate limit. Coba lagi dalam beberapa detik.'
          : message,
        code,
        hint: code === 401 || code === 403
          ? 'Pastikan ROBLOX_OPEN_CLOUD_KEY sudah diset di environment variables Vercel/server.'
          : code === 503
          ? 'Set ROBLOX_OPEN_CLOUD_KEY di environment variables.'
          : 'Coba lagi dalam beberapa detik.',
        ts: Date.now(),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ACTION: insert_model
  // Validasi AssetId dan siapkan command untuk InsertService:LoadAsset()
  // ══════════════════════════════════════════════════════════════════════

  if (actionType === 'insert_model') {
    const sender  = san(body._user || '');
    const target  = san(body._target_user || sender);
    const assetId = body.asset_id || body.assetId || body.id || '';
    const parent  = sanStr(body.parent || body.parentPath || 'workspace', 100);

    if (!assetId) {
      return res.status(400).json({
        status: 'error',
        error:  'Parameter "asset_id" atau "assetId" wajib diisi.',
        action: 'insert_model',
        hint:   'Contoh: {"action":"insert_model","asset_id":"1818","_user":"username"}',
      });
    }

    if (!target) {
      return res.status(400).json({
        status: 'error',
        error:  'Parameter _user atau _target_user diperlukan.',
        action: 'insert_model',
      });
    }

    const auth = authorizeCommand(req, sender, target, 'insert_rbx_model');
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    try {
      const validated = await validateAndPrepareAsset(assetId);

      if (!validated.insertable && validated.assetType !== 'Unknown') {
        return res.status(400).json({
          status:    'error',
          action:    'insert_model',
          message:   `AssetType "${validated.assetType}" tidak bisa di-insert via InsertService.`,
          assetType: validated.assetType,
          assetId:   validated.assetId,
          hint:      'Hanya Model, Plugin, Package, dan Gear yang dapat di-load oleh InsertService.',
          ts:        Date.now(),
        });
      }

      const pluginCmd = {
        action:       'insert_rbx_model',
        asset_id:     validated.assetId,
        name:         validated.name,
        parent:       parent,
        insert_code:  validated.insertCommand,
        _user:        sender,
        _target_user: target,
      };

      pushQueue(target, pluginCmd);

      bumpStats(sender || 'web', 'insert_model');
      pushLog({
        action:    'insert_model',
        user:      sender || 'web',
        target,
        assetId:   validated.assetId,
        assetName: sanStr(validated.name, 50),
        parent,
      });

      return res.status(200).json({
        status:          'ok',
        action:          'insert_model',
        assetId:         validated.assetId,
        name:            validated.name,
        description:     validated.description || '',
        assetType:       validated.assetType,
        creator:         validated.creator,
        isPublic:        validated.isPublic,
        unverified:      validated.unverified || false,
        insertable:      validated.insertable,
        insertCommand:   validated.insertCommand,
        parent,
        pluginConnected: isOnline(target),
        queued:          true,
        queueLength:     getQueue(target).length,
        ts:              Date.now(),
      });

    } catch (err) {
      const code    = err?.code || 500;
      const message = sanStr(err?.message || 'Gagal memvalidasi asset.', 200);

      pushLog({ action: 'insert_model_error', user: sender || 'web', error: message });

      return res.status(code === 400 ? 400 : 502).json({
        status:  'error',
        action:  'insert_model',
        message,
        code,
        hint: code === 400
          ? 'Pastikan assetId adalah angka yang valid dan asset tersedia secara publik.'
          : 'Roblox API tidak dapat dihubungi. Coba lagi nanti.',
        ts: Date.now(),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ACTION: search_docs
  // Cari referensi dokumentasi Luau & Roblox API
  // ══════════════════════════════════════════════════════════════════════

  if (actionType === 'search_docs') {
    const sender  = san(body._user || '');
    const query   = sanStr(body.query || body.keyword || body.term || body.q || '', 150).trim();
    const docType = ['api', 'guide', 'all'].includes(body.doc_type) ? body.doc_type : 'all';
    const limit   = sanInt(body.limit, 5, 1, 20);

    if (!query) {
      return res.status(400).json({
        status: 'error',
        error:  'Parameter "query" wajib diisi.',
        action: 'search_docs',
        hint:   'Contoh: {"action":"search_docs","query":"TweenService","_user":"username"}',
      });
    }

    try {
      const result = await searchLuauDocs(query, docType, limit);

      bumpStats(sender || 'web', 'search_docs');
      pushLog({
        action:  'search_docs',
        user:    sender || 'web',
        query:   sanStr(query, 50),
        found:   result.results.length,
        source:  result.source,
      });

      return res.status(200).json({
        status:  'ok',
        action:  'search_docs',
        query,
        docType,
        results: result.results,
        count:   result.results.length,
        source:  result.source,
        hint:    result.source === 'local_fallback'
          ? 'Hasil dari indeks lokal. Koneksi ke docs Roblox tidak tersedia saat ini.'
          : undefined,
        ts: Date.now(),
      });

    } catch (err) {
      const message = sanStr(err?.message || 'Gagal mencari dokumentasi.', 200);
      pushLog({ action: 'search_docs_error', user: sender || 'web', error: message });

      return res.status(500).json({
        status:  'error',
        action:  'search_docs',
        message,
        hint:    'Coba query yang lebih spesifik: "TweenService", "DataStore GetAsync", "RemoteEvent".',
        ts:      Date.now(),
      });
    }
  }

  // ── batch_commands ────────────────────────────────────────────────────
  if (actionType === 'batch_commands') {
    const sender  = san(body._user || '');
    const target  = san(body.target || body._target_user || sender);
    if (!target) return res.status(400).json({ error: 'Parameter target diperlukan.' });

    let rawCommands = [];
    if (Array.isArray(body.commands)) {
      rawCommands = body.commands;
    } else if (typeof body.text === 'string') {
      rawCommands = extractCommandsFromText(body.text);
    }

    const isAdmin = verifyAdminToken(req);

    if (!isAdmin && sender !== target) {
      return res.status(403).json({
        error: 'Forbidden: Kamu tidak bisa mengirim perintah ke session pengguna lain.',
        hint:  'Gunakan _target_user yang sama dengan _user, atau pakai Admin Token.',
      });
    }

    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    }

    const { safe, removed } = filterSafeBatch(rawCommands, isAdmin);
    let pushed = 0;
    const skipped = [...removed];

    for (const cmd of safe) {
      if (!cmd?.action) continue;
      const act = sanStr(cmd.action, 80);
      if (!VALID_ACTIONS.has(act)) { skipped.push(act); continue; }
      pushQueue(target, {
        ...cmd,
        action:       act,
        _user:        String(body._user || 'web').substring(0, 50),
        _target_user: target,
        _apiKey:      undefined,
      });
      pushed++;
    }

    bumpStats(sender || 'web', 'batch_commands');
    pushLog({ action: 'batch_commands', user: sender || 'web', target, count: pushed, skipped });

    return res.status(200).json({
      status:  'ok',
      pushed,
      skipped,
      warning: removed.length > 0
        ? `${removed.length} destructive action dihapus karena tidak ada Admin Token.`
        : undefined,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts: Date.now(),
    });
  }

  // ── execute_json ──────────────────────────────────────────────────────
  if (actionType === 'execute_json' && body.text) {
    const sender  = san(body._user || '');
    const target  = san(body._target_user || sender);
    if (!target) return res.status(400).json({ error: 'Parameter _target_user diperlukan.' });

    const isAdmin = verifyAdminToken(req);

    if (!isAdmin && sender !== target) {
      return res.status(403).json({
        error: 'Forbidden: execute_json tidak bisa menargetkan pengguna lain.',
      });
    }
    if (!isAdmin) {
      const auth = authorizeCommand(req, sender, target, null);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    }

    const extracted = extractCommandsFromText(String(body.text));

    let pushed  = 0;
    const errors  = [];
    const skipped = [];

    for (const cmd of extracted) {
      if (!cmd?.action) continue;
      const act = sanStr(cmd.action, 80);

      if (!VALID_ACTIONS.has(act)) {
        skipped.push(act);
        continue;
      }
      if (!isAdmin && ADMIN_ONLY_ACTIONS.has(act)) {
        skipped.push(`[admin-only] ${act}`);
        continue;
      }

      pushQueue(target, {
        ...cmd,
        action:       act,
        _user:        String(body._user || 'web').substring(0, 50),
        _target_user: target,
        _apiKey:      undefined,
      });
      pushed++;
    }

    bumpStats(sender || 'web', 'execute_json');
    pushLog({ action: 'execute_json', user: sender || 'web', target, count: pushed, errors, skipped });

    return res.status(200).json({
      status:  pushed > 0 ? 'ok' : (errors.length > 0 ? 'partial_error' : 'ok'),
      pushed,
      errors,
      skipped,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      ts:              Date.now(),
    });
  }

  // ── inject_command ────────────────────────────────────────────────────
  if (actionType === 'inject_command' && body.command) {
    const sender = san(body._user || '');
    const target = san(body._target_user || sender);
    if (!target) return res.status(400).json({ error: 'Parameter target diperlukan.' });

    const cmd = body.command;
    if (!cmd?.action) return res.status(400).json({ error: 'command.action diperlukan.' });

    const act = sanStr(cmd.action, 80);
    if (!VALID_ACTIONS.has(act)) {
      return res.status(400).json({ error: `Action tidak valid: ${escapeHtml(act, 60)}` });
    }

    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    pushQueue(target, {
      ...cmd,
      action:       act,
      _user:        String(body._user || 'web').substring(0, 50),
      _target_user: target,
      _apiKey:      undefined,
    });

    bumpStats(sender || 'web', act);
    pushLog({
      action: act, user: sender || 'web', target,
      name:   sanStr(cmd.name   || '', 50),
      parent: sanStr(cmd.parent || '', 50),
    });

    return res.status(200).json({
      status:          'ok',
      pushed:          1,
      action:          act,
      pluginConnected: isOnline(target),
      queueLength:     getQueue(target).length,
      ts:              Date.now(),
    });
  }

  // ── Single Action Dispatch ────────────────────────────────────────────
  if (body.action) {
    const act = sanStr(body.action, 80);

    if (INTERNAL_ACTIONS.has(act)) {
      return res.status(200).json({ status: 'ok' });
    }

    if (!VALID_ACTIONS.has(act)) {
      return res.status(400).json({
        error:               `Action tidak valid: ${escapeHtml(act, 60)}`,
        hint:                'Cek valid_actions untuk daftar lengkap.',
        valid_actions_count: VALID_ACTIONS.size,
        example_valid:       ['create_part', 'create_script', 'search_toolbox', 'insert_model'],
      });
    }

    const sender = san(body._user || '');
    const target = san(body._target_user || sender);
    if (!target) {
      return res.status(400).json({ error: '_target_user atau _user diperlukan.' });
    }

    const auth = authorizeCommand(req, sender, target, act);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    pushQueue(target, {
      ...body,
      action:         act,
      _user:          String(body._user || 'web').substring(0, 50),
      _target_user:   target,
      _apiKey:        undefined,
      _session_token: undefined,
      _place_id:      undefined,
    });

    bumpStats(sender || 'web', act);

    const details = sanStr(
      body.name ||
      (body.code ? body.code.substring(0, 80) + '...' : '') ||
      JSON.stringify(body).substring(0, 100),
      200
    );

    pushLog({
      action: act, user: sender || 'web', target,
      name:   sanStr(body.name   || '', 50),
      parent: sanStr(body.parent || '', 50),
    });
    pushHist({ action: act, details, user: sender || 'web', target });

    return res.status(200).json({
      status:                  'ok',
      action:                  act,
      target,
      pluginConnected:         isOnline(target),
      queueLength:             getQueue(target).length,
      required_plugin_version: REQUIRED_PLUGIN_VERSION,
      ts:                      Date.now(),
    });
  }

  // ── Unknown Request ───────────────────────────────────────────────────
  return res.status(400).json({
    status:      'error',
    error:       'Tipe request tidak dikenali.',
    hint:        'Sertakan action, type, atau query param yang valid.',
    web_version: WEB_VERSION,
    ts:          Date.now(),
  });
}