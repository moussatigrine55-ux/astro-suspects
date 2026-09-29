// server/src/env.ts
import { existsSync } from "node:fs";
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
  }
}

// server/src/index.ts
import express from "express";
import { createServer } from "node:http";
import { existsSync as existsSync2 } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

// server/src/logger.ts
var quiet = process.env.LOG_LEVEL === "quiet";
var verboseEvents = /* @__PURE__ */ new Set(["REJECTED", "VENT", "TASK_DONE"]);
function log(event, fields = {}) {
  if (quiet && event !== "ERROR" && event !== "SERVER_START") return;
  if (verboseEvents.has(event) && process.env.LOG_LEVEL !== "verbose") return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  console.log(`${(/* @__PURE__ */ new Date()).toISOString()} ${event} ${parts.join(" ")}`);
}

// server/src/rateLimit.ts
var TokenBucket = class {
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
  }
  rate;
  burst;
  tokens;
  last = Date.now();
  take(n = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) / 1e3 * this.rate);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
};
var SocketLimiter = class {
  buckets = {
    move: new TokenBucket(45, 60),
    chat: new TokenBucket(1, 5),
    action: new TokenBucket(15, 30),
    meta: new TokenBucket(3, 10)
  };
  strikes = 0;
  allow(kind) {
    const ok = this.buckets[kind].take();
    if (!ok) this.strikes++;
    return ok;
  }
  /** Trop d'abus -> déconnexion. */
  get abusive() {
    return this.strikes > 500;
  }
};
var IpLimiter = class {
  constructor(perMinute, burst) {
    this.perMinute = perMinute;
    this.burst = burst;
  }
  perMinute;
  burst;
  map = /* @__PURE__ */ new Map();
  allow(ip) {
    let b = this.map.get(ip);
    if (!b) {
      b = new TokenBucket(this.perMinute / 60, this.burst);
      this.map.set(ip, b);
      if (this.map.size > 1e4) this.map.clear();
    }
    return b.take();
  }
};

// server/src/rooms.ts
import { randomInt as randomInt2 } from "node:crypto";

// server/src/game/Room.ts
import { randomBytes, randomInt } from "node:crypto";

// shared/constants.ts
var TICK_RATE = 20;
var PLAYER_RADIUS = 18;
var BASE_SPEED = 210;
var BASE_VISION = 330;
var KILL_DISTANCES = { short: 110, normal: 150, long: 200 };
var REPORT_DISTANCE = 170;
var USE_DISTANCE = 95;
var EMERGENCY_DISTANCE = 110;
var VENT_DISTANCE = 70;
var GRID = 10;
var MIN_PLAYERS = 4;
var MAX_PLAYERS = 20;
var EJECTION_TIME = 7;
var GAME_OVER_TIME = 10;
var STARTING_TIME = 4;
var LIGHT_SWITCHES = 5;
var COLORS = [
  { name: "Rouge", main: "#d7263d", shade: "#8c1526" },
  { name: "Bleu", main: "#1f4fd6", shade: "#12308a" },
  { name: "Vert", main: "#1c9b3f", shade: "#0f5f25" },
  { name: "Rose", main: "#ec5fbd", shade: "#a53382" },
  { name: "Orange", main: "#f28a1d", shade: "#b35a0b" },
  { name: "Jaune", main: "#f4e04d", shade: "#b8a126" },
  { name: "Noir", main: "#3d4450", shade: "#1d2129" },
  { name: "Blanc", main: "#e6ecf5", shade: "#9aa6bd" },
  { name: "Violet", main: "#7b3fd1", shade: "#4a2288" },
  { name: "Marron", main: "#7a4a2a", shade: "#4a2a14" },
  { name: "Cyan", main: "#34e4e0", shade: "#1b9a9c" },
  { name: "Citron", main: "#78f050", shade: "#46a82c" },
  { name: "Bordeaux", main: "#6f1f36", shade: "#40101f" },
  { name: "Corail", main: "#f07a6e", shade: "#b04a42" },
  { name: "Beige", main: "#d6c19a", shade: "#978060" },
  { name: "Gris", main: "#8a95a5", shade: "#5a6372" },
  { name: "Turquoise", main: "#1aa3a0", shade: "#0e6664" },
  { name: "Lavande", main: "#b8a4ff", shade: "#7b67c4" }
];
var HATS = ["none", "cap", "tophat", "crown", "beanie", "party", "chef", "cowboy", "horns", "headphones", "propeller", "flower", "halo", "witch", "bandana", "antenna", "cat", "viking"];
var SKINS = ["none", "stripes", "overalls", "tux", "labcoat", "camo", "stars", "police", "doctor", "scarf"];
var PETS = ["none", "drone", "blob", "cat", "robot", "fishbowl", "bat", "dino"];
var VISORS = ["glass", "gold", "mirror", "green", "pink", "night"];
var TRAILS = ["none", "sparkles", "bubbles", "hearts", "flames", "notes"];
var ROLE_INFO = {
  crewmate: { name: "\xC9quipier", team: "crew", color: "#8ce0ff", description: "Termine tes t\xE2ches et d\xE9masque les imposteurs." },
  impostor: { name: "Imposteur", team: "impostor", color: "#ff3b3b", description: "\xC9limine l'\xE9quipage sans te faire prendre. Sabote et utilise les conduits." },
  sheriff: { name: "Sh\xE9rif", team: "crew", color: "#f5c542", description: "Tu peux tirer sur un suspect. Si ce n'est pas un imposteur, tu meurs." },
  engineer: { name: "Ing\xE9nieur", team: "crew", color: "#f28a1d", description: "Tu peux utiliser les conduits pendant un temps limit\xE9." },
  scientist: { name: "Scientifique", team: "crew", color: "#3ddc97", description: "Consulte les signes vitaux de tous depuis n'importe o\xF9 (batterie limit\xE9e)." },
  guardianAngel: { name: "Ange gardien", team: "crew", color: "#c9e6ff", description: "Une fois mort, prot\xE8ge un vivant contre une \xE9limination." },
  tracker: { name: "Traqueur", team: "crew", color: "#b18cff", description: "Suis la position d'un joueur pendant quelques secondes." }
};
var SPECIAL_ROLES = ["sheriff", "engineer", "scientist", "guardianAngel", "tracker"];
var DEFAULT_SETTINGS = {
  mapId: "nautile",
  maxPlayers: 15,
  impostors: "auto",
  playerSpeed: 1,
  crewVision: 1,
  impostorVision: 1.5,
  killCooldown: 25,
  killDistance: "normal",
  commonTasks: 1,
  longTasks: 1,
  shortTasks: 3,
  taskBarUpdates: "always",
  visualTasks: true,
  disabledTasks: [],
  emergencyMeetings: 1,
  emergencyCooldown: 15,
  discussionTime: 15,
  votingTime: 90,
  anonymousVotes: false,
  confirmEjects: true,
  sabotageCooldown: 25,
  criticalTime: 40,
  doorCloseTime: 10,
  lightsVision: 0.25,
  ghostSpeed: 1.5,
  ghostsDoTasks: true,
  ghostsSeeRoles: true,
  proximityVoice: true,
  voiceDistance: 520,
  voiceWallOcclusion: true,
  forcePushToTalk: false,
  roles: {
    sheriff: { count: 0, cooldown: 30, misfireKillsTarget: false },
    engineer: { count: 0, ventCooldown: 20, ventDuration: 10 },
    scientist: { count: 0, cooldown: 15, batteryDuration: 8 },
    guardianAngel: { count: 0, cooldown: 35, protectDuration: 15 },
    tracker: { count: 0, cooldown: 20, duration: 8 }
  }
};

// shared/geometry.ts
var inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
var MapGrid = class {
  constructor(map) {
    this.map = map;
    this.cols = Math.ceil(map.width / GRID);
    this.rows = Math.ceil(map.height / GRID);
    const n = this.cols * this.rows;
    this.walk = new Uint8Array(n);
    this.clear = new Uint8Array(n);
    this.doorBlock = new Uint8Array(n);
    const floors = [...map.rooms, ...map.corridors, ...map.outdoor ?? []];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * GRID + GRID / 2;
        const y = cy * GRID + GRID / 2;
        const i = cy * this.cols + cx;
        if (floors.some((r) => inside(r, x, y))) {
          this.clear[i] = 1;
          this.walk[i] = map.props.some((p) => inside(p, x, y)) ? 0 : 1;
        }
      }
    }
    for (const d of map.doors) {
      const cells = [];
      for (let cy = Math.floor(d.y / GRID); cy < Math.ceil((d.y + d.h) / GRID); cy++)
        for (let cx = Math.floor(d.x / GRID); cx < Math.ceil((d.x + d.w) / GRID); cx++)
          if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) cells.push(cy * this.cols + cx);
      this.doorCells.set(d.id, cells);
    }
  }
  map;
  cols;
  rows;
  /** 1 = on peut marcher */
  walk;
  /** 1 = la lumière passe (sol) */
  clear;
  /** nombre de portes fermées qui bloquent la cellule */
  doorBlock;
  doorCells = /* @__PURE__ */ new Map();
  idx(x, y) {
    const cx = Math.floor(x / GRID);
    const cy = Math.floor(y / GRID);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
    return cy * this.cols + cx;
  }
  setDoor(id, closed) {
    const cells = this.doorCells.get(id);
    if (!cells) return;
    for (const c of cells) this.doorBlock[c] = Math.max(0, this.doorBlock[c] + (closed ? 1 : -1));
  }
  isWalkable(x, y) {
    const i = this.idx(x, y);
    return i >= 0 && this.walk[i] === 1 && this.doorBlock[i] === 0;
  }
  isClear(x, y) {
    const i = this.idx(x, y);
    return i >= 0 && this.clear[i] === 1 && this.doorBlock[i] === 0;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.map.width && y < this.map.height;
  }
  /** Le cercle du joueur (rayon r) tient-il à cette position ? */
  canStand(x, y, r) {
    if (!this.isWalkable(x, y)) return false;
    const rr = r * 0.8;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      if (!this.isWalkable(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6)) return false;
    }
    return true;
  }
  /** Déplacement avec glissement le long des murs. */
  move(x, y, dx, dy, r) {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / 4));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let s2 = 0; s2 < steps; s2++) {
      if (this.canStand(x + sx, y + sy, r)) {
        x += sx;
        y += sy;
        continue;
      }
      if (sx !== 0 && this.canStand(x + sx, y, r)) {
        x += sx;
        continue;
      }
      if (sy !== 0 && this.canStand(x, y + sy, r)) {
        y += sy;
        continue;
      }
    }
    return { x, y };
  }
  /** Vérifie qu'un segment de déplacement ne traverse aucun mur (validation serveur). */
  pathClear(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / 4));
    for (let s2 = 1; s2 <= steps; s2++) {
      const t = s2 / steps;
      if (!this.isWalkable(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }
  /** Ligne de vue (les murs et portes fermées bloquent, pas le mobilier). */
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let s2 = 1; s2 < steps; s2++) {
      const t = s2 / steps;
      if (!this.isClear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }
  /** Distance jusqu'au premier mur dans une direction (champ de vision). */
  ray(x, y, ang, max) {
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    const step = 5;
    for (let d = step; d <= max; d += step) {
      if (!this.isClear(x + cx * d, y + cy * d)) {
        let lo = d - step;
        let hi = d;
        for (let k = 0; k < 4; k++) {
          const mid = (lo + hi) / 2;
          if (this.isClear(x + cx * mid, y + cy * mid)) lo = mid;
          else hi = mid;
        }
        return hi + 8;
      }
    }
    return max;
  }
  roomAt(x, y) {
    for (const r of this.map.rooms) if (inside(r, x, y)) return r.id;
    return null;
  }
  /** Point praticable le plus proche (utilisé pour les apparitions). */
  nearestStandable(x, y, r) {
    if (this.canStand(x, y, r)) return { x, y };
    for (let rad = 10; rad < 600; rad += 10) {
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (this.canStand(px, py, r)) return { x: px, y: py };
      }
    }
    return { x, y };
  }
};

// shared/maps/builder.ts
var U = 100;
var s = (v) => Math.round(v * U);
var MapBuilder = class {
  constructor(base) {
    this.base = base;
  }
  base;
  rooms = [];
  corridors = [];
  outdoor = [];
  props = [];
  doors = [];
  vents = [];
  stations = [];
  cameras = [];
  counters = /* @__PURE__ */ new Map();
  room(id, name, x, y, w, h, floor = "metal") {
    this.rooms.push({ id, name, x: s(x), y: s(y), w: s(w), h: s(h), floor });
    return this;
  }
  cor(x, y, w, h, floor) {
    this.corridors.push({ x: s(x), y: s(y), w: s(w), h: s(h), floor });
    return this;
  }
  out(x, y, w, h) {
    this.outdoor.push({ x: s(x), y: s(y), w: s(w), h: s(h) });
    return this;
  }
  prop(kind, x, y, w, h) {
    this.props.push({ kind, x: s(x), y: s(y), w: s(w), h: s(h) });
    return this;
  }
  /** Porte verticale (traverse un couloir horizontal). */
  doorV(id, room, x, y, len = 1.2) {
    this.doors.push({ id, room, x: s(x), y: s(y), w: s(0.2), h: s(len), vertical: true });
    return this;
  }
  /** Porte horizontale (traverse un couloir vertical). */
  doorH(id, room, x, y, len = 1.2) {
    this.doors.push({ id, room, x: s(x), y: s(y), w: s(len), h: s(0.2), vertical: false });
    return this;
  }
  vent(id, room, x, y, links) {
    this.vents.push({ id, room, x: s(x), y: s(y), links });
    return this;
  }
  st(kind, room, x, y) {
    const key = `${kind}@${room}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    this.stations.push({ id: `${key}#${n}`, kind, room, x: s(x), y: s(y) });
    return this;
  }
  cam(id, name, x, y, vx, vy, vw, vh) {
    this.cameras.push({ id, name, x: s(x), y: s(y), view: { x: s(vx), y: s(vy), w: s(vw), h: s(vh) } });
    return this;
  }
  build(extra) {
    const b = this.base;
    return {
      id: b.id,
      name: b.name,
      theme: b.theme,
      width: s(b.width),
      height: s(b.height),
      background: b.background,
      sabotages: b.sabotages,
      criticalName: b.criticalName,
      rooms: this.rooms,
      corridors: this.corridors,
      outdoor: this.outdoor.length ? this.outdoor : void 0,
      props: this.props,
      doors: this.doors,
      vents: this.vents,
      stations: this.stations,
      cameras: this.cameras,
      emergencyButton: { x: s(extra.button[0]), y: s(extra.button[1]) },
      spawn: { x: s(extra.spawn[0]), y: s(extra.spawn[1]), radius: s(extra.spawn[2]) },
      meetingSpawn: extra.meetingSpawn ? { x: s(extra.meetingSpawn[0]), y: s(extra.meetingSpawn[1]), radius: s(extra.meetingSpawn[2]) } : void 0,
      extraSpawns: extra.extraSpawns?.map(([x, y]) => ({ x: s(x), y: s(y) }))
    };
  }
};

// shared/maps/nautile.ts
var nautile = new MapBuilder({
  id: "nautile",
  name: "Le Nautile",
  theme: "Vaisseau spatial",
  width: 43,
  height: 25.6,
  background: "#05070f",
  sabotages: ["lights", "comms", "reactor", "o2"],
  criticalName: "Fusion du r\xE9acteur"
}).room("cafe", "Caf\xE9t\xE9ria", 17, 2, 7, 6, "tile").room("armory", "Armurerie", 28, 2, 5, 5, "metal").room("o2", "Oxyg\xE8ne", 26, 10, 4, 3, "lab").room("nav", "Navigation", 37, 10, 5, 6, "dark").room("shields", "Boucliers", 30, 19, 5, 5, "metal").room("comms", "Communications", 23, 21, 5, 4, "grate").room("storage", "Stockage", 16, 17, 6, 7, "grate").room("admin", "Administration", 24, 14, 5, 4, "carpet").room("elec", "\xC9lectricit\xE9", 10, 16, 5, 4.6, "grate").room("lowEngine", "Moteur inf\xE9rieur", 2, 18, 6, 5, "metal").room("upEngine", "Moteur sup\xE9rieur", 2, 3, 6, 5, "metal").room("reactor", "R\xE9acteur", 0.4, 10, 4, 5, "dark").room("security", "S\xE9curit\xE9", 8, 10, 3, 4, "carpet").room("medbay", "Infirmerie", 12, 9, 4, 4, "lab").cor(8, 4.4, 9, 1.2).cor(13.4, 5.6, 1.2, 3.4).cor(24, 4, 4, 1.2).cor(30.4, 7, 1.2, 5.6).cor(30, 11.4, 7, 1.2).cor(38, 16, 1.2, 6.2).cor(35, 21, 4.2, 1.2).cor(20, 8, 1.2, 9).cor(21.2, 15, 2.8, 1.2).cor(21.2, 11, 4.8, 1.2).cor(22, 22, 1, 1.2).cor(28, 22, 2, 1.2).cor(8, 21.4, 8, 1.2).cor(12, 20.6, 1.2, 0.8).cor(4.4, 8, 1.2, 10).cor(5.6, 11.4, 2.4, 1.2).prop("table", 18.2, 3, 1.2, 0.8).prop("table", 21.6, 3, 1.2, 0.8).prop("table", 18.2, 6.2, 1.2, 0.8).prop("table", 21.6, 6.2, 1.2, 0.8).prop("table", 20.15, 4.75, 0.7, 0.5).prop("engine", 3, 4.2, 2.4, 2.6).prop("engine", 3, 19.2, 2.4, 2.6).prop("reactor", 1.2, 11.8, 1.8, 1.4).prop("console", 8.3, 10.1, 1.6, 0.5).prop("bed", 12.2, 9.2, 1.4, 0.7).prop("bed", 14.4, 9.2, 1.4, 0.7).prop("shelf", 10.8, 16.05, 2, 0.4).prop("crate", 17, 18, 1.2, 1.2).prop("crate", 19.6, 20.2, 1.4, 1.4).prop("barrel", 17.2, 22.4, 0.9, 0.8).prop("table", 25.6, 15.4, 1.8, 1.1).prop("console", 41.2, 11.8, 0.6, 2.4).prop("tank", 26.2, 10.15, 0.8, 0.7).prop("console", 30, 2.1, 1.4, 0.5).prop("console", 32, 19.1, 1.2, 0.5).prop("console", 24.2, 21.1, 2, 0.5).doorV("cafe_w", "cafe", 16.8, 4.4).doorV("cafe_e", "cafe", 24, 4).doorH("cafe_s", "cafe", 20, 8).doorH("stor_n", "storage", 20, 16.8).doorV("stor_w", "storage", 15.8, 21.4).doorV("stor_e", "storage", 22, 22).doorH("elec_s", "elec", 12, 20.8).doorH("med_n", "medbay", 13.4, 8.8).doorV("sec_w", "security", 7.8, 11.4).doorV("upe_e", "upEngine", 8, 4.4).doorH("upe_s", "upEngine", 4.4, 8).doorV("lowe_e", "lowEngine", 8, 21.4).doorH("lowe_n", "lowEngine", 4.4, 17.8).vent("v_upe", "upEngine", 6.6, 3.8, ["v_reac", "v_lowe"]).vent("v_reac", "reactor", 2.8, 10.6, ["v_upe", "v_lowe"]).vent("v_lowe", "lowEngine", 6.6, 22.4, ["v_upe", "v_reac"]).vent("v_sec", "security", 10.4, 13.4, ["v_med", "v_elec"]).vent("v_med", "medbay", 15.4, 12.4, ["v_sec", "v_elec"]).vent("v_elec", "elec", 13.8, 17, ["v_sec", "v_med"]).vent("v_cafe", "cafe", 23.3, 2.6, ["v_admin", "v_hall"]).vent("v_admin", "admin", 28.4, 17.4, ["v_cafe", "v_hall"]).vent("v_hall", "cafe", 20.6, 13.6, ["v_cafe", "v_admin"]).vent("v_arm", "armory", 28.6, 6.4, ["v_nav1"]).vent("v_nav1", "nav", 37.6, 10.6, ["v_arm"]).vent("v_nav2", "nav", 37.6, 15.4, ["v_shi"]).vent("v_shi", "shields", 34.4, 23.4, ["v_nav2"]).st("wires", "elec", 10.5, 16.6).st("wires", "storage", 16.5, 20.5).st("wires", "admin", 28.5, 14.5).st("wires", "nav", 37.5, 12.6).st("wires", "security", 10.6, 12.2).st("wires", "cafe", 17.5, 2.5).st("card", "admin", 27.4, 17.5).st("numbers", "reactor", 3.8, 10.5).st("download", "cafe", 23.5, 7.4).st("download", "comms", 26.8, 21.5).st("download", "elec", 14.5, 16.6).st("download", "nav", 41.5, 15.4).st("download", "armory", 32.5, 6.5).st("upload", "admin", 24.5, 17.5).st("fuel_get", "storage", 21.4, 17.6).st("fuel_put", "upEngine", 5.8, 7.4).st("fuel_put", "lowEngine", 5.8, 18.6).st("scan", "medbay", 14.4, 11.6).st("simon", "reactor", 3.9, 14.5).st("garbage", "cafe", 17.6, 7.4).st("garbage", "o2", 29.4, 12.5).st("garbage_out", "storage", 18.8, 23.5).st("asteroids", "armory", 29.2, 4.4).st("engine", "upEngine", 7.4, 3.5).st("engine", "lowEngine", 7.4, 22.5).st("course", "nav", 40.6, 13).st("shields", "shields", 32.6, 20).st("thermo", "o2", 26.6, 12.5).st("leaves", "o2", 29.4, 10.5).st("calibrate", "elec", 14.5, 20).st("fix_lights", "elec", 10.5, 19.5).st("fix_comms", "comms", 27.5, 24.4).st("fix_reactor", "reactor", 0.9, 10.6).st("fix_reactor", "reactor", 0.9, 14.4).st("fix_o2", "o2", 27.6, 10.5).st("fix_o2", "admin", 28.5, 16.2).st("security", "security", 9.1, 10.9).st("admin", "admin", 26.5, 15.95).cam("cam_up", "Couloir sup\xE9rieur", 12, 5, 8, 2.5, 9, 5.5).cam("cam_nav", "Couloir navigation", 34, 12, 29.5, 9, 8.5, 6).cam("cam_admin", "Administration", 22.5, 15.6, 19, 12, 10, 6).cam("cam_low", "Couloir inf\xE9rieur", 10, 22, 6, 18.5, 10, 6).build({ button: [20.5, 5], spawn: [20.5, 5, 1.7] });

// shared/maps/mirage.ts
var mirage = new MapBuilder({
  id: "mirage",
  name: "Station Mirage",
  theme: "Base scientifique",
  width: 39,
  height: 24.6,
  background: "#0a1a2e",
  sabotages: ["lights", "comms", "reactor", "o2"],
  criticalName: "Surcharge du r\xE9acteur"
}).room("launch", "Rampe de lancement", 1, 13, 6, 5, "grate").room("lockers", "Vestiaires", 10, 13, 4, 4, "tile").room("medbay", "Infirmerie", 10, 7, 4, 4, "lab").room("comms", "Communications", 16, 7, 4, 4, "dark").room("reactor", "R\xE9acteur", 8, 1, 6, 4, "dark").room("lab", "Laboratoire", 16, 1, 7, 4, "lab").room("hub", "Carrefour", 21, 12, 3, 4, "metal").room("office", "Bureau", 26, 5, 5, 4, "carpet").room("admin", "Administration", 33, 5, 5, 4, "carpet").room("greenhouse", "Serre", 27, 0.2, 9, 3.8, "grass").room("cafe", "Caf\xE9t\xE9ria", 30, 13, 7, 6, "tile").room("storage", "Stockage", 24, 17, 5, 4, "grate").room("balcony", "Balcon", 30, 21, 7, 3, "metal").cor(7, 14.4, 3, 1.2).cor(11.4, 11, 1.2, 2).cor(14, 14.4, 7, 1.2).cor(14, 8.4, 2, 1.2).cor(20, 9.4, 2.6, 1.2).cor(21.8, 5, 1.2, 7).cor(14, 2.4, 2, 1.2).cor(24, 13.4, 6, 1.2).cor(23, 6.4, 3, 1.2).cor(31, 6.4, 2, 1.2).cor(28.4, 4, 1.2, 1).cor(34.4, 4, 1.2, 1).cor(22, 16, 1.2, 2.6).cor(23.2, 17.4, 0.8, 1.2).cor(29, 17.4, 1, 1.2).cor(32.4, 19, 1.2, 2).prop("reactor", 10.2, 2.2, 1.6, 1.4).prop("table", 18, 2.2, 2, 0.8).prop("table", 31.4, 14.4, 1.2, 0.8).prop("table", 34.8, 14.4, 1.2, 0.8).prop("table", 31.4, 17.2, 1.2, 0.8).prop("table", 34.8, 17.2, 1.2, 0.8).prop("table", 33.2, 15.75, 0.6, 0.5).prop("plant", 29, 1, 1, 1).prop("plant", 31.6, 1, 1, 1).prop("plant", 34.2, 2.2, 0.8, 0.8).prop("table", 27.4, 6, 1.5, 0.7).prop("table", 34.6, 6.4, 1.8, 1.1).prop("tank", 2, 14, 1.5, 2.6).prop("locker", 10.2, 13.05, 3.6, 0.5).prop("crate", 25, 18, 1, 1).prop("crate", 27.6, 19.6, 1, 1).prop("bed", 10.2, 7.15, 1.4, 0.7).prop("console", 17, 7.05, 2, 0.5).vent("m_launch", "launch", 5.4, 17.4, ["m_reac", "m_lock"]).vent("m_reac", "reactor", 12.8, 4.4, ["m_launch", "m_lab"]).vent("m_lab", "lab", 22.4, 4.4, ["m_reac", "m_hub", "m_green"]).vent("m_lock", "lockers", 13.4, 15.9, ["m_launch", "m_med"]).vent("m_med", "medbay", 13.4, 10.4, ["m_lock", "m_hub"]).vent("m_hub", "hub", 22.6, 15.4, ["m_med", "m_lab", "m_cafe"]).vent("m_office", "office", 30.4, 8.4, ["m_admin", "m_green"]).vent("m_admin", "admin", 37.4, 8.4, ["m_office", "m_cafe"]).vent("m_green", "greenhouse", 30.6, 3.4, ["m_office", "m_lab"]).vent("m_cafe", "cafe", 30.6, 18.4, ["m_hub", "m_admin", "m_balc"]).vent("m_balc", "balcony", 36.4, 21.6, ["m_cafe"]).st("wires", "hub", 23.6, 12.5).st("wires", "lockers", 13.5, 16.5).st("wires", "lab", 22.6, 1.5).st("wires", "greenhouse", 35.5, 0.6).st("wires", "storage", 28.5, 17.6).st("wires", "balcony", 30.5, 23.5).st("card", "admin", 37.5, 5.6).st("numbers", "reactor", 13.5, 1.5).st("download", "comms", 19.5, 10.5).st("download", "lab", 16.5, 4.5).st("download", "cafe", 36.5, 13.5).st("upload", "office", 30.5, 5.5).st("fuel_get", "storage", 24.5, 20.5).st("fuel_put", "launch", 6.5, 13.5).st("fuel_put", "launch", 1.5, 17.5).st("scan", "medbay", 12.5, 9.8).st("simon", "reactor", 8.5, 4.5).st("garbage", "cafe", 36.5, 18.5).st("garbage_out", "balcony", 36.5, 23.5).st("asteroids", "balcony", 33.5, 23.5).st("engine", "launch", 3.8, 17.5).st("course", "admin", 33.5, 5.5).st("thermo", "lab", 18.5, 4.5).st("leaves", "greenhouse", 28, 3.5).st("calibrate", "office", 26.5, 8.5).st("shields", "comms", 16.5, 10.5).st("fix_lights", "office", 30.5, 7).st("fix_comms", "comms", 19.5, 7.6).st("fix_reactor", "reactor", 8.5, 1.5).st("fix_reactor", "reactor", 13.5, 4.5).st("fix_o2", "greenhouse", 27.5, 0.6).st("fix_o2", "admin", 37.5, 7).st("admin", "admin", 35.5, 6.95).st("vitals", "medbay", 10.5, 10.5).build({ button: [33.5, 16], spawn: [33.5, 16, 1.8] });

// shared/maps/boreal.ts
var boreal = new MapBuilder({
  id: "boreal",
  name: "Avant-poste Bor\xE9al",
  theme: "Plan\xE8te glac\xE9e",
  width: 42,
  height: 24.2,
  background: "#1b2433",
  sabotages: ["lights", "comms", "reactor"],
  criticalName: "Stabilisateurs sismiques"
}).out(0.5, 7, 35.5, 2.6).out(8.6, 9.6, 2.4, 11.8).out(17.6, 9.6, 1.8, 11.8).out(27.6, 9.6, 3, 11.8).out(8.6, 21.4, 31.4, 2.4).room("drop", "Module d'atterrissage", 1, 2, 6, 4.4, "metal").room("comms", "Communications", 12, 2, 5, 4, "dark").room("weapons", "Armurerie", 19, 2, 5, 4, "metal").room("seismic", "Sismologie", 28, 2, 6, 4, "grate").room("o2", "Serre O\u2082", 11.6, 10.2, 5, 3.6, "grass").room("elec", "\xC9lectricit\xE9", 3, 11, 5, 5, "grate").room("security", "S\xE9curit\xE9", 1, 17, 5, 4, "carpet").room("storage", "Stockage", 12, 15, 5, 5, "grate").room("office", "Bureau", 20, 10.4, 7, 5, "carpet").room("admin", "Administration", 20, 16.4, 7, 4.4, "carpet").room("lab", "Laboratoire", 31.4, 14.6, 8, 6, "lab").room("specimen", "Sp\xE9cimens", 37, 9.8, 4, 3.6, "lab").cor(3.4, 6.4, 1.2, 0.6).cor(14, 6, 1.2, 1).cor(21, 6, 1.2, 1).cor(30, 6, 1.2, 1).cor(11, 11.4, 0.6, 1.2).cor(8, 13, 0.6, 1.2).cor(6, 18.4, 2.6, 1.2).cor(11, 16.4, 1, 1.2).cor(17, 16.4, 0.6, 1.2).cor(19.4, 12, 0.6, 1.2).cor(27, 12, 0.6, 1.2).cor(22.8, 15.4, 1.2, 1).cor(22.8, 20.8, 1.2, 0.6).cor(30.6, 16.4, 0.8, 1.2).cor(35, 20.6, 1.2, 0.8).cor(38.4, 13.4, 1.2, 1.2).prop("rock", 6, 8.1, 0.8, 0.6).prop("rock", 24, 7.4, 1, 0.7).prop("rock", 33, 8.3, 0.8, 0.8).prop("rock", 9.3, 15, 0.8, 0.8).prop("rock", 28.4, 18, 0.7, 0.7).prop("rock", 14, 22.3, 1, 0.7).prop("rock", 25, 22, 0.8, 0.8).prop("rock", 36.4, 22.1, 0.8, 0.8).prop("console", 2.6, 2.1, 2.8, 0.6).prop("console", 13, 2.1, 3, 0.5).prop("console", 20, 2.1, 2, 0.5).prop("reactor", 30.2, 3.2, 1.6, 1.2).prop("plant", 12.2, 10.6, 0.8, 0.8).prop("plant", 14.6, 10.6, 0.8, 0.8).prop("shelf", 3.2, 11.1, 2.4, 0.4).prop("console", 1.2, 17.1, 1.4, 0.5).prop("crate", 13, 17.4, 1, 1).prop("barrel", 15.6, 18.6, 0.8, 0.8).prop("table", 23, 12.5, 1, 0.8).prop("table", 23, 17.6, 2, 1).prop("table", 34, 16.8, 2.4, 1).prop("tank", 38.4, 17.4, 0.8, 1.2).prop("tank", 38.2, 10, 1.2, 0.8).doorH("comms_d", "comms", 14, 6).doorH("weap_d", "weapons", 21, 6).doorV("o2_d", "o2", 11, 11.4).doorV("elec_d", "elec", 8, 13).doorV("sec_d", "security", 6, 18.4).doorV("stor_w", "storage", 11, 16.4).doorV("stor_e", "storage", 17, 16.4).doorV("off_w", "office", 19.6, 12).doorV("off_e", "office", 27, 12).doorH("adm_s", "admin", 22.8, 20.8).doorV("lab_w", "lab", 30.8, 16.4).doorH("lab_s", "lab", 35, 20.6).vent("b_sec", "security", 2.2, 20.2, ["b_elec"]).vent("b_elec", "elec", 7.2, 15.4, ["b_sec", "b_o2"]).vent("b_o2", "o2", 16, 13.2, ["b_elec"]).vent("b_comms", "comms", 16.4, 2.6, ["b_weap"]).vent("b_weap", "weapons", 23.4, 5.4, ["b_comms", "b_office"]).vent("b_office", "office", 26.4, 14.8, ["b_weap", "b_admin"]).vent("b_admin", "admin", 26.4, 20.2, ["b_office", "b_stor"]).vent("b_stor", "storage", 16.4, 19.4, ["b_admin"]).vent("b_lab", "lab", 38.8, 15.2, ["b_spec", "b_out"]).vent("b_spec", "specimen", 40.4, 10.4, ["b_lab"]).vent("b_out", "seismic", 29, 10.6, ["b_lab", "b_seis"]).vent("b_seis", "seismic", 33.4, 5.4, ["b_out"]).st("wires", "elec", 6.5, 11.5).st("wires", "storage", 12.5, 15.5).st("wires", "office", 26.5, 10.8).st("wires", "lab", 31.8, 15).st("wires", "comms", 12.5, 2.6).st("card", "office", 20.5, 14.9).st("numbers", "specimen", 40.5, 12.9).st("download", "comms", 16.5, 5.5).st("download", "weapons", 23.5, 2.6).st("download", "lab", 38.9, 20.1).st("upload", "office", 24, 10.9).st("fuel_get", "storage", 16.4, 15.5).st("fuel_put", "drop", 1.5, 5.9).st("fuel_put", "drop", 6.5, 5.9).st("scan", "lab", 33, 19.5).st("simon", "seismic", 33.4, 2.6).st("garbage", "o2", 12.1, 13.3).st("garbage_out", "storage", 13, 19.5).st("asteroids", "weapons", 23.5, 4.4).st("engine", "drop", 5.8, 2.6).st("course", "drop", 6.5, 4.2).st("thermo", "lab", 38.9, 16.4).st("leaves", "o2", 16.1, 10.6).st("calibrate", "elec", 7.5, 15.5).st("shields", "weapons", 19.5, 5.5).st("fix_lights", "elec", 3.5, 15.5).st("fix_comms", "comms", 12.5, 5.5).st("fix_reactor", "seismic", 28.5, 2.6).st("fix_reactor", "lab", 31.9, 20.1).st("security", "security", 1.9, 17.8).st("admin", "admin", 24, 18.1).st("vitals", "office", 26.5, 15).cam("b_cam1", "Route nord", 24, 8, 17, 5.8, 13, 4.2).cam("b_cam2", "Chemin ouest", 10, 16, 6.5, 11, 6, 11.5).cam("b_cam3", "Route sud", 22, 22.5, 16, 20, 12, 4.4).cam("b_cam4", "Laboratoire (ext.)", 30, 18, 26.5, 13.5, 8, 8.5).build({ button: [23.5, 12.9], spawn: [4, 4.2, 1.3], meetingSpawn: [23.5, 12.9, 1.8] });

// shared/maps/zephyr.ts
var zephyr = new MapBuilder({
  id: "zephyr",
  name: "Le Z\xE9phyr",
  theme: "Dirigeable",
  width: 46,
  height: 21.8,
  background: "#7fb1d9",
  sabotages: ["lights", "comms", "reactor"],
  criticalName: "Collision imminente"
}).room("cockpit", "Poste de pilotage", 0.5, 10, 4, 4, "dark").room("armory", "Armurerie", 6, 4, 5, 4, "metal").room("kitchen", "Cuisine", 6, 16, 5, 4, "tile").room("engine", "Salle des machines", 13, 9, 8, 6, "grate").room("brig", "Cellule", 13, 1, 6, 5, "dark").room("comms", "Communications", 20, 1, 4, 4, "dark").room("meeting", "Salle de r\xE9union", 25, 1, 5, 4, "wood").room("vault", "Salle des coffres", 31, 1, 5, 4, "carpet").room("main", "Grand hall", 23, 8, 7, 6, "wood").room("records", "Archives", 33, 7, 5, 5, "wood").room("showers", "Douches", 31, 14.6, 5, 4, "tile").room("lounge", "Salon", 38, 14, 5, 5, "carpet").room("cargo", "Soute", 39, 6, 6, 6, "grate").room("medical", "M\xE9dical", 24, 17, 5, 4, "lab").room("elec", "\xC9lectricit\xE9", 16, 17, 6, 4, "grate").room("security", "S\xE9curit\xE9", 12, 18.4, 3, 2.6, "carpet").cor(2, 6.4, 1.2, 3.6).cor(3.2, 6.4, 2.8, 1.2).cor(2, 14, 1.2, 3.4).cor(3.2, 16.2, 2.8, 1.2).cor(11, 4.4, 2, 1.2).cor(11, 7.2, 3.6, 1.2).cor(13.4, 8.4, 1.2, 0.6).cor(13.4, 15, 1.2, 2.6).cor(11, 16.4, 2.4, 1.2).cor(13, 17.6, 1.2, 0.8).cor(18.4, 15, 1.2, 2).cor(21, 11.4, 2, 1.2).cor(19, 2.4, 1, 1.2).cor(24, 2.4, 1, 1.2).cor(30, 2.4, 1, 1.2).cor(26.4, 5, 1.2, 3).cor(30, 9.4, 3, 1.2).cor(38, 8.4, 1, 1.2).cor(28, 14, 1.2, 2.6).cor(29.2, 15.4, 1.8, 1.2).cor(25, 14, 1.2, 3).cor(22, 18.4, 2, 1.2).cor(36, 15.4, 2, 1.2).cor(41, 12, 1.2, 2).prop("console", 0.55, 11.2, 0.5, 1.6).prop("shelf", 6.2, 4.05, 2.2, 0.45).prop("shelf", 6.3, 19.35, 3.6, 0.5).prop("engine", 14.6, 10.4, 1.8, 3).prop("engine", 18, 10.4, 1.8, 3).prop("pipe", 15, 2.6, 2.4, 0.4).prop("table", 27.1, 2.4, 1, 0.8).prop("crate", 33.2, 2, 1.4, 0.9).prop("plant", 24.2, 9, 0.7, 0.7).prop("plant", 28.6, 12.4, 0.7, 0.7).prop("shelf", 34.2, 8, 0.4, 2.6).prop("shelf", 36.2, 8, 0.4, 2.6).prop("locker", 31.2, 14.65, 1.2, 0.5).prop("locker", 33, 14.65, 1.2, 0.5).prop("couch", 39, 14.4, 2, 0.7).prop("crate", 40, 7, 1.5, 1.5).prop("crate", 43, 9.6, 1.2, 1.2).prop("bed", 27.3, 17.15, 1.4, 0.7).prop("shelf", 16.2, 17.05, 4.8, 0.4).prop("pipe", 18.9, 18.6, 0.3, 2.4).prop("console", 12.1, 18.45, 1.6, 0.4).doorV("arm_w", "armory", 5.8, 6.4).doorV("arm_e", "armory", 11, 4.4).doorV("kit_w", "kitchen", 5.8, 16.2).doorV("kit_e", "kitchen", 11, 16.4).doorH("eng_n", "engine", 13.4, 8.6).doorH("eng_s", "engine", 13.4, 15).doorH("eng_s2", "engine", 18.4, 15).doorV("eng_e", "engine", 21, 11.4).doorV("brig_e", "brig", 19, 2.4).doorV("meet_w", "meeting", 24.8, 2.4).doorV("meet_e", "meeting", 30, 2.4).doorV("rec_w", "records", 32.8, 9.4).doorV("rec_e", "records", 38, 8.4).doorH("med_n", "medical", 25, 16.8).doorV("med_w", "medical", 23.8, 18.4).doorV("show_w", "showers", 30.8, 15.4).doorV("show_e", "showers", 36, 15.4).vent("z_cock", "cockpit", 3.8, 13.4, ["z_arm"]).vent("z_arm", "armory", 10.3, 7.4, ["z_cock", "z_brig"]).vent("z_brig", "brig", 18.3, 5.4, ["z_arm"]).vent("z_kit", "kitchen", 10.4, 18.8, ["z_eng"]).vent("z_eng", "engine", 17.2, 14.3, ["z_kit"]).vent("z_main", "main", 23.6, 13.4, ["z_rec"]).vent("z_rec", "records", 37.3, 7.6, ["z_main", "z_cargo"]).vent("z_cargo", "cargo", 39.8, 11.4, ["z_rec"]).vent("z_show", "showers", 35.4, 18, ["z_lounge"]).vent("z_lounge", "lounge", 42.4, 14.6, ["z_show"]).vent("z_med", "medical", 28.4, 20.4, ["z_elec"]).vent("z_elec", "elec", 16.6, 20.4, ["z_med"]).st("wires", "armory", 10.5, 4.6).st("wires", "kitchen", 6.5, 16.5).st("wires", "elec", 21.5, 20.5).st("wires", "records", 37.5, 11.5).st("wires", "cargo", 44.5, 6.5).st("wires", "main", 29.5, 8.5).st("card", "records", 33.5, 11.5).st("numbers", "vault", 35.5, 4.5).st("download", "cockpit", 1, 13.5).st("download", "armory", 6.5, 7.5).st("download", "comms", 23.5, 4.5).st("upload", "lounge", 42.5, 18.5).st("fuel_get", "cargo", 44.5, 11.5).st("fuel_put", "engine", 13.5, 9.5).st("fuel_put", "engine", 20.5, 9.5).st("scan", "medical", 26.5, 20.3).st("simon", "engine", 17.2, 9.5).st("garbage", "kitchen", 10.6, 16.5).st("garbage_out", "cargo", 39.5, 6.5).st("asteroids", "armory", 8.5, 7.6).st("engine", "engine", 13.5, 12).st("course", "cockpit", 4, 10.5).st("shields", "lounge", 38.5, 18.5).st("thermo", "showers", 35.5, 18.2).st("leaves", "kitchen", 6.5, 17.8).st("calibrate", "elec", 16.5, 18.2).st("fix_lights", "elec", 21.5, 17.6).st("fix_comms", "comms", 20.5, 1.5).st("fix_reactor", "cockpit", 1, 10.5).st("fix_reactor", "records", 33.5, 7.5).st("security", "security", 12.9, 19.1).st("admin", "vault", 33.9, 3.3).st("vitals", "medical", 24.5, 17.5).cam("z_cam1", "Salle des machines", 17, 12, 13, 9, 8, 6).cam("z_cam2", "Grand hall", 26, 11, 23, 8, 7, 6).cam("z_cam3", "Soute", 42, 9, 39, 6, 6, 6).cam("z_cam4", "Couloir cuisine", 4, 16.8, 0.5, 14, 10.5, 6).build({
  button: [27.6, 2.8],
  spawn: [26.5, 11, 1.6],
  meetingSpawn: [26.5, 11, 1.6],
  extraSpawns: [[26.5, 11], [41.5, 9], [8.5, 18], [19, 16], [35.5, 3.5]]
});

// shared/maps/lobby.ts
var lobby = new MapBuilder({
  id: "lobby",
  name: "Navette d'embarquement",
  theme: "Lobby",
  width: 16,
  height: 10,
  background: "#05070f",
  sabotages: [],
  criticalName: ""
}).room("ship", "Navette", 1, 1, 14, 8, "metal").prop("crate", 1.4, 7.4, 1.2, 1.2).prop("crate", 13.4, 1.3, 1.2, 1.2).prop("barrel", 12.2, 7.8, 0.8, 0.8).prop("console", 1.2, 1.1, 1.8, 0.5).prop("couch", 6, 1.1, 4, 0.6).st("customize", "ship", 2.1, 1.7).build({ button: [8, 5], spawn: [8, 5.2, 2.2] });

// shared/maps/index.ts
var MAPS = { nautile, mirage, boreal, zephyr };
var LOBBY_MAP = lobby;
var getMap = (id) => id === "lobby" ? lobby : MAPS[id] ?? nautile;

// shared/tasks.ts
var STATION_MINIGAME = {
  wires: "wires",
  card: "swipe",
  asteroids: "asteroids",
  download: "download",
  upload: "upload",
  engine: "engine",
  garbage: "garbage",
  garbage_out: "garbage",
  numbers: "numbers",
  simon: "simon",
  course: "course",
  calibrate: "calibrate",
  fuel_get: "fuel",
  fuel_put: "fuel",
  scan: "scan",
  shields: "shields",
  thermo: "thermo",
  leaves: "leaves",
  sample: "sample"
};
var MINIGAME_MIN_TIME = {
  wires: 1.2,
  swipe: 0.8,
  asteroids: 3.5,
  download: 6.5,
  upload: 6.5,
  engine: 0.8,
  garbage: 2,
  numbers: 2,
  simon: 5,
  course: 1.5,
  calibrate: 1.5,
  fuel: 2.5,
  scan: 8.5,
  shields: 1.2,
  thermo: 1.2,
  leaves: 1.5,
  sample: 1
};
var TASK_DEFS = [
  // Communes
  { id: "fix_wiring", name: "R\xE9parer le c\xE2blage", length: "common", steps: ["wires", "wires", "wires"] },
  { id: "swipe_card", name: "Passer sa carte d'acc\xE8s", length: "common", steps: ["card"] },
  { id: "enter_code", name: "D\xE9verrouiller les collecteurs", length: "common", steps: ["numbers"] },
  // Longues
  { id: "download_data", name: "Transf\xE9rer des donn\xE9es", length: "long", steps: ["download", "upload"] },
  { id: "fuel_engines", name: "Faire le plein des moteurs", length: "long", steps: ["fuel_get", "fuel_put", "fuel_get", "fuel_put"] },
  { id: "body_scan", name: "Passer au scanner", length: "long", steps: ["scan"], visual: true },
  { id: "start_core", name: "D\xE9marrer le c\u0153ur", length: "long", steps: ["simon"] },
  { id: "empty_garbage", name: "Vider les d\xE9chets", length: "long", steps: ["garbage", "garbage_out"] },
  // Courtes
  { id: "clear_asteroids", name: "D\xE9truire les ast\xE9ro\xEFdes", length: "short", steps: ["asteroids"], visual: true },
  { id: "align_engine", name: "Aligner le moteur", length: "short", steps: ["engine"] },
  { id: "chart_course", name: "Tracer la trajectoire", length: "short", steps: ["course"] },
  { id: "prime_shields", name: "Activer les boucliers", length: "short", steps: ["shields"], visual: true },
  { id: "set_thermo", name: "R\xE9gler le thermostat", length: "short", steps: ["thermo"] },
  { id: "clean_filter", name: "Nettoyer le filtre", length: "short", steps: ["leaves"] },
  { id: "calibrate", name: "Calibrer le distributeur", length: "short", steps: ["calibrate"] }
];
var FIX_MIN_TIME = { comms: 1.2, o2: 1.5 };
function availableTasks(map, settings) {
  const kinds = new Set(map.stations.map((s2) => s2.kind));
  return TASK_DEFS.filter((t) => !settings.disabledTasks.includes(t.id) && t.steps.every((k) => kinds.has(k)));
}

// shared/settings.ts
var clamp = (v, min, max, def, step = 0) => {
  let n = typeof v === "number" && Number.isFinite(v) ? v : def;
  n = Math.min(max, Math.max(min, n));
  if (step > 0) n = Math.round(n / step) * step;
  return Math.round(n * 1e3) / 1e3;
};
var bool = (v, def) => typeof v === "boolean" ? v : def;
var oneOf = (v, opts, def) => opts.includes(v) ? v : def;
function sanitizeSettings(input, current = DEFAULT_SETTINGS) {
  const i = typeof input === "object" && input !== null ? input : {};
  const c = current;
  const r = i.roles && typeof i.roles === "object" ? i.roles : {};
  const rc = c.roles;
  const role = (k) => r[k] && typeof r[k] === "object" ? r[k] : {};
  const roles = {
    sheriff: {
      count: clamp(role("sheriff").count, 0, 3, rc.sheriff.count, 1),
      cooldown: clamp(role("sheriff").cooldown, 10, 60, rc.sheriff.cooldown, 2.5),
      misfireKillsTarget: bool(role("sheriff").misfireKillsTarget, rc.sheriff.misfireKillsTarget)
    },
    engineer: {
      count: clamp(role("engineer").count, 0, 3, rc.engineer.count, 1),
      ventCooldown: clamp(role("engineer").ventCooldown, 0, 60, rc.engineer.ventCooldown, 2.5),
      ventDuration: clamp(role("engineer").ventDuration, 3, 30, rc.engineer.ventDuration, 1)
    },
    scientist: {
      count: clamp(role("scientist").count, 0, 3, rc.scientist.count, 1),
      cooldown: clamp(role("scientist").cooldown, 5, 60, rc.scientist.cooldown, 2.5),
      batteryDuration: clamp(role("scientist").batteryDuration, 3, 30, rc.scientist.batteryDuration, 1)
    },
    guardianAngel: {
      count: clamp(role("guardianAngel").count, 0, 3, rc.guardianAngel.count, 1),
      cooldown: clamp(role("guardianAngel").cooldown, 10, 60, rc.guardianAngel.cooldown, 2.5),
      protectDuration: clamp(role("guardianAngel").protectDuration, 5, 30, rc.guardianAngel.protectDuration, 1)
    },
    tracker: {
      count: clamp(role("tracker").count, 0, 3, rc.tracker.count, 1),
      cooldown: clamp(role("tracker").cooldown, 5, 60, rc.tracker.cooldown, 2.5),
      duration: clamp(role("tracker").duration, 3, 30, rc.tracker.duration, 1)
    }
  };
  const mapId = typeof i.mapId === "string" && MAPS[i.mapId] ? i.mapId : c.mapId;
  const disabledTasks = Array.isArray(i.disabledTasks) ? [...new Set(i.disabledTasks.filter((t) => typeof t === "string" && TASK_DEFS.some((d) => d.id === t)))] : c.disabledTasks;
  return {
    mapId,
    maxPlayers: clamp(i.maxPlayers, MIN_PLAYERS, MAX_PLAYERS, c.maxPlayers, 1),
    impostors: oneOf(i.impostors, ["auto", 1, 2, 3], c.impostors),
    playerSpeed: clamp(i.playerSpeed, 0.5, 3, c.playerSpeed, 0.25),
    crewVision: clamp(i.crewVision, 0.25, 5, c.crewVision, 0.25),
    impostorVision: clamp(i.impostorVision, 0.25, 5, c.impostorVision, 0.25),
    killCooldown: clamp(i.killCooldown, 10, 60, c.killCooldown, 2.5),
    killDistance: oneOf(i.killDistance, ["short", "normal", "long"], c.killDistance),
    commonTasks: clamp(i.commonTasks, 0, 2, c.commonTasks, 1),
    longTasks: clamp(i.longTasks, 0, 3, c.longTasks, 1),
    shortTasks: clamp(i.shortTasks, 0, 5, c.shortTasks, 1),
    taskBarUpdates: oneOf(i.taskBarUpdates, ["always", "meetings", "never"], c.taskBarUpdates),
    visualTasks: bool(i.visualTasks, c.visualTasks),
    disabledTasks,
    emergencyMeetings: clamp(i.emergencyMeetings, 0, 9, c.emergencyMeetings, 1),
    emergencyCooldown: clamp(i.emergencyCooldown, 0, 60, c.emergencyCooldown, 5),
    discussionTime: clamp(i.discussionTime, 0, 120, c.discussionTime, 5),
    votingTime: clamp(i.votingTime, 15, 300, c.votingTime, 15),
    anonymousVotes: bool(i.anonymousVotes, c.anonymousVotes),
    confirmEjects: bool(i.confirmEjects, c.confirmEjects),
    sabotageCooldown: clamp(i.sabotageCooldown, 10, 60, c.sabotageCooldown, 5),
    criticalTime: clamp(i.criticalTime, 15, 90, c.criticalTime, 5),
    doorCloseTime: clamp(i.doorCloseTime, 5, 15, c.doorCloseTime, 1),
    lightsVision: clamp(i.lightsVision, 0.1, 0.6, c.lightsVision, 0.05),
    ghostSpeed: clamp(i.ghostSpeed, 0.5, 3, c.ghostSpeed, 0.25),
    ghostsDoTasks: bool(i.ghostsDoTasks, c.ghostsDoTasks),
    ghostsSeeRoles: bool(i.ghostsSeeRoles, c.ghostsSeeRoles),
    proximityVoice: bool(i.proximityVoice, c.proximityVoice),
    voiceDistance: clamp(i.voiceDistance, 200, 1400, c.voiceDistance, 20),
    voiceWallOcclusion: bool(i.voiceWallOcclusion, c.voiceWallOcclusion),
    forcePushToTalk: bool(i.forcePushToTalk, c.forcePushToTalk),
    roles
  };
}
function maxImpostorsFor(players) {
  if (players <= 6) return 1;
  if (players <= 8) return 2;
  return 3;
}
function resolveImpostorCount(setting, players) {
  const max = maxImpostorsFor(players);
  if (setting === "auto") return players >= 11 ? Math.min(3, max) : players >= 7 ? Math.min(2, max) : 1;
  return Math.max(1, Math.min(setting, max));
}

// server/src/game/taskAssign.ts
var shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
var uid = 0;
function instantiate(def, map) {
  const used = /* @__PURE__ */ new Set();
  const steps = def.steps.map((kind) => {
    const all = map.stations.filter((s2) => s2.kind === kind);
    const fresh = all.filter((s2) => !used.has(s2.id));
    const st = shuffle(fresh.length ? fresh : all)[0];
    used.add(st.id);
    return { stationId: st.id, minigame: STATION_MINIGAME[kind], room: st.room };
  });
  return { id: `t${++uid}`, defId: def.id, name: def.name, length: def.length, steps, step: 0, done: false };
}
function createTaskPlan(map, settings) {
  const avail = availableTasks(map, settings);
  const commons = shuffle(avail.filter((t) => t.length === "common")).slice(0, settings.commonTasks);
  const commonInstances = commons.map((d) => instantiate(d, map));
  return {
    forPlayer() {
      const longs = shuffle(avail.filter((t) => t.length === "long")).slice(0, settings.longTasks);
      const shorts = shuffle(avail.filter((t) => t.length === "short")).slice(0, settings.shortTasks);
      const commonCopies = commonInstances.map((c) => ({ ...c, id: `t${++uid}`, steps: c.steps.map((s2) => ({ ...s2 })) }));
      return [...commonCopies, ...longs.map((d) => instantiate(d, map)), ...shorts.map((d) => instantiate(d, map))];
    }
  };
}

// server/src/game/Room.ts
var NAME_RE = /[^\p{L}\p{N} _\-.'!?]/gu;
var cleanName = (n) => typeof n === "string" ? n.replace(NAME_RE, "").trim().slice(0, 12) : "";
var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var newId = () => randomBytes(6).toString("hex");
var Room = class {
  constructor(code, io2, debugEnabled) {
    this.code = code;
    this.io = io2;
    this.debugEnabled = debugEnabled;
    this.timer = setInterval(() => this.safeTick(), 1e3 / TICK_RATE);
    log("ROOM_CREATED", { room: code });
  }
  code;
  io;
  debugEnabled;
  players = /* @__PURE__ */ new Map();
  hostId = "";
  phase = "LOBBY";
  phaseEndsAt = 0;
  settings = sanitizeSettings({}, DEFAULT_SETTINGS);
  map = LOBBY_MAP;
  grid = new MapGrid(LOBBY_MAP);
  bodies = [];
  doorsClosed = /* @__PURE__ */ new Map();
  // id -> réouverture
  doorCooldowns = {};
  sabotage = null;
  sabotageCooldownEnd = 0;
  emergencyCooldownEnd = 0;
  meeting = null;
  gameOver = null;
  taskProgressAtMeeting = 0;
  chat = [];
  createdAt = Date.now();
  lastActivity = Date.now();
  tickCount = 0;
  timer;
  roomStateDirty = true;
  meetingDirty = false;
  chatSeq = 0;
  /** accélère tous les minuteurs (tests) */
  timeScale = 1;
  destroy(reason) {
    clearInterval(this.timer);
    for (const p of this.players.values()) if (p.socketId) this.io.to(p.socketId).emit("room:closed", reason);
    log("ROOM_CLOSED", { room: this.code, reason });
  }
  // ------------------------------------------------------------------ utilitaires
  now() {
    return Date.now();
  }
  secs(s2) {
    return s2 * 1e3 / this.timeScale;
  }
  emitTo(p, ev, ...args) {
    if (p.socketId && p.connected) this.io.to(p.socketId).emit(ev, ...args);
  }
  event(p, e) {
    this.emitTo(p, "game:event", e);
  }
  eventAll(e) {
    for (const p of this.players.values()) this.event(p, e);
  }
  get connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }
  get gamePlayers() {
    return [...this.players.values()].filter((p) => p.inGame);
  }
  get inGamePhase() {
    return this.phase !== "LOBBY";
  }
  markRoom() {
    this.roomStateDirty = true;
  }
  freeColor() {
    const used = new Set([...this.players.values()].map((p) => p.cosmetics.color));
    for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
    return randomInt(COLORS.length);
  }
  visionOf(p) {
    if (!p.alive) return Infinity;
    if (this.phase === "LOBBY" || this.phase === "GAME_OVER") return Infinity;
    if (p.team === "impostor") return BASE_VISION * this.settings.impostorVision;
    const base = BASE_VISION * this.settings.crewVision;
    return this.sabotage?.type === "lights" ? Math.max(90, base * this.settings.lightsVision) : base;
  }
  speedOf(p) {
    return BASE_SPEED * (p.alive ? this.settings.playerSpeed : this.settings.ghostSpeed);
  }
  canSee(viewer, x, y) {
    if (!viewer.alive || this.phase === "LOBBY") return true;
    const r = this.visionOf(viewer);
    if (Math.hypot(viewer.x - x, viewer.y - y) > r + PLAYER_RADIUS) return false;
    return this.grid.los(viewer.x, viewer.y, x, y);
  }
  station(id) {
    return this.map.stations.find((s2) => s2.id === id);
  }
  near(p, pt, d) {
    return dist(p, pt) <= d;
  }
  // ------------------------------------------------------------------ connexion
  addPlayer(name, cosmetics, socketId) {
    const n = cleanName(name);
    if (!n) return { ok: false, error: "Pseudo invalide." };
    if (this.phase !== "LOBBY") return { ok: false, error: "La partie est d\xE9j\xE0 commenc\xE9e." };
    if (this.players.size >= this.settings.maxPlayers) return { ok: false, error: "Le salon est complet." };
    if ([...this.players.values()].some((p2) => p2.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: "Ce pseudo est d\xE9j\xE0 utilis\xE9 dans ce salon." };
    const id = newId();
    const pos = this.spawnPoint(this.players.size, LOBBY_MAP);
    const p = {
      id,
      token: randomBytes(24).toString("hex"),
      name: n,
      cosmetics: { color: 0, hat: "none", skin: "none", pet: "none", visor: "glass", trail: "none" },
      socketId,
      connected: true,
      disconnectedAt: 0,
      joinedAt: this.now(),
      x: pos.x,
      y: pos.y,
      moveBudget: 0,
      lastMoveAt: this.now(),
      lastSeq: 0,
      moving: 0,
      flip: 0,
      corrected: true,
      role: "crewmate",
      team: "crew",
      alive: true,
      knownDead: false,
      inGame: false,
      tasks: [],
      activeTask: null,
      killCooldownEnd: 0,
      abilityCooldownEnd: 0,
      abilityActiveEnd: 0,
      protectedUntil: 0,
      meetingsLeft: 0,
      inVent: null,
      ventEnd: 0,
      console: null,
      consoleAt: null,
      commsOpenAt: 0,
      holding: null,
      vote: null,
      dirty: true,
      voiceSpeaking: false
    };
    p.cosmetics.color = this.freeColor();
    this.players.set(id, p);
    this.setCosmetics(p, cosmetics ?? {}, true);
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = id;
    this.markRoom();
    this.lastActivity = this.now();
    log("PLAYER_JOINED", { room: this.code, player: n, id, count: this.players.size });
    for (const o of this.players.values()) if (o !== p) this.event(o, { type: "playerJoined", byId: id, text: n });
    return { ok: true, code: this.code, token: p.token, playerId: id };
  }
  resume(token, socketId) {
    const p = [...this.players.values()].find((q) => q.token === token);
    if (!p) return { ok: false, error: "Session expir\xE9e : impossible de reprendre la partie." };
    p.socketId = socketId;
    p.connected = true;
    p.corrected = true;
    p.dirty = true;
    p.lastMoveAt = this.now();
    if (!this.players.get(this.hostId)?.connected) this.setHost(p.id);
    this.markRoom();
    this.meetingDirty = true;
    log("PLAYER_RECONNECTED", { room: this.code, player: p.name });
    return { ok: true, code: this.code, token: p.token, playerId: p.id };
  }
  /** Envoie tout l'état nécessaire à un joueur qui (re)arrive. */
  sendFullState(p) {
    this.emitTo(p, "room:state", this.roomStateFor(p));
    if (this.inGamePhase && p.inGame) this.emitTo(p, "game:private", this.privateFor(p));
    this.emitTo(p, "meeting:state", this.meeting ? this.meetingFor(p) : null);
    this.emitTo(p, "game:over", this.gameOver);
    this.emitTo(p, "chat:history", this.chat.filter((c) => !c.to || c.to.has(p.id)).map((c) => c.msg).slice(-60));
  }
  disconnect(p) {
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = this.now();
    this.releaseHold(p);
    log("PLAYER_DISCONNECTED", { room: this.code, player: p.name });
    if (this.hostId === p.id) {
      const next = this.connectedPlayers.sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) this.setHost(next.id);
    }
    for (const o of this.players.values()) this.event(o, { type: "toast", text: `${p.name} a perdu la connexion\u2026` });
    this.markRoom();
    this.meetingDirty = true;
  }
  leave(p) {
    this.removePlayer(p, "a quitt\xE9 la partie");
  }
  removePlayer(p, why) {
    this.players.delete(p.id);
    log("PLAYER_LEFT", { room: this.code, player: p.name, why });
    if (p.socketId) this.io.to(p.socketId).emit("kicked", why);
    if (this.hostId === p.id) {
      const next = this.connectedPlayers.sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? [...this.players.values()][0];
      if (next) this.setHost(next.id);
    }
    this.eventAll({ type: "playerLeft", byId: p.id, text: `${p.name} ${why}.`, color: p.cosmetics.color });
    this.bodies = this.bodies.filter((b) => b.victimId !== p.id);
    if (this.inGamePhase && this.phase !== "GAME_OVER" && p.inGame) {
      this.checkWin("disconnect");
      if (this.phase === "VOTING") this.maybeEndVoting();
    }
    this.markRoom();
    this.meetingDirty = true;
  }
  setHost(id) {
    if (this.hostId === id) return;
    this.hostId = id;
    const p = this.players.get(id);
    log("HOST_CHANGED", { room: this.code, host: p?.name });
    this.eventAll({ type: "hostChanged", byId: id, text: `${p?.name} est maintenant l'h\xF4te.` });
    this.markRoom();
  }
  kick(host, targetId) {
    if (host.id !== this.hostId || this.phase !== "LOBBY") return;
    const t = this.players.get(targetId);
    if (t && t !== host) this.removePlayer(t, "a \xE9t\xE9 expuls\xE9 par l'h\xF4te");
  }
  get isEmpty() {
    return this.players.size === 0;
  }
  // ------------------------------------------------------------------ lobby
  setCosmetics(p, c, initial = false) {
    if (this.phase !== "LOBBY" && !initial) return;
    const next = { ...p.cosmetics };
    if (typeof c.color === "number" && Number.isInteger(c.color) && c.color >= 0 && c.color < COLORS.length) {
      const taken = [...this.players.values()].some((o) => o !== p && o.cosmetics.color === c.color);
      if (!taken) next.color = c.color;
    }
    if (typeof c.hat === "string" && HATS.includes(c.hat)) next.hat = c.hat;
    if (typeof c.skin === "string" && SKINS.includes(c.skin)) next.skin = c.skin;
    if (typeof c.pet === "string" && PETS.includes(c.pet)) next.pet = c.pet;
    if (typeof c.visor === "string" && VISORS.includes(c.visor)) next.visor = c.visor;
    if (typeof c.trail === "string" && TRAILS.includes(c.trail)) next.trail = c.trail;
    p.cosmetics = next;
    this.markRoom();
  }
  rename(p, name) {
    if (this.phase !== "LOBBY") return { ok: false, error: "Impossible pendant la partie." };
    const n = cleanName(name);
    if (!n) return { ok: false, error: "Pseudo invalide." };
    if ([...this.players.values()].some((o) => o !== p && o.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: "Ce pseudo est d\xE9j\xE0 utilis\xE9." };
    p.name = n;
    this.markRoom();
    return { ok: true };
  }
  updateSettings(p, s2) {
    if (p.id !== this.hostId || this.phase !== "LOBBY") return;
    const next = sanitizeSettings(s2, this.settings);
    next.maxPlayers = Math.max(next.maxPlayers, this.players.size, MIN_PLAYERS);
    this.settings = next;
    this.markRoom();
  }
  start(p) {
    if (p.id !== this.hostId) return { ok: false, error: "Seul l'h\xF4te peut lancer la partie." };
    if (this.phase !== "LOBBY") return { ok: false, error: "La partie est d\xE9j\xE0 lanc\xE9e." };
    const players = this.connectedPlayers;
    if (players.length < MIN_PLAYERS) return { ok: false, error: `Minimum ${MIN_PLAYERS} joueurs requis.` };
    for (const q of [...this.players.values()]) if (!q.connected) this.players.delete(q.id);
    this.beginGame();
    return { ok: true };
  }
  beginGame() {
    const now = this.now();
    this.map = getMap(this.settings.mapId);
    this.grid = new MapGrid(this.map);
    this.bodies = [];
    this.doorsClosed.clear();
    this.doorCooldowns = {};
    this.sabotage = null;
    this.meeting = null;
    this.gameOver = null;
    this.chat = [];
    const players = shuffle([...this.players.values()]);
    const nImp = resolveImpostorCount(this.settings.impostors, players.length);
    const plan = createTaskPlan(this.map, this.settings);
    const specials = [];
    for (const r of SPECIAL_ROLES) for (let i = 0; i < this.settings.roles[r].count; i++) specials.push(r);
    const shuffledSpecials = shuffle(specials);
    players.forEach((p, i) => {
      const imp = i < nImp;
      p.team = imp ? "impostor" : "crew";
      p.role = imp ? "impostor" : shuffledSpecials.shift() ?? "crewmate";
      p.alive = true;
      p.knownDead = false;
      p.inGame = true;
      p.tasks = plan.forPlayer();
      p.activeTask = null;
      p.killCooldownEnd = now + this.secs(10 + STARTING_TIME);
      p.abilityCooldownEnd = now + this.secs(10 + STARTING_TIME);
      p.abilityActiveEnd = 0;
      p.abilityTarget = void 0;
      p.protectedUntil = 0;
      p.meetingsLeft = this.settings.emergencyMeetings;
      p.inVent = null;
      p.console = null;
      p.holding = null;
      p.vote = null;
      p.dirty = true;
      log("ROLE_ASSIGNED", { room: this.code, player: p.name, role: p.role });
    });
    this.placePlayers(this.map.spawn, true);
    this.sabotageCooldownEnd = now + this.secs(10 + STARTING_TIME);
    this.emergencyCooldownEnd = now + this.secs(this.settings.emergencyCooldown + STARTING_TIME);
    this.phase = "STARTING";
    this.phaseEndsAt = now + this.secs(STARTING_TIME);
    this.markRoom();
    log("GAME_STARTED", { room: this.code, map: this.map.id, players: players.length, impostors: nImp });
    this.eventAll({ type: "started" });
  }
  spawnPoint(i, map, center = map.spawn, total = 10) {
    const grid = map === this.map ? this.grid : new MapGrid(map);
    const a = i / Math.max(total, 1) * Math.PI * 2;
    const r = center.radius;
    return grid.nearestStandable(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r * 0.75, PLAYER_RADIUS);
  }
  placePlayers(center, useExtra = false) {
    const list = [...this.players.values()];
    list.forEach((p, i) => {
      let pos;
      if (useExtra && this.map.extraSpawns?.length) {
        const sp = this.map.extraSpawns[randomInt(this.map.extraSpawns.length)];
        pos = this.grid.nearestStandable(sp.x + (Math.random() - 0.5) * 60, sp.y + (Math.random() - 0.5) * 40, PLAYER_RADIUS);
      } else pos = this.spawnPoint(i, this.map, center, list.length);
      p.x = pos.x;
      p.y = pos.y;
      p.corrected = true;
      p.moveBudget = 0;
      p.lastMoveAt = this.now();
    });
  }
  backToLobby() {
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    this.phase = "LOBBY";
    this.map = LOBBY_MAP;
    this.grid = new MapGrid(LOBBY_MAP);
    this.bodies = [];
    this.sabotage = null;
    this.meeting = null;
    this.gameOver = null;
    this.doorsClosed.clear();
    for (const p of this.players.values()) {
      p.inGame = false;
      p.alive = true;
      p.knownDead = false;
      p.role = "crewmate";
      p.team = "crew";
      p.tasks = [];
      p.inVent = null;
      p.console = null;
      p.activeTask = null;
      p.dirty = true;
    }
    this.placePlayers(LOBBY_MAP.spawn);
    if (!this.players.get(this.hostId)?.connected && this.connectedPlayers[0]) this.setHost(this.connectedPlayers[0].id);
    for (const p of this.players.values()) this.emitTo(p, "game:over", null);
    this.markRoom();
    this.meetingDirty = true;
  }
  returnToLobby(p) {
    if (p.id === this.hostId && this.phase === "GAME_OVER") this.backToLobby();
  }
  // ------------------------------------------------------------------ déplacement
  move(p, m) {
    if (!(this.phase === "LOBBY" || this.phase === "PLAYING")) return;
    if (typeof m?.x !== "number" || typeof m.y !== "number" || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    if (typeof m.seq !== "number" || m.seq <= p.lastSeq) return;
    p.lastSeq = m.seq;
    p.moving = m.m ? 1 : 0;
    p.flip = m.f ? 1 : 0;
    if (p.inVent) return;
    const now = this.now();
    const speed = this.speedOf(p);
    p.moveBudget = Math.min(speed * 0.6, p.moveBudget + speed * (now - p.lastMoveAt) / 1e3);
    p.lastMoveAt = now;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < 0.01) return;
    if (d > p.moveBudget + 6) {
      p.corrected = true;
      log("REJECTED", { room: this.code, player: p.name, what: "speed", d: Math.round(d), budget: Math.round(p.moveBudget) });
      return;
    }
    let nx = m.x;
    let ny = m.y;
    if (p.alive) {
      if (!(this.grid.canStand(nx, ny, PLAYER_RADIUS) && this.grid.pathClear(p.x, p.y, nx, ny))) {
        const r = this.grid.move(p.x, p.y, nx - p.x, ny - p.y, PLAYER_RADIUS);
        if (Math.hypot(r.x - nx, r.y - ny) > 4) {
          p.corrected = true;
          log("REJECTED", { room: this.code, player: p.name, what: "wall", d: Math.round(d) });
        }
        nx = r.x;
        ny = r.y;
      }
    } else if (!this.grid.inBounds(nx, ny)) {
      p.corrected = true;
      return;
    }
    p.moveBudget -= Math.hypot(nx - p.x, ny - p.y);
    p.x = nx;
    p.y = ny;
    if (p.activeTask && Math.hypot(p.x - p.activeTask.x, p.y - p.activeTask.y) > 30) p.activeTask = null;
    if (p.console && p.consoleAt && dist(p, p.consoleAt) > USE_DISTANCE * 1.5) p.console = null;
    if (p.holding) {
      const st = this.station(p.holding);
      if (!st || dist(p, st) > USE_DISTANCE * 1.3) this.releaseHold(p);
    }
  }
  // ------------------------------------------------------------------ kills & rôles
  canAct(p) {
    if (this.phase !== "PLAYING") return "Action impossible maintenant.";
    if (!p.alive) return "Tu es mort.";
    if (p.inVent) return "Tu es dans un conduit.";
    return null;
  }
  kill(p, targetId) {
    const err = this.canAct(p);
    if (err) return { ok: false, error: err };
    if (p.team !== "impostor") return { ok: false, error: "Tu n'es pas imposteur." };
    const t = this.players.get(targetId);
    if (!t || !t.alive || !t.inGame) return { ok: false, error: "Cible invalide." };
    if (t.team === "impostor") return { ok: false, error: "Tu ne peux pas \xE9liminer un autre imposteur." };
    if (t.inVent) return { ok: false, error: "Cible invalide." };
    if (this.now() < p.killCooldownEnd) return { ok: false, error: "Rechargement en cours." };
    if (dist(p, t) > KILL_DISTANCES[this.settings.killDistance] + 12 || !this.grid.los(p.x, p.y, t.x, t.y)) return { ok: false, error: "Trop loin." };
    p.killCooldownEnd = this.now() + this.secs(this.settings.killCooldown);
    p.dirty = true;
    if (t.protectedUntil > this.now()) {
      t.protectedUntil = 0;
      p.killCooldownEnd = this.now() + this.secs(this.settings.killCooldown / 2);
      this.event(p, { type: "protected", targetId: t.id, text: "Cette cible \xE9tait prot\xE9g\xE9e !" });
      for (const ga of this.players.values()) if (ga.role === "guardianAngel" && ga.abilityTarget === t.id) this.event(ga, { type: "protected", targetId: t.id, text: "Ta protection a sauv\xE9 une vie !" });
      return { ok: true };
    }
    this.killPlayer(t, p);
    return { ok: true };
  }
  killPlayer(victim, killer, leaveBody = true) {
    victim.alive = false;
    victim.activeTask = null;
    victim.console = null;
    victim.inVent = null;
    this.releaseHold(victim);
    victim.dirty = true;
    if (leaveBody) this.bodies.push({ id: newId(), x: victim.x, y: victim.y, color: victim.cosmetics.color, victimId: victim.id });
    if (killer && killer !== victim) {
      killer.x = victim.x;
      killer.y = victim.y;
      killer.corrected = true;
      this.event(killer, { type: "kill", targetId: victim.id, color: victim.cosmetics.color, x: victim.x, y: victim.y });
      this.event(victim, { type: "killed", byId: killer.id, color: killer.cosmetics.color });
    }
    log("KILL", { room: this.code, killer: killer?.name, victim: victim.name });
    this.meetingDirty = true;
    this.checkWin("kill");
  }
  ability(p, targetId) {
    if (this.phase !== "PLAYING") return { ok: false, error: "Action impossible maintenant." };
    const now = this.now();
    if (now < p.abilityCooldownEnd) return { ok: false, error: "Rechargement en cours." };
    const r = this.settings.roles;
    const target = targetId ? this.players.get(targetId) : void 0;
    switch (p.role) {
      case "sheriff": {
        if (!p.alive || p.inVent) return { ok: false, error: "Impossible." };
        if (!target || !target.alive || target === p || target.inVent) return { ok: false, error: "Cible invalide." };
        if (dist(p, target) > KILL_DISTANCES.normal + 12 || !this.grid.los(p.x, p.y, target.x, target.y)) return { ok: false, error: "Trop loin." };
        p.abilityCooldownEnd = now + this.secs(r.sheriff.cooldown);
        p.dirty = true;
        if (target.team === "impostor") {
          this.killPlayer(target, p);
        } else {
          this.event(p, { type: "misfire", text: "Ce n'\xE9tait pas un imposteur\u2026" });
          if (r.sheriff.misfireKillsTarget) this.killPlayer(target, p);
          if (this.phase === "PLAYING") this.killPlayer(p, null);
        }
        return { ok: true };
      }
      case "scientist": {
        if (!p.alive) return { ok: false, error: "Impossible." };
        p.abilityActiveEnd = now + this.secs(r.scientist.batteryDuration);
        p.abilityCooldownEnd = p.abilityActiveEnd + this.secs(r.scientist.cooldown);
        p.dirty = true;
        return { ok: true };
      }
      case "tracker": {
        if (!p.alive) return { ok: false, error: "Impossible." };
        if (!target || !target.alive || target === p) return { ok: false, error: "Cible invalide." };
        if (dist(p, target) > KILL_DISTANCES.long + 12) return { ok: false, error: "Trop loin." };
        p.abilityTarget = target.id;
        p.abilityActiveEnd = now + this.secs(r.tracker.duration);
        p.abilityCooldownEnd = p.abilityActiveEnd + this.secs(r.tracker.cooldown);
        p.dirty = true;
        return { ok: true };
      }
      case "guardianAngel": {
        if (p.alive) return { ok: false, error: "Ton pouvoir s'active apr\xE8s ta mort." };
        if (!target || !target.alive) return { ok: false, error: "Cible invalide." };
        if (dist(p, target) > 350) return { ok: false, error: "Rapproche-toi de ta cible." };
        target.protectedUntil = now + this.secs(r.guardianAngel.protectDuration);
        p.abilityTarget = target.id;
        p.abilityActiveEnd = target.protectedUntil;
        p.abilityCooldownEnd = target.protectedUntil + this.secs(r.guardianAngel.cooldown);
        p.dirty = true;
        return { ok: true };
      }
      default:
        return { ok: false, error: "Aucune capacit\xE9." };
    }
  }
  // ------------------------------------------------------------------ report / réunion
  report(p, bodyId) {
    const err = this.canAct(p);
    if (err) return { ok: false, error: err };
    const b = this.bodies.find((x) => x.id === bodyId);
    if (!b) return { ok: false, error: "Corps introuvable." };
    if (dist(p, b) > REPORT_DISTANCE || !this.grid.los(p.x, p.y, b.x, b.y)) return { ok: false, error: "Trop loin." };
    log("REPORT", { room: this.code, by: p.name, body: this.players.get(b.victimId)?.name });
    this.startMeeting(p, "report", b.color);
    return { ok: true };
  }
  emergency(p) {
    const err = this.canAct(p);
    if (err) return { ok: false, error: err };
    if (this.settings.emergencyMeetings <= 0) return { ok: false, error: "R\xE9unions d'urgence d\xE9sactiv\xE9es." };
    if (p.meetingsLeft <= 0) return { ok: false, error: "Tu n'as plus de r\xE9union d'urgence." };
    if (this.now() < this.emergencyCooldownEnd) return { ok: false, error: "Le bouton recharge." };
    if (this.sabotage && (this.sabotage.type === "reactor" || this.sabotage.type === "o2")) return { ok: false, error: "Impossible pendant une urgence critique !" };
    if (!this.near(p, this.map.emergencyButton, EMERGENCY_DISTANCE + 8)) return { ok: false, error: "Trop loin du bouton." };
    p.meetingsLeft--;
    p.dirty = true;
    this.startMeeting(p, "emergency", null);
    return { ok: true };
  }
  startMeeting(caller, reason, bodyColor) {
    const now = this.now();
    this.meeting = { callerId: caller.id, reason, bodyColor };
    this.phase = this.settings.discussionTime > 0 ? "MEETING" : "VOTING";
    this.phaseEndsAt = now + this.secs(this.settings.discussionTime > 0 ? this.settings.discussionTime : this.settings.votingTime);
    if (this.sabotage && (this.sabotage.type === "reactor" || this.sabotage.type === "o2")) {
      this.sabotage = null;
      this.sabotageCooldownEnd = now + this.secs(this.settings.sabotageCooldown);
    }
    for (const id of [...this.doorsClosed.keys()]) this.setDoor(id, false);
    for (const p of this.players.values()) {
      p.activeTask = null;
      p.console = null;
      p.holding = null;
      p.vote = null;
      if (p.inVent) {
        const v = this.map.vents.find((x) => x.id === p.inVent);
        if (v) {
          p.x = v.x;
          p.y = v.y;
        }
        p.inVent = null;
      }
      if (p.inGame && !p.alive) p.knownDead = true;
      p.dirty = true;
    }
    this.taskProgressAtMeeting = this.taskProgress();
    this.meetingDirty = true;
    this.markRoom();
    log("MEETING_STARTED", { room: this.code, by: caller.name, reason });
    this.eventAll({ type: reason === "report" ? "report" : "emergency", byId: caller.id, color: bodyColor ?? caller.cosmetics.color });
  }
  vote(p, targetId) {
    if (this.phase !== "VOTING") return { ok: false, error: "Le vote n'est pas ouvert." };
    if (this.now() > this.phaseEndsAt) return { ok: false, error: "Le vote est termin\xE9." };
    if (!p.alive || !p.inGame) return { ok: false, error: "Les morts ne votent pas." };
    if (p.vote !== null) return { ok: false, error: "Tu as d\xE9j\xE0 vot\xE9." };
    if (targetId !== "skip") {
      const t = this.players.get(targetId);
      if (!t || !t.alive || !t.inGame) return { ok: false, error: "Vote invalide." };
    }
    p.vote = targetId;
    log("VOTE", { room: this.code, by: p.name, for: targetId === "skip" ? "skip" : this.players.get(targetId)?.name });
    this.meetingDirty = true;
    this.maybeEndVoting();
    return { ok: true };
  }
  maybeEndVoting() {
    const voters = this.gamePlayers.filter((p) => p.alive && p.connected);
    if (voters.every((p) => p.vote !== null)) this.phaseEndsAt = Math.min(this.phaseEndsAt, this.now() + 1200);
  }
  tally() {
    const counts = /* @__PURE__ */ new Map();
    for (const p of this.gamePlayers) {
      if (!p.alive || p.vote === null) continue;
      if (!counts.has(p.vote)) counts.set(p.vote, []);
      counts.get(p.vote).push(p.id);
    }
    let max = 0;
    let top = [];
    for (const [t, v] of counts) {
      if (v.length > max) {
        max = v.length;
        top = [t];
      } else if (v.length === max) top.push(t);
    }
    const tie = top.length > 1;
    const ejectedId = !tie && top[0] && top[0] !== "skip" ? top[0] : null;
    const anon = this.settings.anonymousVotes;
    const votes = [...counts.entries()].map(([targetId, voters]) => ({ targetId, voters: voters.map((v) => anon ? null : v) }));
    const ej = ejectedId ? this.players.get(ejectedId) : void 0;
    let result = { votes, ejectedId, tie, ejectedWasImpostor: null, ejectedRole: null, impostorsLeft: null };
    if (ej) {
      ej.alive = false;
      ej.knownDead = true;
      ej.dirty = true;
      const impLeft = this.gamePlayers.filter((q) => q.alive && q.team === "impostor").length;
      result = { ...result, ejectedWasImpostor: this.settings.confirmEjects ? ej.team === "impostor" : null, ejectedRole: this.settings.confirmEjects ? ej.role : null, impostorsLeft: this.settings.confirmEjects ? impLeft : null };
      log("EJECTION", { room: this.code, player: ej.name, role: ej.role });
    } else log("EJECTION", { room: this.code, player: "none", tie });
    this.meeting.result = result;
    this.phase = "EJECTION";
    this.phaseEndsAt = this.now() + this.secs(EJECTION_TIME);
    this.meetingDirty = true;
    this.markRoom();
  }
  endMeeting() {
    const now = this.now();
    this.meeting = null;
    this.bodies = [];
    this.meetingDirty = true;
    if (this.checkWin("vote")) return;
    this.phase = "PLAYING";
    this.placePlayers(this.map.meetingSpawn ?? this.map.spawn, Boolean(this.map.extraSpawns?.length));
    for (const p of this.players.values()) {
      p.killCooldownEnd = now + this.secs(this.settings.killCooldown);
      if (p.role !== "guardianAngel") p.abilityCooldownEnd = Math.max(p.abilityCooldownEnd, now + this.secs(10));
      p.abilityActiveEnd = 0;
      p.vote = null;
      p.dirty = true;
    }
    this.sabotageCooldownEnd = Math.max(this.sabotageCooldownEnd, now + this.secs(10));
    this.emergencyCooldownEnd = now + this.secs(this.settings.emergencyCooldown);
    this.markRoom();
  }
  // ------------------------------------------------------------------ tâches
  taskProgress() {
    let total = 0;
    let done = 0;
    for (const p of this.gamePlayers) {
      if (p.team !== "crew") continue;
      for (const t of p.tasks) {
        total += t.steps.length;
        done += t.done ? t.steps.length : t.step;
      }
    }
    return total ? done / total : 0;
  }
  taskStart(p, taskId) {
    if (this.phase !== "PLAYING") return { ok: false, error: "Impossible maintenant." };
    if (!p.alive && !this.settings.ghostsDoTasks) return { ok: false, error: "Les fant\xF4mes ne font pas de t\xE2ches." };
    if (p.team === "impostor") return { ok: false, error: "Les imposteurs ne peuvent pas faire de t\xE2ches." };
    if (p.inVent) return { ok: false, error: "Impossible." };
    const t = p.tasks.find((x) => x.id === taskId);
    if (!t || t.done) return { ok: false, error: "T\xE2che invalide." };
    const step = t.steps[t.step];
    const st = this.station(step.stationId);
    if (!st || dist(p, st) > USE_DISTANCE + 15) return { ok: false, error: "Trop loin." };
    p.activeTask = { taskId, startedAt: this.now(), x: p.x, y: p.y };
    return { ok: true, minigame: step.minigame, seed: randomInt(1e9), stepIndex: t.step, totalSteps: t.steps.length, name: t.name };
  }
  taskComplete(p, taskId) {
    if (this.phase !== "PLAYING") return { ok: false, error: "Impossible maintenant." };
    const a = p.activeTask;
    if (!a || a.taskId !== taskId) return { ok: false, error: "Aucune t\xE2che en cours." };
    const t = p.tasks.find((x) => x.id === taskId);
    if (!t || t.done) return { ok: false, error: "T\xE2che invalide." };
    const step = t.steps[t.step];
    const elapsed = (this.now() - a.startedAt) / 1e3;
    if (elapsed * this.timeScale < MINIGAME_MIN_TIME[step.minigame] - 0.3) {
      log("REJECTED", { room: this.code, player: p.name, what: "task-too-fast", elapsed });
      return { ok: false, error: "T\xE2che non termin\xE9e." };
    }
    p.activeTask = null;
    t.step++;
    if (t.step >= t.steps.length) t.done = true;
    p.dirty = true;
    log("TASK_DONE", { room: this.code, player: p.name, task: t.defId, step: t.step });
    this.event(p, { type: "taskDone", text: t.done ? `${t.name} termin\xE9e !` : `${t.name} (${t.step}/${t.steps.length})` });
    this.checkWin("tasks");
    return { ok: true };
  }
  cancelTask(p) {
    p.activeTask = null;
  }
  // ------------------------------------------------------------------ sabotages & portes
  doSabotage(p, type, room) {
    if (this.phase !== "PLAYING") return { ok: false, error: "Impossible maintenant." };
    if (p.team !== "impostor") return { ok: false, error: "R\xE9serv\xE9 aux imposteurs." };
    const now = this.now();
    if (type === "doors") {
      const doors = this.map.doors.filter((d) => d.room === room);
      if (!room || !doors.length) return { ok: false, error: "Pas de portes ici." };
      if ((this.doorCooldowns[room] ?? 0) > now) return { ok: false, error: "Portes en rechargement." };
      if (doors.every((d) => this.doorsClosed.has(d.id))) return { ok: false, error: "D\xE9j\xE0 ferm\xE9es." };
      for (const d of doors) this.setDoor(d.id, true, now + this.secs(this.settings.doorCloseTime));
      this.doorCooldowns[room] = now + this.secs(this.settings.doorCloseTime + 20);
      for (const q of this.players.values()) if (q.team === "impostor") q.dirty = true;
      log("SABOTAGE", { room: this.code, by: p.name, type: "doors", target: room });
      return { ok: true };
    }
    if (!this.map.sabotages.includes(type)) return { ok: false, error: "Sabotage indisponible sur cette carte." };
    if (this.sabotage) return { ok: false, error: "Un sabotage est d\xE9j\xE0 en cours." };
    if (now < this.sabotageCooldownEnd) return { ok: false, error: "Sabotage en rechargement." };
    const s2 = { type, endsAt: 0 };
    if (type === "lights") {
      s2.switches = Array.from({ length: LIGHT_SWITCHES }, () => Math.random() < 0.5);
      s2.switches[randomInt(LIGHT_SWITCHES)] = false;
    } else if (type === "reactor" || type === "o2") {
      s2.endsAt = now + this.secs(this.settings.criticalTime);
      s2.stations = {};
      for (const st of this.map.stations.filter((x) => x.kind === `fix_${type}`)) s2.stations[st.id] = false;
      if (type === "o2") s2.code = String(randomInt(1e4, 99999));
    }
    this.sabotage = s2;
    this.sabotageCooldownEnd = Infinity;
    for (const q of this.players.values()) {
      q.dirty = true;
      if (type === "comms" && q.console !== "vitals") q.console = null;
    }
    log("SABOTAGE", { room: this.code, by: p.name, type });
    this.eventAll({ type: "sabotage", sabotage: type });
    return { ok: true };
  }
  setDoor(id, closed, reopenAt = 0) {
    const was = this.doorsClosed.has(id);
    if (closed === was) {
      if (closed) this.doorsClosed.set(id, reopenAt);
      return;
    }
    if (closed) this.doorsClosed.set(id, reopenAt);
    else this.doorsClosed.delete(id);
    this.grid.setDoor(id, closed);
    if (closed) {
      for (const p of this.players.values()) {
        if (!p.alive || p.inVent) continue;
        if (!this.grid.canStand(p.x, p.y, PLAYER_RADIUS)) {
          const n = this.grid.nearestStandable(p.x, p.y, PLAYER_RADIUS);
          p.x = n.x;
          p.y = n.y;
          p.corrected = true;
        }
      }
    }
    const d = this.map.doors.find((x) => x.id === id);
    if (d) {
      for (const p of this.players.values()) if (this.canSee(p, d.x + d.w / 2, d.y + d.h / 2)) this.event(p, { type: "door", x: d.x + d.w / 2, y: d.y + d.h / 2, text: closed ? "close" : "open" });
    }
  }
  fix(p, stationId, action, index, code) {
    if (this.phase !== "PLAYING") return { ok: false, error: "Impossible maintenant." };
    if (!p.alive) return { ok: false, error: "Les fant\xF4mes ne peuvent pas r\xE9parer." };
    const st = this.station(stationId);
    const s2 = this.sabotage;
    if (!st || !s2 || st.kind !== `fix_${s2.type}`) return { ok: false, error: "Rien \xE0 r\xE9parer ici." };
    if (dist(p, st) > USE_DISTANCE + 15) return { ok: false, error: "Trop loin." };
    switch (s2.type) {
      case "lights":
        if (action === "switch" && typeof index === "number" && index >= 0 && index < LIGHT_SWITCHES && s2.switches) {
          s2.switches[index] = !s2.switches[index];
          if (s2.switches.every(Boolean)) this.resolveSabotage(p);
        }
        return { ok: true };
      case "comms":
        if (action === "open") {
          p.commsOpenAt = this.now();
          return { ok: true };
        }
        if (action === "comms") {
          if (!p.commsOpenAt || (this.now() - p.commsOpenAt) * this.timeScale < FIX_MIN_TIME.comms * 1e3) return { ok: false, error: "R\xE9glage incomplet." };
          this.resolveSabotage(p);
        }
        return { ok: true };
      case "reactor":
        if (action === "hold") {
          this.releaseHold(p);
          p.holding = stationId;
          s2.stations[stationId] = true;
          if (Object.values(s2.stations).every(Boolean)) this.resolveSabotage(p);
        } else if (action === "release") this.releaseHold(p);
        return { ok: true };
      case "o2":
        if (action === "code") {
          if (code !== s2.code) return { ok: false, error: "Code incorrect." };
          s2.stations[stationId] = true;
          if (Object.values(s2.stations).every(Boolean)) this.resolveSabotage(p);
        }
        return { ok: true };
    }
  }
  releaseHold(p) {
    if (p.holding && this.sabotage?.type === "reactor" && this.sabotage.stations) {
      const other = [...this.players.values()].some((q) => q !== p && q.holding === p.holding);
      if (!other) this.sabotage.stations[p.holding] = false;
    }
    p.holding = null;
  }
  resolveSabotage(by) {
    const type = this.sabotage.type;
    this.sabotage = null;
    this.sabotageCooldownEnd = this.now() + this.secs(this.settings.sabotageCooldown);
    for (const q of this.players.values()) {
      q.holding = null;
      q.dirty = true;
    }
    log("SABOTAGE_FIXED", { room: this.code, by: by.name, type });
    this.eventAll({ type: "fixed", sabotage: type });
  }
  // ------------------------------------------------------------------ conduits & consoles
  vent(p, action, ventId) {
    if (this.phase !== "PLAYING" || !p.alive) return { ok: false, error: "Impossible." };
    const canVent = p.team === "impostor" || p.role === "engineer";
    if (!canVent) return { ok: false, error: "Tu ne peux pas utiliser les conduits." };
    const now = this.now();
    if (action === "enter") {
      if (p.inVent) return { ok: false, error: "D\xE9j\xE0 dans un conduit." };
      if (p.role === "engineer" && now < p.abilityCooldownEnd) return { ok: false, error: "Conduits en rechargement." };
      const v = this.map.vents.find((x) => dist(p, x) <= VENT_DISTANCE + 10);
      if (!v) return { ok: false, error: "Aucun conduit \xE0 proximit\xE9." };
      p.inVent = v.id;
      p.x = v.x;
      p.y = v.y;
      p.corrected = true;
      p.activeTask = null;
      p.console = null;
      this.releaseHold(p);
      if (p.role === "engineer") p.ventEnd = now + this.secs(this.settings.roles.engineer.ventDuration);
      this.ventEvent(p, v.x, v.y);
      log("VENT", { room: this.code, player: p.name, vent: v.id, action });
    } else if (action === "move") {
      const cur = this.map.vents.find((x) => x.id === p.inVent);
      if (!cur || !ventId || !cur.links.includes(ventId)) return { ok: false, error: "Conduit invalide." };
      const v = this.map.vents.find((x) => x.id === ventId);
      p.inVent = v.id;
      p.x = v.x;
      p.y = v.y;
      p.corrected = true;
    } else {
      if (!p.inVent) return { ok: false, error: "Pas dans un conduit." };
      this.exitVent(p);
    }
    p.dirty = true;
    return { ok: true };
  }
  exitVent(p) {
    const v = this.map.vents.find((x) => x.id === p.inVent);
    p.inVent = null;
    const n = this.grid.nearestStandable(p.x, p.y, PLAYER_RADIUS);
    p.x = n.x;
    p.y = n.y;
    p.corrected = true;
    if (p.role === "engineer") p.abilityCooldownEnd = this.now() + this.secs(this.settings.roles.engineer.ventCooldown);
    if (v) this.ventEvent(p, v.x, v.y);
    p.dirty = true;
  }
  ventEvent(p, x, y) {
    for (const o of this.players.values()) if (o === p || this.canSee(o, x, y)) this.event(o, { type: "vent", x, y, byId: o === p ? p.id : void 0 });
  }
  useConsole(p, kind) {
    if (kind === "none") {
      p.console = null;
      return { ok: true };
    }
    if (this.phase !== "PLAYING" || p.inVent) return { ok: false, error: "Impossible." };
    if (this.sabotage?.type === "comms" && kind !== "vitals") return { ok: false, error: "Communications sabot\xE9es !" };
    const portable = kind === "vitals" && p.role === "scientist" && p.abilityActiveEnd > this.now();
    const st = this.map.stations.find((s2) => s2.kind === kind && dist(p, s2) <= USE_DISTANCE + 15);
    if (!st && !portable) return { ok: false, error: "Aucune console \xE0 proximit\xE9." };
    p.console = kind;
    p.consoleAt = portable ? null : { x: p.x, y: p.y };
    this.sendConsole(p);
    return { ok: true };
  }
  sendConsole(p) {
    if (!p.console) return;
    if (p.console === "admin") {
      const rooms2 = {};
      for (const q of this.gamePlayers) {
        if (!q.alive || q.inVent) continue;
        const r = this.grid.roomAt(q.x, q.y);
        if (r) rooms2[r] = (rooms2[r] ?? 0) + 1;
      }
      for (const b of this.bodies) {
        const r = this.grid.roomAt(b.x, b.y);
        if (r) rooms2[r] = (rooms2[r] ?? 0) + 1;
      }
      this.emitTo(p, "console:data", { kind: "admin", data: { rooms: rooms2 } });
    } else if (p.console === "vitals") {
      this.emitTo(p, "console:data", {
        kind: "vitals",
        data: { players: this.gamePlayers.map((q) => ({ id: q.id, status: !q.connected ? "disconnected" : q.alive ? "alive" : "dead" })) }
      });
    } else {
      const view = { players: [], bodies: [] };
      const inCam = (x, y) => this.map.cameras.some((c) => x >= c.view.x && x <= c.view.x + c.view.w && y >= c.view.y && y <= c.view.y + c.view.h);
      for (const q of this.gamePlayers) if (q.alive && !q.inVent && inCam(q.x, q.y)) view.players.push({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), m: q.moving, f: q.flip });
      for (const b of this.bodies) if (inCam(b.x, b.y)) view.bodies.push({ x: b.x, y: b.y, color: b.color });
      this.emitTo(p, "console:data", { kind: "security", data: view });
    }
  }
  // ------------------------------------------------------------------ chat
  sendChat(p, text) {
    const t = typeof text === "string" ? text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200) : "";
    if (!t) return { ok: false, error: "Message vide." };
    let channel;
    let to = null;
    const all = [...this.players.values()];
    if (this.phase === "LOBBY" || this.phase === "GAME_OVER" || !p.inGame) {
      channel = "lobby";
    } else if (!p.alive) {
      channel = "ghost";
      to = new Set(all.filter((q) => q.inGame && !q.alive).map((q) => q.id));
    } else if (this.phase === "PLAYING" || this.phase === "STARTING") {
      channel = "proximity";
      const range = this.settings.voiceDistance;
      to = new Set(all.filter((q) => q === p || !q.alive || q.alive && dist(p, q) <= range).map((q) => q.id));
    } else {
      channel = "meeting";
    }
    const msg = { id: `m${++this.chatSeq}`, channel, fromId: p.id, name: p.name, color: p.cosmetics.color, text: t, t: this.now() };
    this.chat.push({ msg, to });
    if (this.chat.length > 200) this.chat.shift();
    for (const q of all) if (!to || to.has(q.id)) this.emitTo(q, "chat:msg", msg);
    return { ok: true };
  }
  // ------------------------------------------------------------------ fin de partie
  checkWin(reason) {
    if (!this.inGamePhase || this.phase === "GAME_OVER" || this.phase === "STARTING") return false;
    const gp = this.gamePlayers;
    const imp = gp.filter((p) => p.alive && p.team === "impostor").length;
    const crew = gp.filter((p) => p.alive && p.team === "crew").length;
    const inMeeting = this.phase === "MEETING" || this.phase === "VOTING" || this.phase === "EJECTION";
    if (imp === 0) return this.endGame("crew", reason === "disconnect" ? "disconnect" : "vote");
    if (imp >= crew) {
      if (inMeeting && reason !== "vote" && reason !== "disconnect") return false;
      return this.endGame("impostor", reason === "disconnect" ? "disconnect" : reason === "vote" ? "vote" : "kill");
    }
    const prog = this.taskProgress();
    if (prog >= 1 && gp.some((p) => p.team === "crew" && p.tasks.length)) return this.endGame("crew", "tasks");
    return false;
  }
  endGame(winner, reason) {
    this.phase = "GAME_OVER";
    this.phaseEndsAt = this.now() + this.secs(GAME_OVER_TIME);
    this.meeting = null;
    this.sabotage = null;
    this.gameOver = {
      winner,
      reason,
      roles: this.gamePlayers.map((p) => ({ id: p.id, name: p.name, color: p.cosmetics.color, role: p.role, alive: p.alive }))
    };
    log("GAME_END", { room: this.code, winner, reason });
    for (const p of this.players.values()) {
      p.inVent = null;
      this.emitTo(p, "game:over", this.gameOver);
    }
    this.meetingDirty = true;
    this.markRoom();
    return true;
  }
  // ------------------------------------------------------------------ vues réseau
  roomStateFor(p) {
    const players = [...this.players.values()].map((q) => ({
      id: q.id,
      name: q.name,
      cosmetics: q.cosmetics,
      isHost: q.id === this.hostId,
      connected: q.connected,
      knownDead: q.knownDead || this.phase === "GAME_OVER" && !q.alive
    }));
    return { code: this.code, phase: this.phase, hostId: this.hostId, youId: p.id, settings: this.settings, players, serverTime: this.now(), debug: this.debugEnabled };
  }
  privateFor(p) {
    const impostors = p.team === "impostor" || !p.alive && this.settings.ghostsSeeRoles ? this.gamePlayers.filter((q) => q.team === "impostor").map((q) => q.id) : [];
    const revealed = {};
    if (!p.alive && this.settings.ghostsSeeRoles) for (const q of this.gamePlayers) revealed[q.id] = q.role;
    else if (p.team === "impostor") {
      for (const q of this.gamePlayers) if (q.team === "impostor") revealed[q.id] = q.role;
    }
    return {
      role: p.role,
      team: p.team,
      alive: p.alive,
      knownImpostors: impostors,
      revealedRoles: revealed,
      tasks: p.tasks,
      fakeTasks: p.team === "impostor",
      killCooldownEnd: p.killCooldownEnd,
      sabotageCooldownEnd: p.team === "impostor" ? this.sabotageCooldownEnd === Infinity ? 0 : this.sabotageCooldownEnd : 0,
      doorCooldowns: p.team === "impostor" ? this.doorCooldowns : {},
      abilityCooldownEnd: p.abilityCooldownEnd,
      abilityActiveEnd: p.abilityActiveEnd,
      abilityTarget: p.abilityTarget,
      emergencyCooldownEnd: this.emergencyCooldownEnd,
      meetingsLeft: p.meetingsLeft,
      inVent: p.inVent,
      vision: Number.isFinite(this.visionOf(p)) ? this.visionOf(p) : 99999,
      speed: this.speedOf(p)
    };
  }
  meetingFor(p) {
    if (!this.meeting) return null;
    const phase = this.phase === "MEETING" || this.phase === "VOTING" || this.phase === "EJECTION" ? this.phase : "EJECTION";
    return {
      phase,
      callerId: this.meeting.callerId,
      reason: this.meeting.reason,
      bodyColor: this.meeting.bodyColor,
      endsAt: this.phaseEndsAt,
      players: this.gamePlayers.map((q) => ({ id: q.id, dead: !q.alive && q.knownDead, voted: q.vote !== null, disconnected: !q.connected })),
      youVoted: p.vote !== null,
      result: phase === "EJECTION" ? this.meeting.result : void 0
    };
  }
  snapshotFor(p) {
    const players = [];
    const lobby2 = this.phase === "LOBBY";
    for (const q of this.players.values()) {
      if (q === p || !q.connected && !q.inGame) continue;
      if (!lobby2 && !q.inGame) continue;
      if (q.inVent) continue;
      if (!q.alive && p.alive && !lobby2) continue;
      if (!lobby2 && p.alive && !this.canSee(p, q.x, q.y)) continue;
      const sp = { id: q.id, x: Math.round(q.x), y: Math.round(q.y), m: q.moving, f: q.flip, g: q.alive || lobby2 ? 0 : 1 };
      if (this.settings.visualTasks && q.activeTask && q.alive) {
        const t = q.tasks.find((x) => x.id === q.activeTask.taskId);
        if (t && t.steps[t.step]?.minigame === "scan") sp.s = 1;
      }
      players.push(sp);
    }
    const bodies = this.bodies.filter((b) => !p.alive || this.canSee(p, b.x, b.y));
    let prog = this.taskProgress();
    if (this.sabotage?.type === "comms" || this.settings.taskBarUpdates === "never") prog = -1;
    else if (this.settings.taskBarUpdates === "meetings") prog = this.taskProgressAtMeeting;
    const snap = {
      t: this.now(),
      seq: p.lastSeq,
      you: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, ...p.corrected ? { corrected: 1 } : {} },
      players,
      bodies,
      doors: [...this.doorsClosed.keys()],
      sabotage: this.sabotage ? { type: this.sabotage.type, endsAt: this.sabotage.endsAt, switches: this.sabotage.switches, stations: this.sabotage.stations, code: this.sabotage.code } : null,
      taskProgress: prog,
      camsInUse: [...this.players.values()].some((q) => q.console === "security")
    };
    if (p.role === "tracker" && p.abilityTarget && p.abilityActiveEnd > this.now()) {
      const t = this.players.get(p.abilityTarget);
      if (t && t.alive) snap.tracked = { id: t.id, x: Math.round(t.x), y: Math.round(t.y) };
    }
    p.corrected = false;
    return snap;
  }
  /** Volume de chaque voix pour chaque auditeur, calculé à partir des positions réelles (serveur). */
  voiceGainsFor(l) {
    const g = {};
    const s2 = this.settings;
    const meeting = this.phase === "MEETING" || this.phase === "VOTING" || this.phase === "EJECTION";
    const open = this.phase === "LOBBY" || this.phase === "GAME_OVER" || this.phase === "STARTING";
    for (const sp of this.players.values()) {
      if (sp === l) continue;
      let gain = 0;
      let pan = 0;
      if (open || !sp.inGame || !l.inGame) gain = 1;
      else if (!sp.alive) gain = l.alive ? 0 : 1;
      else if (meeting) gain = 1;
      else if (!s2.proximityVoice) gain = 0;
      else {
        const d = dist(l, sp);
        const max = s2.voiceDistance;
        if (d < max) {
          gain = Math.pow(1 - d / max, 1.6);
          if (s2.voiceWallOcclusion && !this.grid.los(l.x, l.y, sp.x, sp.y)) gain *= 0.3;
          if (sp.inVent) gain *= 0.5;
          pan = Math.max(-1, Math.min(1, (sp.x - l.x) / (max * 0.6))) * 0.8;
        }
      }
      g[sp.id] = [Math.round(gain * 100) / 100, Math.round(pan * 100) / 100];
    }
    return g;
  }
  // ------------------------------------------------------------------ boucle
  safeTick() {
    try {
      this.tick();
    } catch (e) {
      log("ERROR", { room: this.code, error: String(e?.stack ?? e) });
    }
  }
  tick() {
    const now = this.now();
    this.tickCount++;
    if (this.phase === "STARTING" && now >= this.phaseEndsAt) {
      this.phase = "PLAYING";
      this.markRoom();
    } else if (this.phase === "MEETING" && now >= this.phaseEndsAt) {
      this.phase = "VOTING";
      this.phaseEndsAt = now + this.secs(this.settings.votingTime);
      this.meetingDirty = true;
      this.markRoom();
    } else if (this.phase === "VOTING" && now >= this.phaseEndsAt) this.tally();
    else if (this.phase === "EJECTION" && now >= this.phaseEndsAt) this.endMeeting();
    else if (this.phase === "GAME_OVER" && now >= this.phaseEndsAt) this.backToLobby();
    if (this.phase === "PLAYING") {
      if (this.sabotage && this.sabotage.endsAt && now >= this.sabotage.endsAt) {
        this.endGame("impostor", "sabotage");
      }
      for (const [id, at] of this.doorsClosed) if (at && now >= at) this.setDoor(id, false);
      for (const p of this.players.values()) {
        if (p.inVent && p.role === "engineer" && now >= p.ventEnd) this.exitVent(p);
        if (p.role === "scientist" && p.console === "vitals" && !p.consoleAt && p.abilityActiveEnd < now) p.console = null;
      }
    }
    const grace = this.phase === "LOBBY" ? 3e4 : 12e4;
    for (const p of [...this.players.values()]) {
      if (!p.connected && now - p.disconnectedAt > grace) {
        if (this.inGamePhase && p.inGame && p.alive && this.phase !== "GAME_OVER") {
          p.alive = false;
          p.knownDead = true;
        }
        this.removePlayer(p, "s'est d\xE9connect\xE9");
      }
    }
    if (this.roomStateDirty) {
      this.roomStateDirty = false;
      for (const p of this.players.values()) this.emitTo(p, "room:state", this.roomStateFor(p));
    }
    if (this.meetingDirty) {
      this.meetingDirty = false;
      for (const p of this.players.values()) this.emitTo(p, "meeting:state", this.meetingFor(p));
    }
    for (const p of this.players.values()) {
      if (p.dirty && p.inGame) {
        p.dirty = false;
        this.emitTo(p, "game:private", this.privateFor(p));
      }
    }
    if (this.phase === "LOBBY" || this.phase === "PLAYING" || this.phase === "STARTING") {
      for (const p of this.players.values()) if (p.connected) this.emitTo(p, "game:snap", this.snapshotFor(p));
    }
    if (this.tickCount % 4 === 0) {
      for (const p of this.players.values()) if (p.connected) this.emitTo(p, "voice:gains", this.voiceGainsFor(p));
    }
    if (this.tickCount % 5 === 0 && this.phase === "PLAYING") {
      for (const p of this.players.values()) if (p.console) this.sendConsole(p);
    }
    if (this.connectedPlayers.length) this.lastActivity = now;
  }
  // ------------------------------------------------------------------ debug
  debug(p, cmd, args = {}) {
    log("DEBUG", { room: this.code, by: p.name, cmd });
    const target = typeof args.id === "string" ? this.players.get(args.id) ?? p : p;
    switch (cmd) {
      case "ping":
        return { ok: true, result: "pong" };
      case "timeScale":
        this.timeScale = Math.max(1, Math.min(50, Number(args.scale) || 1));
        return { ok: true };
      case "teleport": {
        const x = Number(args.x), y = Number(args.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "x/y" };
        target.x = x;
        target.y = y;
        target.corrected = true;
        target.moveBudget = 0;
        return { ok: true };
      }
      case "setRole": {
        const role = args.role;
        if (!ROLE_INFO[role]) return { ok: false, error: "r\xF4le" };
        target.role = role;
        target.team = ROLE_INFO[role].team;
        target.dirty = true;
        for (const q of this.players.values()) q.dirty = true;
        return { ok: true };
      }
      case "resetCooldowns":
        for (const q of this.players.values()) {
          q.killCooldownEnd = 0;
          q.abilityCooldownEnd = 0;
          q.dirty = true;
        }
        this.sabotageCooldownEnd = this.sabotage ? Infinity : 0;
        this.emergencyCooldownEnd = 0;
        this.doorCooldowns = {};
        return { ok: true };
      case "kill":
        this.killPlayer(target, null);
        return { ok: true };
      case "meeting":
        if (this.phase === "PLAYING") this.startMeeting(p, "emergency", null);
        return { ok: true };
      case "endPhase":
        this.phaseEndsAt = 0;
        return { ok: true };
      case "sabotage": {
        const saved = { team: p.team };
        p.team = "impostor";
        this.sabotageCooldownEnd = 0;
        const r = this.doSabotage(p, args.type, args.room);
        p.team = saved.team;
        return r;
      }
      case "completeTasks":
        for (const t of target.tasks) {
          t.step = t.steps.length;
          t.done = true;
        }
        target.dirty = true;
        this.checkWin("tasks");
        return { ok: true };
      case "win":
        if (this.inGamePhase && this.phase !== "GAME_OVER") this.endGame(args.team === "impostor" ? "impostor" : "crew", "kill");
        return { ok: true };
      case "map":
        if (this.phase === "LOBBY" && typeof args.mapId === "string") this.settings = sanitizeSettings({ mapId: args.mapId }, this.settings);
        this.markRoom();
        return { ok: true };
      case "state":
        return {
          ok: true,
          result: {
            phase: this.phase,
            sabotage: this.sabotage,
            doors: [...this.doorsClosed.keys()],
            bodies: this.bodies.length,
            progress: this.taskProgress(),
            players: [...this.players.values()].map((q) => ({ id: q.id, name: q.name, x: q.x, y: q.y, role: q.role, team: q.team, alive: q.alive, inVent: q.inVent, connected: q.connected, tasks: q.tasks })),
            map: this.map.id
          }
        };
      default:
        return { ok: false, error: "commande inconnue" };
    }
  }
};

// server/src/rooms.ts
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var CODE_RE = /^[A-Z0-9]{5}$/;
var RoomManager = class {
  constructor(io2, debugEnabled, maxRooms = 500) {
    this.io = io2;
    this.debugEnabled = debugEnabled;
    this.maxRooms = maxRooms;
    this.gc = setInterval(() => this.collect(), 3e4);
  }
  io;
  debugEnabled;
  maxRooms;
  rooms = /* @__PURE__ */ new Map();
  /** socket.id -> {room, playerId} */
  bySocket = /* @__PURE__ */ new Map();
  gc;
  newCode() {
    for (; ; ) {
      let c = "";
      for (let i = 0; i < 5; i++) c += ALPHABET[randomInt2(ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }
  create() {
    if (this.rooms.size >= this.maxRooms) return null;
    const room = new Room(this.newCode(), this.io, this.debugEnabled);
    this.rooms.set(room.code, room);
    return room;
  }
  get(code) {
    return this.rooms.get(code);
  }
  bind(socketId, code, playerId) {
    this.bySocket.set(socketId, { code, playerId });
  }
  unbind(socketId) {
    this.bySocket.delete(socketId);
  }
  lookup(socketId) {
    const b = this.bySocket.get(socketId);
    if (!b) return null;
    const room = this.rooms.get(b.code);
    const player = room?.players.get(b.playerId);
    if (!room || !player || player.socketId !== socketId) return null;
    return { room, player };
  }
  collect() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      if (room.isEmpty || room.connectedPlayers.length === 0 && idle > 5 * 6e4) {
        room.destroy("Salon ferm\xE9 (inactif).");
        this.rooms.delete(code);
      }
    }
    for (const [sid, b] of this.bySocket) if (!this.rooms.has(b.code)) this.bySocket.delete(sid);
  }
  shutdown() {
    clearInterval(this.gc);
    for (const r of this.rooms.values()) r.destroy("Serveur arr\xEAt\xE9.");
    this.rooms.clear();
  }
};

// server/src/voice.ts
import { AccessToken } from "livekit-server-sdk";
var voiceConfig = {
  // trim() : un espace ou un retour à la ligne collé par erreur casse la signature des jetons
  url: (process.env.LIVEKIT_URL ?? "").trim().replace(/^https:/, "wss:").replace(/\/+$/, ""),
  apiKey: (process.env.LIVEKIT_API_KEY ?? "").trim(),
  apiSecret: (process.env.LIVEKIT_API_SECRET ?? "").trim(),
  get enabled() {
    return Boolean(this.url && this.apiKey && this.apiSecret);
  }
};
async function createVoiceToken(roomCode, playerId, name) {
  const at = new AccessToken(voiceConfig.apiKey, voiceConfig.apiSecret, { identity: playerId, name, ttl: "8h" });
  const room = `astro-${roomCode}`;
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
  return { url: voiceConfig.url, token: await at.toJwt(), room };
}

// server/src/index.ts
var PORT = Number(process.env.PORT ?? 3001);
var DEBUG_KEY = process.env.DEBUG_KEY ?? "";
var here = dirname(fileURLToPath(import.meta.url));
var clientDir = [resolve(here, "client"), resolve(here, "../dist/client"), resolve(here, "../../dist/client"), here].find((d) => existsSync2(join(d, "index.html")));
var app = express();
app.disable("x-powered-by");
var http = createServer(app);
var io = new Server(http, {
  cors: process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN.split(",") } : void 0,
  pingInterval: 1e4,
  pingTimeout: 15e3,
  maxHttpBufferSize: 16e3,
  connectionStateRecovery: void 0
});
var rooms = new RoomManager(io, Boolean(DEBUG_KEY));
var createLimiter = new IpLimiter(10, 5);
var joinLimiter = new IpLimiter(Number(process.env.JOIN_RATE_PER_MIN ?? 120), 40);
app.get("/health", (_req, res) => {
  let players = 0;
  for (const r of rooms.rooms.values()) players += r.connectedPlayers.length;
  const m = process.memoryUsage();
  res.json({ ok: true, rooms: rooms.rooms.size, players, voice: voiceConfig.enabled, rssMB: Math.round(m.rss / 1e6), heapMB: Math.round(m.heapUsed / 1e6), uptime: Math.round(process.uptime()) });
});
if (clientDir) {
  app.use(express.static(clientDir, { maxAge: "1h", index: false }));
  app.get(/^\/(join\/[A-Za-z0-9]+)?$/, (_req, res) => res.sendFile(join(clientDir, "index.html")));
  app.use((req, res, next) => req.method === "GET" && !req.path.startsWith("/socket.io") ? res.sendFile(join(clientDir, "index.html")) : next());
}
var ipOf = (s2) => String(s2.handshake.headers["x-forwarded-for"] ?? s2.handshake.address).split(",")[0].trim();
io.on("connection", (socket) => {
  const limiter = new SocketLimiter();
  const ip = ipOf(socket);
  const on = (event, kind, fn) => {
    socket.on(event, (...args) => {
      const ack = typeof args[args.length - 1] === "function" ? args.pop() : null;
      if (!limiter.allow(kind)) {
        if (limiter.abusive) {
          log("RATE_LIMIT", { ip, event });
          socket.disconnect(true);
        }
        ack?.({ ok: false, error: "Trop de requ\xEAtes, ralentis." });
        return;
      }
      try {
        const r = fn(...args);
        if (r instanceof Promise) r.then((v) => ack?.(v)).catch((e) => {
          log("ERROR", { event, error: String(e) });
          ack?.({ ok: false, error: "Erreur serveur." });
        });
        else ack?.(r ?? { ok: true });
      } catch (e) {
        log("ERROR", { event, error: String(e?.stack ?? e) });
        ack?.({ ok: false, error: "Erreur serveur." });
      }
    });
  };
  const ctx = () => rooms.lookup(socket.id);
  const notIn = { ok: false, error: "Tu n'es dans aucune partie." };
  const leaveCurrent = () => {
    const c = ctx();
    if (c) {
      c.room.leave(c.player);
      rooms.unbind(socket.id);
    }
  };
  on("room:create", "meta", (p) => {
    if (!createLimiter.allow(ip)) return { ok: false, error: "Trop de salons cr\xE9\xE9s, r\xE9essaie dans une minute." };
    leaveCurrent();
    const room = rooms.create();
    if (!room) return { ok: false, error: "Serveur plein, r\xE9essaie plus tard." };
    const r = room.addPlayer(String(p?.name ?? ""), p?.cosmetics, socket.id);
    if (!r.ok) {
      rooms.rooms.delete(room.code);
      room.destroy("\xE9chec");
      return r;
    }
    rooms.bind(socket.id, room.code, r.playerId);
    room.sendFullState(room.players.get(r.playerId));
    return r;
  });
  on("room:join", "meta", (p) => {
    if (!joinLimiter.allow(ip)) return { ok: false, error: "Trop de tentatives, patiente un peu." };
    const code = String(p?.code ?? "").toUpperCase().trim();
    if (!CODE_RE.test(code)) return { ok: false, error: "Code invalide." };
    const room = rooms.get(code);
    if (!room) return { ok: false, error: "Partie introuvable." };
    leaveCurrent();
    const r = room.addPlayer(String(p?.name ?? ""), p?.cosmetics, socket.id);
    if (!r.ok) return r;
    rooms.bind(socket.id, code, r.playerId);
    room.sendFullState(room.players.get(r.playerId));
    return r;
  });
  on("room:resume", "meta", (p) => {
    if (!joinLimiter.allow(ip)) return { ok: false, error: "Trop de tentatives, patiente un peu." };
    const code = String(p?.code ?? "").toUpperCase();
    const room = rooms.get(code);
    if (!room || typeof p?.token !== "string") return { ok: false, error: "Partie introuvable." };
    const prev = [...room.players.values()].find((q) => q.token === p.token);
    if (prev?.socketId && prev.socketId !== socket.id) {
      io.sockets.sockets.get(prev.socketId)?.emit("kicked", "Connexion ouverte dans un autre onglet.");
      rooms.unbind(prev.socketId);
    }
    const r = room.resume(p.token, socket.id);
    if (!r.ok) return r;
    rooms.bind(socket.id, code, r.playerId);
    room.sendFullState(room.players.get(r.playerId));
    return r;
  });
  on("room:leave", "meta", () => leaveCurrent());
  on("room:kick", "meta", (p) => {
    const c = ctx();
    if (c) c.room.kick(c.player, String(p?.playerId));
  });
  on("lobby:cosmetics", "action", (p) => {
    const c = ctx();
    if (c) c.room.setCosmetics(c.player, p ?? {});
  });
  on("lobby:name", "meta", (p) => {
    const c = ctx();
    return c ? c.room.rename(c.player, String(p?.name ?? "")) : notIn;
  });
  on("lobby:settings", "action", (p) => {
    const c = ctx();
    if (c) c.room.updateSettings(c.player, p ?? {});
  });
  on("lobby:start", "meta", () => {
    const c = ctx();
    return c ? c.room.start(c.player) : notIn;
  });
  on("game:returnLobby", "meta", () => {
    const c = ctx();
    if (c) c.room.returnToLobby(c.player);
  });
  on("move", "move", (m) => {
    const c = ctx();
    if (c) c.room.move(c.player, m);
  });
  on("act:kill", "action", (p) => {
    const c = ctx();
    return c ? c.room.kill(c.player, String(p?.targetId)) : notIn;
  });
  on("act:report", "action", (p) => {
    const c = ctx();
    return c ? c.room.report(c.player, String(p?.bodyId)) : notIn;
  });
  on("act:emergency", "action", () => {
    const c = ctx();
    return c ? c.room.emergency(c.player) : notIn;
  });
  on("act:taskStart", "action", (p) => {
    const c = ctx();
    return c ? c.room.taskStart(c.player, String(p?.taskId)) : notIn;
  });
  on("act:taskComplete", "action", (p) => {
    const c = ctx();
    return c ? c.room.taskComplete(c.player, String(p?.taskId)) : notIn;
  });
  on("act:taskCancel", "action", () => {
    const c = ctx();
    if (c) c.room.cancelTask(c.player);
  });
  on("act:sabotage", "action", (p) => {
    const c = ctx();
    return c ? c.room.doSabotage(c.player, p?.type, p?.room) : notIn;
  });
  on("act:fix", "action", (p) => {
    const c = ctx();
    return c ? c.room.fix(c.player, String(p?.stationId), String(p?.action), typeof p?.index === "number" ? p.index : void 0, typeof p?.code === "string" ? p.code : void 0) : notIn;
  });
  on("act:vent", "action", (p) => {
    const c = ctx();
    if (!c) return notIn;
    if (!["enter", "exit", "move"].includes(String(p?.action))) return { ok: false, error: "Action invalide." };
    return c.room.vent(c.player, p.action, p.ventId);
  });
  on("act:console", "action", (p) => {
    const c = ctx();
    const k = String(p?.kind);
    if (!c) return notIn;
    if (!["security", "admin", "vitals", "none"].includes(k)) return { ok: false, error: "Console invalide." };
    return c.room.useConsole(c.player, k);
  });
  on("act:ability", "action", (p) => {
    const c = ctx();
    return c ? c.room.ability(c.player, p?.targetId ? String(p.targetId) : void 0) : notIn;
  });
  on("meeting:vote", "action", (p) => {
    const c = ctx();
    return c ? c.room.vote(c.player, String(p?.targetId)) : notIn;
  });
  on("chat:send", "chat", (p) => {
    const c = ctx();
    return c ? c.room.sendChat(c.player, String(p?.text ?? "")) : notIn;
  });
  on("voice:state", "action", (p) => {
    const c = ctx();
    if (c) c.player.voiceSpeaking = Boolean(p?.speaking);
  });
  on("voice:token", "meta", async () => {
    const c = ctx();
    if (!c) return notIn;
    if (!voiceConfig.enabled) return { ok: false, error: "Le chat vocal n'est pas configur\xE9 sur ce serveur (variables LIVEKIT_*)." };
    if (!c.room.settings.proximityVoice) return { ok: false, error: "Chat vocal d\xE9sactiv\xE9 par l'h\xF4te." };
    return { ok: true, ...await createVoiceToken(c.room.code, c.player.id, c.player.name) };
  });
  on("debug:cmd", "meta", (p) => {
    if (!DEBUG_KEY || p?.key !== DEBUG_KEY) return { ok: false, error: "Mode debug indisponible." };
    const c = ctx();
    return c ? c.room.debug(c.player, String(p.cmd), p.args ?? {}) : notIn;
  });
  socket.on("ping", (_t, ack) => {
    if (typeof ack === "function") ack(Date.now());
  });
  socket.on("disconnect", () => {
    const c = ctx();
    if (c) c.room.disconnect(c.player);
    rooms.unbind(socket.id);
  });
});
http.listen(PORT, () => {
  log("SERVER_START", { port: PORT, client: clientDir ?? "non servi (mode dev)", voice: voiceConfig.enabled ? "LiveKit" : "d\xE9sactiv\xE9", debug: Boolean(DEBUG_KEY) });
});
var shutdown = () => {
  rooms.shutdown();
  io.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2e3).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (e) => log("ERROR", { error: String(e?.stack ?? e) }));
process.on("unhandledRejection", (e) => log("ERROR", { error: String(e) }));
