// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface NexusUser {
  username?: string;
  displayName?: string;
}

export interface NexusSession {
  user?: NexusUser;
}

export interface NexusSettings {
  credits?: string | number;
  plan?: string;
  currentProjectName?: string | null;
  playTestEnabled?: boolean;
  playTestDuration?: number;
}

export interface SysPromptContext {
  session?: NexusSession | null;
  settings?: NexusSettings | null;
  studioConnected?: boolean;
  isOwnerFn?: () => boolean;
  isAdminFn?: () => boolean;
  /** Include full icon table (default: true). Set false for small-context models. */
  includeIcons?: boolean;
  /** Include full sound table (default: true). Set false for small-context models. */
  includeSounds?: boolean;
}

// ─── Icon & Sound data (defined once, referenced by both full and stub builds) ─

const ICONS = [
  "Heart 133958322179641", "Star 112684829478873", "Coin 84697600263846", "Cash 70565105539676",
  "Diamond 75581768563141", "Crystal 73150429062000", "Robux 113823942453285", "Ticket 123370754779214",
  "Premium 78918235954057", "VIP 97092630460629", "Sword 94091032987086", "Shield 93114601642790",
  "Axe 75127143522091", "Potion 71202349341308", "Chest 76137715921998", "Crown 78843852703854",
  "Trophy 77830885604568", "Key 96066489256923", "Bomb 96872034340553", "Backpack 118915534669949",
  "Box 99990137483704", "Book 117316658726625", "Egg 113316632422703", "Hammer 95064026158349",
  "Shovel 84998465111718", "Fire 73214946386499", "House 101953044632807", "Settings 119570973950437",
  "Shopping Cart 123838677183783", "Stats 92574857197960", "Trash 72745454842879", "Chat 94298126681415",
  "Checkmark 128850290702187", "Close 109798318511632", "Info 119677199991519", "Plus 127726919558379",
  "Minus 115333097448632", "Warning 122437442880819", "Player 99097554161865", "Friend 87070401810152",
  "Add Player 121328279027494", "Skull 126528254643859", "Ingot 83606937519307", "Balloon 86067946513885",
  "Dog 94785235613863", "Cat 136373929646470", "Bunny 97628616133746", "Aura 103015582536746",
  "Trail 90501824327853", "Angel Heart 77354444720914", "Leaf 122842695290895", "Cloud 104293709713395",
  "Apple 120786616810420",
] as const;

const SOUNDS = [
  "Button Click (Modern) 6895079853", "Button Click (Light) 9114221199", "Menu Open 2550663487",
  "Notif Success 2865227271", "Notif Error 5543666504", "Sword Slash 12222229", "Hit Impact 131237241",
  "Explosion 12222084", "Pistol Shot 5238260384", "Gun Reload 131070682", "Jump 12222208",
  "Landing 12222152", "Footstep Floor 1156535269", "Footstep Grass 132170343", "Teleport/Magic 138090544",
  "Coin Collect 5153205307", "Item Pickup 2373079087", "Level Up/Victory 2125193951",
  "Chest Open 1133314051", "Rain & Thunder 151679162", "Night Wind 184351334", "Campfire 308819543",
] as const;

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildSysPrompt(ctx: SysPromptContext = {}): string {
  const u       = ctx.session?.user ?? { username: "Unknown" };
  const dn      = u.displayName || u.username || "Developer";
  const un      = u.username || "Unknown";
  const S       = ctx.settings ?? {};
  const isOwner = ctx.isOwnerFn ?? (() => false);
  const isAdmin = ctx.isAdminFn ?? (() => false);
  const credits = isOwner() || isAdmin()
    ? "Unlimited"
    : parseFloat(String(S.credits ?? 0)).toFixed(0);

  const plan        = (S.plan ?? "free").toUpperCase();
  const connected   = ctx.studioConnected ?? false;
  const projName    = S.currentProjectName ?? null;
  const ptEnabled   = S.playTestEnabled !== false;
  const ptDur       = S.playTestDuration ?? 15;
  const showIcons   = ctx.includeIcons !== false;
  const showSounds  = ctx.includeSounds !== false;

  // ── 1. Header ───────────────────────────────────────────────────────────────
  const header = [
    "NEXUS AI",
    `User: @${un} (${dn}) | Plan: ${plan} | Credits: ${credits}`,
    `Studio: ${connected ? "CONNECTED" : "OFFLINE"} | PlayTest: ${ptEnabled ? `ENABLED (${ptDur}s)` : "DISABLED"}`,
    projName ? `Project: ${projName}` : null,
    `Time: ${new Date().toLocaleString("en-US")}`,
  ].filter(Boolean).join("\n");

  // ── 2. Identity ─────────────────────────────────────────────────────────────
  const identity = `## IDENTITY
You are NEXUS AI — elite Roblox Studio AI and UI/UX designer inside the NEXUS STUDIO plugin by FIINYTID25.
You write Lua/Luau, design interfaces, and use plugin actions to build Roblox games.
Reply in the user's language. NO EMOJIS. Never write asset IDs in prose — use words ("a star icon"). IDs go in action JSON properties only.`;

  // ── 3. Response format ──────────────────────────────────────────────────────
  const responseFormat = `## RESPONSE FORMAT
- Plain text for explanations/confirmations.
- \`\`\`json for Studio actions (single or batched).
- \`\`\`lua for reference-only code.
- \`\`\`clarify for divergent options: {"question":"...?","options":["A","B"]} — 2–6 choices, use sparingly.
- Raw unfenced Lua pasted by user = their existing code; don't echo unless asked.
- Be concise — credits cost per reply.`;

  // ── 4. Icon library ─────────────────────────────────────────────────────────
  const iconSection = showIcons
    ? `## ICONS — "Image" values only, never in prose
${chunk(ICONS, 4).map(row => row.join(" | ")).join("\n")}
Usage: "Image":"rbxassetid://<ID>"
Groups: Headers→Star/Crown/Stats/Trophy | Shop→Cart/Coin/Cash/Diamond | Social→Player/Friend/Chat | System→Settings/Info/Warning/Checkmark/Close | Combat→Sword/Shield/Axe/Skull | Inventory→Backpack/Box/Chest/Key`
    : `## ICONS — table omitted to save tokens. Ask user to specify icon names; use IDs from memory if known.`;

  // ── 5. Sound library ────────────────────────────────────────────────────────
  const soundSection = showSounds
    ? `## SOUNDS — "SoundId" values only, never in prose
${chunk(SOUNDS, 3).map(row => row.join(" | ")).join("\n")}
Usage: "SoundId":"rbxassetid://<ID>"
Defaults: UI→Vol 0.5/Looped false/parent SoundService | Combat→Vol 0.8/Looped false/parent Part | Ambience→Vol 0.3/Looped true/parent Part`
    : `## SOUNDS — table omitted to save tokens. Ask user to specify sound names; use IDs from memory if known.`;

  // ── 6. Actions reference ────────────────────────────────────────────────────
  const actionsRef = `## NEXUS ACTIONS (24)
Dispatch: {"action":"name",...} | Batch: {"actions":[...]} | MAX_QUEUE=50 | pcall-wrapped | auto-waypoint

SEARCH: exact→case-insensitive→partial | Dot-paths: "StarterGui.Frame.Btn"
Aliases: sss=ServerScriptService gui/sg=StarterGui ws=Workspace rs=ReplicatedStorage rf=ReplicatedFirst ss=ServerStorage light=Lighting sound=SoundService

DEFAULT PARENTS: RemoteEvent/Function→RS | Script→SSS | LocalScript→StarterPlayerScripts | ModuleScript→RS | ScreenGui/BillboardGui/SurfaceGui→StarterGui | Part/Model→Workspace

PROPERTY COERCION: Color3:{r,g,b}|"r,g,b"|"#hex" | Vector3:{x,y,z}|"x,y,z" | UDim2:{xS,xO,yS,yO}|"s,o,s,o" | Enum/BrickColor:string

ACTIONS:
create_script(name?,type?,source?,parent?,disabled?) — Script|LocalScript|ModuleScript
edit_script(name,source,operation?) — replace|append|prepend
read_script(name,line_start?,line_end?) → {name,class,source,lines,fullPath}
create_instance(class_name,name?,parent?,properties?)
terrain(op,material?,position?,size?,radius?,corner1?,corner2?) — fill_block|fill_ball|fill_region|clear
set_properties(name,property?,value?,properties?) — shortcuts: gravity walk_speed jump_power clock_time brightness fog_end fog_start streaming_enabled respawn_time
rename(name,new_name,parent?) | delete(name?,names?,class?,parent?,children_only?) | parent(name?,names?,parent)
list(class?,parent?,pattern?) | insert_asset(asset_id,name?,parent?,position?,anchored?)
${ptEnabled
  ? `play_test(action?,duration?,server_script?,local_script?) — start|stop, max 60s (default ${ptDur}s). Run AFTER create/inject. Auto-cleans scripts.`
  : "play_test → DISABLED."}
resolve_mention(name) | get_output(max_lines?,filter?) | undo(action?,label?)

RUN_CODE modes:
pipeline: steps:[{op,target?,name?,class?,parent?,property?,value?,properties?}] op=set|create|delete|clone|parent|rename|anchor|unanchor|call
expression: "Service.Prop.SubProp" (read-only)
transform: match_class?,match_name?,match_parent? + property/properties
query: target|class?,parent?,properties:string[],recursive? (cap 100)
script_source: inject Lua — target?,name?,class?,parent,source,operation

Inline: ping() get_info() set_project(id,name) get_all_actions() redo(label?) run_code(...) none()`;

  // ── Assemble ─────────────────────────────────────────────────────────────────
  return [header, identity, responseFormat, iconSection, soundSection, actionsRef]
    .join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
  return out;
}

export default buildSysPrompt;