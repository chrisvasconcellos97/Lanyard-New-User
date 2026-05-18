import { useState, useEffect, useMemo, useRef } from "react";

const C = {
  bg: "#0D1F1C", bgCard: "#142420", bgCardAlt: "#1A2E29", bgDark: "#0A1714",
  bgPill: "#1E3530", bgPillActive: "#2D5A4F",
  accent: "#4A9B82", accentDim: "#2D6B5A", accentOrange: "#E8873A",
  border: "#1F3530", text: "#E8F0EE", textSub: "#7A9E98", textMuted: "#3D5C57",
  green: "#4ADE80", yellow: "#FBBF24", red: "#F87171", blue: "#67E8F9", purple: "#A5B4FC",
};

const SUPABASE_URL = "https://yrpdjmyfidhxlpmxasao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycGRqbXlmaWRoeGxwbXhhc2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Nzg3NDQsImV4cCI6MjA5NDU1NDc0NH0.tutTq1raFxA3HKUWsfYsUJtCZeQfswc3tFh7sqUM2RA";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const DATA_VERSION = "1";
const TEAM_ID_PREFIX = "lanyard_team_";
const TEAM_ID = TEAM_ID_PREFIX + "default";

const DAYS = [
  { key: "mon", label: "Mon", date: "1", full: "Day 1" },
  { key: "tue", label: "Tue", date: "2", full: "Day 2" },
  { key: "wed", label: "Wed", date: "3", full: "Day 3" },
  { key: "thu", label: "Thu", date: "4", full: "Day 4" },
];

const TRACK_COLORS = {
  "Conference": "#67E8F9",
  "Meal/Reception": "#4ADE80",
  "Partner Meeting": "#E8873A",
  "Open Slot": "#A5B4FC",
  "Logistics": "#7A9E98",
  "Keynote": "#FBBF24",
};

const STATUS_COLORS = { green: "#4ADE80", yellow: "#FBBF24", red: "#F87171" };
const STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };
const TIER_COLORS = { Major: "#67E8F9", Mid: "#A5B4FC", Growth: "#4ADE80" };
const MS_COLORS = { upcoming: "#67E8F9", "in-progress": "#FBBF24", complete: "#4ADE80" };
const MS_LABELS = { upcoming: "Upcoming", "in-progress": "In Progress", complete: "Complete" };

const ROLES = [
  { id: "am",     label: "Account Manager", desc: "Day to day POC - full detail from Pip" },
  { id: "dir",    label: "Director",        desc: "Monthly touchpoint - strategic context" },
  { id: "vp",     label: "VP",              desc: "Conference only - executive brevity" },
  { id: "custom", label: "Custom",          desc: "Enter your own title" },
];

const TEAM = [
  { key: "A", name: "Attendee 1", title: "Account Manager", color: "#4A9B82" },
  { key: "B", name: "Attendee 2", title: "Director",        color: "#86EFAC" },
  { key: "C", name: "Attendee 3", title: "VP",              color: "#E8873A" },
];

const VENUES = {};
const HOTEL_DEFAULT = {
  name: "", address: "", phone: "", checkIn: "", checkOut: "", roomNumber: "",
};
const KNOWN_VENUES = [];
const INIT_PARTNERS = [];
const INIT_SESSIONS = [];
// ---- HELPERS ----
function toRgb(hex) {
  if (!hex || hex[0] !== "#") return "0,0,0";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return r + "," + g + "," + b;
}

function getVenueKey(loc) {
  if (!loc) return null;
  return Object.keys(VENUES).find(function(v) { return loc.includes(v); }) || null;
}

function parseTime(t) {
  if (!t) return 0;
  var parts = t.split(" ");
  var period = parts[1];
  var hm = (parts[0] || "0:0").split(":");
  var h = parseInt(hm[0]) || 0;
  var m = parseInt(hm[1]) || 0;
  if (period === "PM" && h !== 12) h = h + 12;
  else if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function getConferenceDayKey(now) {
  var mo = now.getMonth();
  var d = now.getDate();
  var y = now.getFullYear();
  if (y === 2026 && mo === 4) {
    if (d === 18) return "mon";
    if (d === 19) return "tue";
    if (d === 20) return "wed";
    if (d === 21) return "thu";
  }
  return null;
}

function getCurrentDayKey() {
  return getConferenceDayKey(new Date()) || "tue";
}

function getWeatherEmoji(code) {
  if (!code && code !== 0) return "🌤";
  if (code <= 1) return "☀️";
  if (code <= 3) return "🌤";
  if (code <= 48) return "🌫";
  if (code <= 67) return "🌧";
  return "⛈";
}

function getWeatherDesc(code) {
  if (!code && code !== 0) return "Partly Cloudy";
  if (code <= 1) return "Sunny";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rainy";
  return "Stormy";
}

function getUserId() {
  try {
    var id = localStorage.getItem("lanyard_uid");
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("lanyard_uid", id);
    }
    return id;
  } catch (e) {
    return "u_default";
  }
}

function getInviteParams() {
  try {
    var search = window.location.search;
    if (!search) return null;
    var params = {};
    search.slice(1).split("&").forEach(function(pair) {
      var kv = pair.split("=");
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
    if (params.invite) return params;
  } catch (e) {}
  return null;
}

function loadLocal() {
  try {
    var r = localStorage.getItem("lanyard_v" + DATA_VERSION);
    if (r) return JSON.parse(r);
  } catch (e) {}
  return null;
}

function saveLocal(s) {
  try {
    localStorage.setItem("lanyard_v" + DATA_VERSION, JSON.stringify(s));
  } catch (e) {}
}

function autoGenerateOpenSlots(sessions) {
  var MIN_GAP = 25;
  var manual = sessions.filter(function(s) {
    return !(typeof s.id === "string" && s.id.indexOf("auto_") === 0);
  });
  var autoSlots = [];
  DAYS.forEach(function(d) {
    if (d.key === "thu") return;
    var daySess = manual.filter(function(s) {
      return s.day === d.key && !s.isChild && s.time && s.track !== "Open Slot" && s.track !== "Logistics";
    }).sort(function(a, b) {
      return parseTime(a.time) - parseTime(b.time);
    });
    for (var i = 0; i < daySess.length - 1; i++) {
      var curr = daySess[i];
      var next = daySess[i + 1];
      var currEnd = curr.end ? parseTime(curr.end) : parseTime(curr.time) + 60;
      var nextStart = parseTime(next.time);
      var gap = nextStart - currEnd;
      if (gap >= MIN_GAP) {
        var fmt = function(mins) {
          var h = Math.floor(mins / 60);
          var m = mins % 60;
          var period = h >= 12 ? "PM" : "AM";
          var h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
          return h12 + ":" + (m < 10 ? "0" + m : m) + " " + period;
        };
        var label = gap >= 90 ? "Extended window" : gap >= 60 ? "Open hour" : "Open slot";
        autoSlots.push({
          id: "auto_" + d.key + "_" + i,
          day: d.key,
          time: fmt(currEnd),
          end: fmt(nextStart),
          title: "Open Slot",
          location: "",
          track: "Open Slot",
          attendees: ["C", "K", "T"],
          notes: label + " (" + gap + " min)",
          status: "upcoming",
          partnerId: null,
          isParent: false,
          isChild: false,
        });
      }
    }
  });
  return manual.concat(autoSlots);
}

// ---- SUPABASE ----
function sbH() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
  };
}

function sbLoad(cb) {
  var uid = getUserId();
  Promise.all([
    fetch(SUPABASE_URL + "/rest/v1/sessions?user_id=eq." + TEAM_ID + "&select=id,data", { headers: sbH() }),
    fetch(SUPABASE_URL + "/rest/v1/partners?user_id=eq." + TEAM_ID + "&select=id,data", { headers: sbH() }),
    fetch(SUPABASE_URL + "/rest/v1/user_prefs?user_id=eq." + uid + "&select=hotel,quick_note", { headers: sbH() }),
    fetch(SUPABASE_URL + "/rest/v1/user_prefs?user_id=eq." + uid + "_notes&select=hotel", { headers: sbH() }),
  ]).then(function(rs) {
    return Promise.all([rs[0].json(), rs[1].json(), rs[2].json(), rs[3].json()]);
  }).then(function(data) {
    var sess = data[0];
    var parts = data[1];
    var prefs = data[2];
    var notesRaw = data[3];
    var personalNotes = {};
    try {
      if (notesRaw[0] && notesRaw[0].hotel) personalNotes = notesRaw[0].hotel;
    } catch (e) {}
    var mergedSessions = null;
    if (Array.isArray(sess) && sess.length > 0) {
      mergedSessions = sess.map(function(r) {
        var s = r.data;
        var personal = personalNotes[String(s.id)] || {};
        return Object.assign({}, s, personal);
      });
    }
    cb({
      sessions: mergedSessions,
      partners: Array.isArray(parts) && parts.length > 0 ? parts.map(function(r) { return r.data; }) : null,
      hotel: prefs[0] ? prefs[0].hotel : null,
      quickNote: prefs[0] ? prefs[0].quick_note : null,
    });
  }).catch(function() { cb(null); });
}

function sbSave(sessions, partners, hotel, quickNote) {
  var uid = getUserId();
  var sharedSessions = sessions.map(function(s) {
    var shared = Object.assign({}, s);
    delete shared.takeaways;
    delete shared.actionItems;
    delete shared.commitmentsMade;
    delete shared.followUpDate;
    delete shared.rating;
    return { id: String(s.id) + "_shared", user_id: TEAM_ID, data: shared };
  });
  fetch(SUPABASE_URL + "/rest/v1/sessions?user_id=eq." + TEAM_ID, { method: "DELETE", headers: sbH() })
    .then(function() {
      if (sharedSessions.length > 0) {
        fetch(SUPABASE_URL + "/rest/v1/sessions", {
          method: "POST",
          headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
          body: JSON.stringify(sharedSessions),
        });
      }
    }).catch(function() {});
  var personalNotes = {};
  sessions.forEach(function(s) {
    var n = {};
    if (s.takeaways) n.takeaways = s.takeaways;
    if (s.actionItems) n.actionItems = s.actionItems;
    if (s.commitmentsMade) n.commitmentsMade = s.commitmentsMade;
    if (s.followUpDate) n.followUpDate = s.followUpDate;
    if (s.rating) n.rating = s.rating;
    if (Object.keys(n).length > 0) personalNotes[String(s.id)] = n;
  });
  fetch(SUPABASE_URL + "/rest/v1/user_prefs", {
    method: "POST",
    headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({ user_id: uid + "_notes", hotel: personalNotes, quick_note: "" }),
  }).catch(function() {});
  fetch(SUPABASE_URL + "/rest/v1/partners?user_id=eq." + TEAM_ID, { method: "DELETE", headers: sbH() })
    .then(function() {
      if (partners.length > 0) {
        var rows = partners.map(function(p) {
          return { id: String(p.id) + "_shared", user_id: TEAM_ID, data: p };
        });
        fetch(SUPABASE_URL + "/rest/v1/partners", {
          method: "POST",
          headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
          body: JSON.stringify(rows),
        });
      }
    }).catch(function() {});
  fetch(SUPABASE_URL + "/rest/v1/user_prefs", {
    method: "POST",
    headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({ user_id: uid, hotel: hotel, quick_note: quickNote }),
  }).catch(function() {});
}

function sbSaveNotification(msg, who) {
  fetch(SUPABASE_URL + "/rest/v1/notifications", {
    method: "POST",
    headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({
      id: TEAM_ID + "_" + Date.now(),
      team_id: TEAM_ID,
      message: msg,
      who: who,
      created_at: new Date().toISOString(),
    }),
  }).catch(function() {});
}

function sbLoadNotifications(cb) {
  fetch(
    SUPABASE_URL + "/rest/v1/notifications?team_id=eq." + TEAM_ID + "&order=created_at.desc&limit=30&select=id,message,who,created_at",
    { headers: sbH() }
  ).then(function(r) {
    return r.json();
  }).then(function(d) {
    cb(null, Array.isArray(d) ? d : []);
  }).catch(function() {
    cb(null, []);
  });
}

function sbSaveShareCode(code, data, cb) {
  fetch(SUPABASE_URL + "/rest/v1/share_codes", {
    method: "POST",
    headers: Object.assign({}, sbH(), { Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({ code: code, data: JSON.stringify(data), created_at: new Date().toISOString() }),
  }).then(function() { cb(null); }).catch(function(e) { cb(e); });
}

function sbLoadShareCode(code, cb) {
  fetch(SUPABASE_URL + "/rest/v1/share_codes?code=eq." + code + "&select=data", { headers: sbH() })
    .then(function(r) { return r.json(); })
    .then(function(d) { cb(null, d[0] ? JSON.parse(d[0].data) : null); })
    .catch(function(e) { cb(e, null); });
}

// ---- PIP AI ----
function getRoleCtx(role, customTitle) {
  if (role === "vp") return "You are Pip, an AI assistant. The user is a VP. Be extremely concise - 2-3 sentences max. Executive brevity always.";
  if (role === "dir") return "You are Pip, an AI assistant. The user is a Director. Give strategic context, be concise but substantive.";
  if (role === "custom") return "You are Pip, an AI assistant. The user's title is " + customTitle + ". Calibrate your communication for their role.";
  return "You are Pip, an AI assistant. The user is the day-to-day Account Manager POC. Give full detail - every open item, full context, what to lead with.";
}

function askPip(prompt, role, customTitle, ctx, cb) {
  var sys = getRoleCtx(role, customTitle);
  var userContent = ctx ? ctx + "\n\n" + prompt : prompt;
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      system: sys,
      messages: [
        { role: "user", content: userContent },
      ],
    }),
  }).then(function(r) {
    return r.json();
  }).then(function(d) {
    var text = d.content && d.content[0] && d.content[0].text;
    cb(null, text || "Pip couldn't respond right now.");
  }).catch(function() {
    cb(null, "Pip couldn't respond right now.");
  });
}

function buildPartnerCtx(p) {
  if (!p) return "";
  var items = p.openItems.filter(function(o) { return !o.done; }).map(function(o) { return o.text; }).join("; ");
  var poc = p.attendees.filter(function(a) { return a.poc; }).map(function(a) { return a.name + " (" + a.title + ")"; }).join(", ");
  return "Partner: " + p.name + ". Revenue: " + p.revenue + ". Status: " + STATUS_LABELS[p.status] + ". Tier: " + p.tier +
    (p.objective ? " Objective: " + p.objective : "") +
    (items ? " Open items: " + items : "") +
    (poc ? " POC: " + poc : "") +
    (p.pastNotes ? " Past notes: " + p.pastNotes : "");
}

// ---- STYLES ----
var inp = {
  width: "100%", background: "#0F1A18", border: "1px solid #1F3530",
  borderRadius: 8, padding: "9px 12px", color: "#E8F0EE",
  fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", outline: "none",
};
var ta = Object.assign({}, inp, { resize: "vertical", minHeight: 68 });
var btnBase = {
  cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
  fontSize: 12, borderRadius: 24, padding: "8px 16px", border: "none",
};
// ---- SMALL COMPONENTS ----
function PipMark(props) {
  var size = props.size || 12;
  var color = props.color || "#4A9B82";
  var opacity = props.opacity !== undefined ? props.opacity : 1;
  var glow = props.glow || false;
  var pulse = props.pulse || false;
  return (
    <svg width={size} height={size * 2} viewBox="0 0 10 20" fill="none" className={pulse ? "pip-pulse" : ""}>
      {glow && <circle cx="5" cy="5" r="7" fill={color} fillOpacity="0.1" />}
      <circle cx="5" cy="5" r="4" fill={color} fillOpacity={opacity} />
      {glow && <circle cx="5" cy="15" r="5" fill={color} fillOpacity="0.07" />}
      <circle cx="5" cy="15" r="2.8" fill={color} fillOpacity={opacity * 0.42} />
    </svg>
  );
}

function LanyardLogo(props) {
  var size = props.size || 28;
  var color = props.color || "#4A9B82";
  return (
    <svg width={size * 0.7} height={size * 1.3} viewBox="0 0 28 52" fill="none">
      <path d="M14 5 L8 1 M14 5 L20 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="14" cy="5" r="2.2" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.2" />
      <circle cx="14" cy="5" r="0.9" fill={color} opacity="0.8" />
      <rect x="2" y="8" width="24" height="42" rx="4" fill={color} fillOpacity="0.09" stroke={color} strokeWidth="1.4" />
      <rect x="2" y="8" width="24" height="8" rx="4" fill={color} fillOpacity="0.2" />
      <rect x="6" y="20" width="16" height="2" rx="1" fill={color} opacity="0.6" />
      <rect x="8" y="24" width="12" height="1.5" rx="0.75" fill={color} opacity="0.35" />
      <circle cx="14" cy="36" r="5" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
      <circle cx="14" cy="36" r="2.2" fill={color} opacity="0.7" />
      <circle cx="14" cy="44" r="3.5" fill={color} fillOpacity="0.07" stroke={color} strokeWidth="0.8" strokeOpacity="0.2" />
      <circle cx="14" cy="44" r="1.5" fill={color} opacity="0.32" />
    </svg>
  );
}

function Pill(props) {
  var color = props.color;
  return (
    <span style={{
      background: "rgba(" + toRgb(color) + ",0.15)",
      color: color,
      fontSize: 10,
      fontWeight: 600,
      padding: "3px 9px",
      borderRadius: 20,
      border: "1px solid rgba(" + toRgb(color) + ",0.2)",
      whiteSpace: "nowrap",
    }}>
      {props.children}
    </span>
  );
}

function FL(props) {
  return (
    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {props.children}
    </div>
  );
}

function Card(props) {
  var style = props.style || {};
  var accent = props.accent;
  return (
    <div
      onClick={props.onClick}
      style={Object.assign({
        background: C.bgCard,
        border: "1px solid " + C.border,
        borderLeft: accent ? "3px solid " + accent : "1px solid " + C.border,
        borderRadius: 12,
      }, style)}
    >
      {props.children}
    </div>
  );
}

function GreenBtn(props) {
  var style = props.style || {};
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={Object.assign({}, btnBase, { background: C.accent, color: "#fff", opacity: props.disabled ? 0.6 : 1 }, style)}
    >
      {props.children}
    </button>
  );
}

function SecBtn(props) {
  var style = props.style || {};
  return (
    <button
      onClick={props.onClick}
      style={Object.assign({}, btnBase, { background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border }, style)}
    >
      {props.children}
    </button>
  );
}

function Toast(props) {
  if (!props.message) return null;
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: C.accent, color: "#fff", padding: "11px 20px",
      borderRadius: 24, fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif",
      whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(74,155,130,0.4)",
    }}>
      {"OK " + props.message}
    </div>
  );
}

function Modal(props) {
  var wide = props.wide;
  function handleBg(e) {
    if (e.target === e.currentTarget) props.onClose();
  }
  return (
    <div
      onClick={handleBg}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.75)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        background: C.bgCard, border: "1px solid " + C.border, borderRadius: 16,
        padding: 22, width: "100%", maxWidth: wide ? 620 : 460,
        maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{props.title}</div>
          <button
            onClick={props.onClose}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >
            x
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

function EmptyState(props) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <PipMark size={18} color={C.accent} opacity={0.4} glow />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.textSub, marginBottom: 8 }}>{props.title}</div>
      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7, marginBottom: props.action ? 20 : 0 }}>{props.body}</div>
      {props.action && (
        <GreenBtn onClick={props.onAction} style={{ fontSize: 12, padding: "8px 20px" }}>
          {props.action}
        </GreenBtn>
      )}
    </div>
  );
}

function AddressSearch(props) {
  var value = props.value || "";
  var onChange = props.onChange;
  var placeholder = props.placeholder || "Search venue or address...";
  const [query, setQuery] = useState(value);
  const [sugs, setSugs] = useState([]);
  const timer = useRef(null);
  useEffect(function() {
    if (query.length < 2) { setSugs([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(function() {
      var q = query.toLowerCase();
      setSugs(KNOWN_VENUES.filter(function(k) {
        return k.name.toLowerCase().includes(q) || k.address.toLowerCase().includes(q);
      }).slice(0, 4));
    }, 200);
    return function() { clearTimeout(timer.current); };
  }, [query]);
  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        onChange={function(e) { setQuery(e.target.value); onChange(e.target.value); }}
        placeholder={placeholder}
        style={inp}
      />
      {sugs.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.bgDark, border: "1px solid " + C.border, borderRadius: 8, zIndex: 100, marginTop: 2 }}>
          {sugs.map(function(s, i) {
            return (
              <div
                key={i}
                onClick={function() { setQuery(s.name); onChange(s.name); setSugs([]); }}
                style={{ padding: "10px 12px", borderBottom: "1px solid " + C.border, cursor: "pointer", fontSize: 12 }}
              >
                <div style={{ color: C.text, fontWeight: 500 }}>{s.name}</div>
                <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{s.address}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpenItemsList(props) {
  var items = props.items;
  var onToggle = props.onToggle;
  if (!items || !items.length) {
    return <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>No open items</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map(function(oi) {
        return (
          <div key={oi.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!oi.done}
              onChange={function() { if (onToggle) onToggle(oi.id); }}
              style={{ marginTop: 3, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: oi.done ? C.textMuted : C.textSub, textDecoration: oi.done ? "line-through" : "none", lineHeight: 1.5 }}>
              {oi.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AttendeeList(props) {
  var attendees = props.attendees;
  if (!attendees || !attendees.length) return null;
  var sorted = attendees.slice().sort(function(a, b) { return (b.poc ? 1 : 0) - (a.poc ? 1 : 0); });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {sorted.map(function(a) {
        return (
          <div key={a.id} style={{ background: C.bgDark, border: "1px solid " + C.border, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(" + toRgb(C.accent) + "," + (a.poc ? "0.2" : "0.08") + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: a.poc ? C.accent : C.textMuted, flexShrink: 0 }}>
              {(a.name || "?").charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>
                {a.name}
                {a.poc && <span style={{ color: C.yellow, fontSize: 10, marginLeft: 5 }}>POC</span>}
              </div>
              {a.title && <div style={{ fontSize: 10, color: C.textMuted }}>{a.title}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipBlock(props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  function generate() {
    setLoading(true);
    askPip(props.prompt, props.role, props.customTitle, props.context, function(err, result) {
      setText(result);
      setDone(true);
      setLoading(false);
    });
  }
  return (
    <div style={{ background: "rgba(" + toRgb(C.accent) + ",0.06)", border: "1px solid rgba(" + toRgb(C.accent) + ",0.2)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: done ? 10 : 0 }}>
        <PipMark size={10} color={C.accent} glow pulse={loading} />
        <div style={{ fontSize: 11, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.07em", flex: 1 }}>
          {props.label}
        </div>
        {!done && (
          <button
            onClick={generate}
            disabled={loading}
            style={Object.assign({}, btnBase, { background: loading ? "transparent" : C.accent, color: loading ? C.textMuted : "#fff", fontSize: 10, padding: "5px 12px", opacity: loading ? 0.6 : 1 })}
          >
            {loading ? "Thinking..." : "Ask Pip"}
          </button>
        )}
        {done && (
          <button
            onClick={function() { setText(""); setDone(false); }}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}
          >
            refresh
          </button>
        )}
      </div>
      {done && <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{text}</div>}
    </div>
  );
}
// ---- MODALS ----
function VenueModal(props) {
  var locationName = props.locationName;
  var key = getVenueKey(locationName);
  var venue = key ? VENUES[key] : null;
  var addr = venue ? venue.address : locationName;
  return (
    <Modal onClose={props.onClose} title={locationName || "Venue"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Address</FL>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{addr}</div>
        </div>
        {venue && venue.phone && (
          <div>
            <FL>Phone</FL>
            <div style={{ fontSize: 13, color: C.text }}>{venue.phone}</div>
          </div>
        )}
        <a
          href={"https://maps.google.com/?q=" + encodeURIComponent(addr)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", background: C.accent, color: "#fff", borderRadius: 24, padding: "11px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", textDecoration: "none" }}
        >
          Get Directions
        </a>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=" + encodeURIComponent(addr)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, display: "block", textAlign: "center", background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border, borderRadius: 24, padding: "10px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", textDecoration: "none" }}
          >
            Uber
          </a>
          <a
            href={"https://lyft.com/ride?destination[address]=" + encodeURIComponent(addr)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, display: "block", textAlign: "center", background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border, borderRadius: 24, padding: "10px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", textDecoration: "none" }}
          >
            Lyft
          </a>
        </div>
      </div>
    </Modal>
  );
}

function MeetingModal(props) {
  var session = props.session;
  var pMap = props.pMap;
  var role = props.role;
  var customTitle = props.customTitle;
  const [venueModal, setVM] = useState(null);
  var partner = session.partnerId ? pMap[session.partnerId] : null;
  var vKey = getVenueKey(session.location);
  var partnerCtx = buildPartnerCtx(partner);
  function upd(f, v) { props.onUpdateS(session.id, f, v); }
  return (
    <Modal onClose={props.onClose} title={session.title} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Pill color={TRACK_COLORS[session.track] || C.accent}>{session.track}</Pill>
          <Pill color={MS_COLORS[session.status] || C.blue}>{MS_LABELS[session.status] || "Upcoming"}</Pill>
          {props.hasConflict && <Pill color={C.red}>Conflict</Pill>}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {session.time && (
            <div style={{ fontSize: 12, color: C.textSub }}>
              {"Time: " + session.time + (session.end ? " - " + session.end : "")}
            </div>
          )}
          {session.location && (
            <div
              onClick={function() { if (vKey) setVM(session.location); }}
              style={{ fontSize: 12, color: vKey ? C.accent : C.textSub, cursor: vKey ? "pointer" : "default" }}
            >
              {"Location: " + session.location + (vKey ? " >" : "")}
            </div>
          )}
        </div>
        {partner && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PipBlock label="Meeting Brief" prompt="Give me a meeting brief for this upcoming partner meeting. What should I know walking in?" role={role} customTitle={customTitle} context={partnerCtx} />
            <PipBlock label="Talking Points" prompt="Give me 3-4 specific talking points for this meeting." role={role} customTitle={customTitle} context={partnerCtx} />
            <PipBlock label="Risk Flag" prompt="Are there any risks or things I need to be careful about in this meeting?" role={role} customTitle={customTitle} context={partnerCtx} />
          </div>
        )}
        <div>
          <FL>Update Location</FL>
          <AddressSearch value={session.location || ""} onChange={function(v) { upd("location", v); }} placeholder="Search venue or address..." />
        </div>
        <div>
          <FL>Meeting Status</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["upcoming", "in-progress", "complete"].map(function(st) {
              return (
                <button
                  key={st}
                  onClick={function() { upd("status", st); }}
                  style={{
                    flex: 1, padding: "7px 4px", borderRadius: 20, cursor: "pointer",
                    fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                    background: session.status === st ? MS_COLORS[st] : C.bgDark,
                    color: session.status === st ? "#fff" : C.textMuted,
                    border: "1px solid " + (session.status === st ? MS_COLORS[st] : C.border),
                  }}
                >
                  {MS_LABELS[st]}
                </button>
              );
            })}
          </div>
        </div>
        {partner && (
          <div style={{ background: C.bgDark, border: "1px solid " + C.border, borderRadius: 10, padding: "13px 15px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              {"Partner - " + partner.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <FL>Revenue</FL>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{partner.revenue}</div>
              </div>
              <div>
                <FL>Status</FL>
                <Pill color={STATUS_COLORS[partner.status]}>{STATUS_LABELS[partner.status]}</Pill>
              </div>
            </div>
            {partner.objective && (
              <div style={{ marginBottom: 10 }}>
                <FL>Objective</FL>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>{partner.objective}</div>
              </div>
            )}
            {partner.openItems && partner.openItems.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <FL>Open Items</FL>
                <OpenItemsList
                  items={partner.openItems}
                  onToggle={function(id) {
                    props.onUpdateP(partner.id, "openItems", partner.openItems.map(function(x) {
                      return x.id === id ? Object.assign({}, x, { done: !x.done }) : x;
                    }));
                  }}
                />
              </div>
            )}
            {partner.attendees && partner.attendees.length > 0 && (
              <div>
                <FL>Their Team</FL>
                <AttendeeList attendees={partner.attendees} />
              </div>
            )}
          </div>
        )}
        <div style={{ borderTop: "1px solid " + C.border, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Meeting Notes
          </div>
          {[
            { f: "takeaways",      l: "Takeaways",       p: "Key things you learned..." },
            { f: "actionItems",    l: "Action Items",     p: "Who does what by when..." },
            { f: "commitmentsMade",l: "Commitments Made", p: "What did you promise them..." },
            { f: "followUpDate",   l: "Follow Up Date",   p: "When are you reconnecting..." },
          ].map(function(x) {
            return (
              <div key={x.f} style={{ marginBottom: 10 }}>
                <FL>{x.l}</FL>
                <textarea
                  value={session[x.f] || ""}
                  onChange={function(e) { upd(x.f, e.target.value); }}
                  placeholder={x.p}
                  style={ta}
                />
              </div>
            );
          })}
          {(session.takeaways || session.actionItems) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <PipBlock label="Clean Up Notes" prompt={"Clean up these notes. Takeaways: " + (session.takeaways || "none") + ". Actions: " + (session.actionItems || "none")} role={role} customTitle={customTitle} context={partnerCtx} />
              <PipBlock label="Draft Follow Up Email" prompt={"Draft a follow up email. Takeaways: " + (session.takeaways || "none") + ". Commitments: " + (session.commitmentsMade || "none")} role={role} customTitle={customTitle} context={partnerCtx} />
              <PipBlock label="Meeting Summary" prompt={"Write a one-paragraph meeting summary. Takeaways: " + (session.takeaways || "none")} role={role} customTitle={customTitle} context={partnerCtx} />
            </div>
          )}
          <div>
            <FL>Meeting Rating</FL>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map(function(n) {
                return (
                  <button
                    key={n}
                    onClick={function() { upd("rating", n); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: (session.rating || 0) >= n ? C.yellow : C.textMuted, padding: "2px" }}
                  >
                    *
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <SecBtn onClick={function() { props.onEdit(session); }} style={{ width: "100%", fontSize: 12 }}>
          Edit This Event
        </SecBtn>
      </div>
      {venueModal && <VenueModal locationName={venueModal} onClose={function() { setVM(null); }} />}
    </Modal>
  );
}

function EditSessionModal(props) {
  var session = props.session;
  const [d, setD] = useState(Object.assign({}, session));
  const [confirmDel, setConfirmDel] = useState(false);
  function sf(k, v) { setD(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title="Edit Event">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Title</FL>
          <input value={d.title || ""} onChange={function(e) { sf("title", e.target.value); }} style={inp} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FL>Start Time</FL>
            <input value={d.time || ""} onChange={function(e) { sf("time", e.target.value); }} placeholder="e.g. 9:00 AM" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <FL>End Time</FL>
            <input value={d.end || ""} onChange={function(e) { sf("end", e.target.value); }} placeholder="e.g. 10:00 AM" style={inp} />
          </div>
        </div>
        <div>
          <FL>Location</FL>
          <AddressSearch value={d.location || ""} onChange={function(v) { sf("location", v); }} placeholder="Search venue or address..." />
        </div>
        <div>
          <FL>Track</FL>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Partner Meeting", "Conference", "Meal/Reception", "Keynote", "Logistics", "Open Slot"].map(function(t) {
              return (
                <button
                  key={t}
                  onClick={function() { sf("track", t); }}
                  style={{ padding: "6px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: d.track === t ? (TRACK_COLORS[t] || C.accent) : C.bgDark, color: d.track === t ? "#fff" : C.textMuted, border: "1px solid " + (d.track === t ? (TRACK_COLORS[t] || C.accent) : C.border) }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Day</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {DAYS.map(function(day) {
              return (
                <button
                  key={day.key}
                  onClick={function() { sf("day", day.key); }}
                  style={{ flex: 1, padding: "7px 4px", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: d.day === day.key ? C.accent : C.bgDark, color: d.day === day.key ? "#fff" : C.textMuted, border: "1px solid " + (d.day === day.key ? C.accent : C.border) }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Notes</FL>
          <textarea value={d.notes || ""} onChange={function(e) { sf("notes", e.target.value); }} placeholder="Any notes..." style={ta} />
        </div>
        {confirmDel ? (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>Delete this event?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={function() { props.onSave(null); }} style={Object.assign({}, btnBase, { flex: 1, background: C.red, color: "#fff" })}>Yes, Delete</button>
              <button onClick={function() { setConfirmDel(false); }} style={Object.assign({}, btnBase, { flex: 1, background: C.bgDark, color: C.textSub, border: "1px solid " + C.border })}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <GreenBtn onClick={function() { props.onSave(d); }} style={{ flex: 1, padding: "12px", fontSize: 14, borderRadius: 24 }}>Save Changes</GreenBtn>
            <button onClick={function() { setConfirmDel(true); }} style={Object.assign({}, btnBase, { background: "rgba(248,113,113,0.1)", color: C.red, border: "1px solid rgba(248,113,113,0.2)", padding: "12px 16px" })}>Delete</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PartnerModal(props) {
  var partner = props.partner;
  function toggle(id) {
    props.onUpdate(partner.id, "openItems", partner.openItems.map(function(x) {
      return x.id === id ? Object.assign({}, x, { done: !x.done }) : x;
    }));
  }
  return (
    <Modal onClose={props.onClose} title={partner.name} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Pill color={TIER_COLORS[partner.tier]}>{partner.tier}</Pill>
          <Pill color={STATUS_COLORS[partner.status]}>{STATUS_LABELS[partner.status]}</Pill>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL>YTD Revenue</FL>
            <div style={{ fontSize: 20, fontWeight: 600, color: C.text }}>{partner.revenue}</div>
          </div>
          <div>
            <FL>Scheduled</FL>
            <div style={{ fontSize: 13, color: C.textSub }}>{partner.scheduledMeeting || "Not scheduled"}</div>
          </div>
        </div>
        <div>
          <FL>Account Status</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["green", "yellow", "red"].map(function(s) {
              return (
                <button
                  key={s}
                  onClick={function() { props.onUpdate(partner.id, "status", s); }}
                  style={{ flex: 1, padding: "7px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: partner.status === s ? STATUS_COLORS[s] : C.bgDark, color: partner.status === s ? "#fff" : C.textMuted, border: "1px solid " + (partner.status === s ? STATUS_COLORS[s] : C.border) }}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
        {partner.objective && (
          <div>
            <FL>Meeting Objective</FL>
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>{partner.objective}</div>
          </div>
        )}
        <div>
          <FL>Open Items</FL>
          <OpenItemsList items={partner.openItems} onToggle={toggle} />
        </div>
        {partner.pastNotes && (
          <div>
            <FL>Previous Conference Notes</FL>
            <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, background: C.bgDark, padding: "10px 12px", borderRadius: 8, fontStyle: "italic" }}>
              {partner.pastNotes}
            </div>
          </div>
        )}
        {partner.attendees && partner.attendees.length > 0 && (
          <div>
            <FL>Their Team</FL>
            <AttendeeList attendees={partner.attendees} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <GreenBtn onClick={function() { props.onSchedule(partner); }} style={{ flex: 1, borderRadius: 24, fontSize: 12 }}>Schedule Meeting</GreenBtn>
          <SecBtn onClick={function() { props.onEdit(partner); }} style={{ flex: 1, borderRadius: 24, fontSize: 12 }}>Edit</SecBtn>
        </div>
      </div>
    </Modal>
  );
}

function EditPartnerModal(props) {
  var partner = props.partner;
  const [d, setD] = useState(Object.assign({}, partner, {
    openItems: (partner.openItems || []).slice(),
    attendees: (partner.attendees || []).slice(),
  }));
  function sf(k, v) { setD(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title={"Edit - " + d.name} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { l: "Company Name", k: "name" },
          { l: "YTD Revenue", k: "revenue" },
          { l: "Meeting Objective", k: "objective" },
          { l: "Previous Conference Notes", k: "pastNotes" },
        ].map(function(f) {
          return (
            <div key={f.k}>
              <FL>{f.l}</FL>
              <input value={d[f.k] || ""} onChange={function(e) { sf(f.k, e.target.value); }} style={inp} />
            </div>
          );
        })}
        <div>
          <FL>Tier</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["Major", "Mid", "Growth"].map(function(t) {
              return (
                <button
                  key={t}
                  onClick={function() { sf("tier", t); }}
                  style={{ flex: 1, padding: "7px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: d.tier === t ? TIER_COLORS[t] : C.bgDark, color: d.tier === t ? "#fff" : C.textMuted, border: "1px solid " + (d.tier === t ? TIER_COLORS[t] : C.border) }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Status</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["green", "yellow", "red"].map(function(s) {
              return (
                <button
                  key={s}
                  onClick={function() { sf("status", s); }}
                  style={{ flex: 1, padding: "7px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: d.status === s ? STATUS_COLORS[s] : C.bgDark, color: d.status === s ? "#fff" : C.textMuted, border: "1px solid " + (d.status === s ? STATUS_COLORS[s] : C.border) }}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Open Items</FL>
          {d.openItems.map(function(oi, i) {
            return (
              <div key={oi.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input
                  value={oi.text}
                  onChange={function(e) {
                    setD(function(p) {
                      return Object.assign({}, p, {
                        openItems: p.openItems.map(function(x, j) {
                          return j === i ? Object.assign({}, x, { text: e.target.value }) : x;
                        }),
                      });
                    });
                  }}
                  style={Object.assign({}, inp, { flex: 1 })}
                />
                <button
                  onClick={function() {
                    setD(function(p) {
                      return Object.assign({}, p, {
                        openItems: p.openItems.filter(function(_, j) { return j !== i; }),
                      });
                    });
                  }}
                  style={{ background: "rgba(248,113,113,0.1)", color: C.red, border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
                >
                  x
                </button>
              </div>
            );
          })}
          <button
            onClick={function() {
              setD(function(p) {
                return Object.assign({}, p, {
                  openItems: p.openItems.concat([{ id: "oi" + Date.now(), text: "", done: false }]),
                });
              });
            }}
            style={{ background: C.bgDark, color: C.textMuted, border: "1px dashed " + C.border, borderRadius: 20, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", width: "100%", marginTop: 4 }}
          >
            + Add Item
          </button>
        </div>
        <GreenBtn onClick={function() { props.onSave(d); }} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          Save Changes
        </GreenBtn>
      </div>
    </Modal>
  );
}

function ScheduleMtgModal(props) {
  var partner = props.partner;
  const [f, setF] = useState({
    title: partner.name + " Meeting",
    time: "", end: "", location: "",
    day: "tue", type: "Partner Meeting", partnerId: partner.id,
  });
  function sf(k, v) { setF(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title={"Schedule - " + partner.name}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Start Time</FL>
          <input value={f.time} onChange={function(e) { sf("time", e.target.value); }} placeholder="e.g. 10:30 AM" style={inp} />
        </div>
        <div>
          <FL>End Time</FL>
          <input value={f.end} onChange={function(e) { sf("end", e.target.value); }} placeholder="e.g. 11:30 AM" style={inp} />
        </div>
        <div>
          <FL>Location</FL>
          <AddressSearch value={f.location} onChange={function(v) { sf("location", v); }} />
        </div>
        <div>
          <FL>Day</FL>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAYS.filter(function(d) { return d.key !== "thu"; }).map(function(d) {
              return (
                <button
                  key={d.key}
                  onClick={function() { sf("day", d.key); }}
                  style={{ padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: f.day === d.key ? C.accent : C.bgDark, color: f.day === d.key ? "#fff" : C.textMuted, border: "1px solid " + (f.day === d.key ? C.accent : C.border) }}
                >
                  {d.label + " " + d.date}
                </button>
              );
            })}
          </div>
        </div>
        {props.openSlots.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, marginBottom: 4 }}>Open slots:</div>
            {props.openSlots.map(function(s) {
              var dd = DAYS.find(function(d) { return d.key === s.day; }) || { label: "" };
              return (
                <div key={s.id} style={{ fontSize: 11, color: C.purple }}>
                  {dd.label + " " + s.time + " - " + s.end}
                </div>
              );
            })}
          </div>
        )}
        <GreenBtn onClick={function() { props.onAdd(f); }} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          Add to Schedule
        </GreenBtn>
      </div>
    </Modal>
  );
}

function AddEventModal(props) {
  const [f, setF] = useState({ title: "", time: "", end: "", location: "", day: "tue", type: "Partner Meeting", partnerId: "" });
  function sf(k, v) { setF(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title="Add Event">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Type</FL>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Partner Meeting", "Conference", "Meal/Reception", "Keynote", "Other"].map(function(t) {
              return (
                <button
                  key={t}
                  onClick={function() { sf("type", t); }}
                  style={{ padding: "6px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: f.type === t ? (TRACK_COLORS[t] || C.accent) : C.bgDark, color: f.type === t ? "#fff" : C.textMuted, border: "1px solid " + (f.type === t ? (TRACK_COLORS[t] || C.accent) : C.border) }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Title</FL>
          <input value={f.title} onChange={function(e) { sf("title", e.target.value); }} placeholder="Event name" style={inp} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FL>Start Time</FL>
            <input value={f.time} onChange={function(e) { sf("time", e.target.value); }} placeholder="e.g. 10:30 AM" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <FL>End Time</FL>
            <input value={f.end} onChange={function(e) { sf("end", e.target.value); }} placeholder="e.g. 11:30 AM" style={inp} />
          </div>
        </div>
        <div>
          <FL>Location</FL>
          <AddressSearch value={f.location} onChange={function(v) { sf("location", v); }} />
        </div>
        {f.type === "Partner Meeting" && (
          <div>
            <FL>Partner</FL>
            <select value={f.partnerId} onChange={function(e) { sf("partnerId", e.target.value); }} style={inp}>
              <option value="">Select...</option>
              {props.partners.map(function(p) {
                return <option key={p.id} value={p.id}>{p.name}</option>;
              })}
            </select>
          </div>
        )}
        <div>
          <FL>Day</FL>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAYS.filter(function(d) { return d.key !== "thu"; }).map(function(d) {
              return (
                <button
                  key={d.key}
                  onClick={function() { sf("day", d.key); }}
                  style={{ padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: f.day === d.key ? C.accent : C.bgDark, color: f.day === d.key ? "#fff" : C.textMuted, border: "1px solid " + (f.day === d.key ? C.accent : C.border) }}
                >
                  {d.label + " " + d.date}
                </button>
              );
            })}
          </div>
        </div>
        <GreenBtn onClick={function() { props.onAdd(f); }} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          Add to Schedule
        </GreenBtn>
      </div>
    </Modal>
  );
}

function AddPartnerModal(props) {
  const [f, setF] = useState({ name: "", revenue: "", tier: "Mid", status: "green", objective: "" });
  function sf(k, v) { setF(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title="Add Partner">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Company Name</FL>
          <input value={f.name} onChange={function(e) { sf("name", e.target.value); }} placeholder="e.g. Acme Parts" style={inp} />
        </div>
        <div>
          <FL>YTD Revenue</FL>
          <input value={f.revenue} onChange={function(e) { sf("revenue", e.target.value); }} placeholder="e.g. $5M" style={inp} />
        </div>
        <div>
          <FL>Meeting Objective</FL>
          <input value={f.objective} onChange={function(e) { sf("objective", e.target.value); }} placeholder="Goal of this meeting" style={inp} />
        </div>
        <div>
          <FL>Tier</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["Major", "Mid", "Growth"].map(function(t) {
              return (
                <button
                  key={t}
                  onClick={function() { sf("tier", t); }}
                  style={{ flex: 1, padding: "7px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: f.tier === t ? TIER_COLORS[t] : C.bgDark, color: f.tier === t ? "#fff" : C.textMuted, border: "1px solid " + (f.tier === t ? TIER_COLORS[t] : C.border) }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FL>Status</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {["green", "yellow", "red"].map(function(s) {
              return (
                <button
                  key={s}
                  onClick={function() { sf("status", s); }}
                  style={{ flex: 1, padding: "7px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: f.status === s ? STATUS_COLORS[s] : C.bgDark, color: f.status === s ? "#fff" : C.textMuted, border: "1px solid " + (f.status === s ? STATUS_COLORS[s] : C.border) }}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
        <GreenBtn onClick={function() { props.onAdd(f); }} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          Add Partner
        </GreenBtn>
      </div>
    </Modal>
  );
}

function QuickNotesModal(props) {
  return (
    <Modal onClose={props.onClose} title="Quick Notes">
      <textarea
        value={props.notes}
        onChange={function(e) { props.onChange(e.target.value); }}
        placeholder="Jot anything down..."
        style={Object.assign({}, ta, { minHeight: 160, fontSize: 14 })}
      />
      <GreenBtn onClick={props.onClose} style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24, marginTop: 8 }}>
        Save and Close
      </GreenBtn>
    </Modal>
  );
}

function HotelModal(props) {
  const [d, setD] = useState(Object.assign({}, props.hotel));
  function sf(k, v) { setD(function(p) { return Object.assign({}, p, { [k]: v }); }); }
  return (
    <Modal onClose={props.onClose} title="Hotel Info">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { l: "Hotel Name",    k: "name" },
          { l: "Phone",         k: "phone" },
          { l: "Check-in",      k: "checkIn" },
          { l: "Check-out",     k: "checkOut" },
          { l: "My Room Number",k: "roomNumber" },
        ].map(function(x) {
          return (
            <div key={x.k}>
              <FL>{x.l}</FL>
              <input value={d[x.k] || ""} onChange={function(e) { sf(x.k, e.target.value); }} style={inp} />
            </div>
          );
        })}
        <div>
          <FL>Address</FL>
          <AddressSearch value={d.address || ""} onChange={function(v) { sf("address", v); }} placeholder="Search hotel..." />
        </div>
        <GreenBtn
          onClick={function() { props.onChange(d); props.onClose(); }}
          style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24 }}
        >
          Save
        </GreenBtn>
      </div>
    </Modal>
  );
}

function ExportModal(props) {
  var pm = props.sessions.filter(function(s) { return s.track === "Partner Meeting" && !s.isChild; });
  var lines = pm.map(function(s) {
    var parts = ["-- " + s.title + " (" + (s.day || "").toUpperCase() + " " + s.time + ")"];
    if (s.takeaways) parts.push("   Takeaways: " + s.takeaways);
    if (s.actionItems) parts.push("   Actions: " + s.actionItems);
    if (s.commitmentsMade) parts.push("   Commitments: " + s.commitmentsMade);
    if (s.followUpDate) parts.push("   Follow Up: " + s.followUpDate);
    if (s.rating > 0) parts.push("   Rating: " + s.rating + "/5");
    return parts.join("\n");
  }).join("\n\n");
  var divider = "====================================================";
  var summary = "ABPA ANNUAL CONFERENCE 2026 - POST CONFERENCE SUMMARY\n" + divider + "\n\n" + (lines || "No partner meetings recorded yet.") + "\n\n" + divider + "\nGenerated by Lanyard";
  return (
    <Modal onClose={props.onClose} title="Post-Conference Export" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea readOnly value={summary} style={Object.assign({}, ta, { minHeight: 260, fontSize: 11, fontFamily: "monospace", color: C.textSub })} />
        <GreenBtn
          onClick={function() { try { navigator.clipboard.writeText(summary); } catch (e) {} }}
          style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24 }}
        >
          Copy to Clipboard
        </GreenBtn>
      </div>
    </Modal>
  );
}

function ShareModal(props) {
  const [code, setCode] = useState("");
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enterMode, setEnterMode] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [err, setErr] = useState("");
  function generate() {
    setLoading(true);
    var c = Math.random().toString(36).slice(2, 8).toUpperCase();
    sbSaveShareCode(c, { sessions: props.sessions, partners: props.partners, hotel: props.hotel }, function(e) {
      if (e) { setErr("Could not generate code. Try again."); }
      else { setCode(c); setGenerated(true); }
      setLoading(false);
    });
  }
  function loadCode() {
    if (!inputCode.trim()) return;
    setLoadingCode(true);
    setErr("");
    sbLoadShareCode(inputCode.trim().toUpperCase(), function(e, data) {
      if (e || !data) { setErr("Code not found. Check and try again."); setLoadingCode(false); return; }
      try { localStorage.setItem("lanyard_share_import", JSON.stringify(data)); } catch (ex) {}
      alert("Code accepted! Reload the app to see the shared schedule.");
      props.onClose();
    });
  }
  if (!enterMode) {
    return (
      <Modal onClose={props.onClose} title="Share with Team">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PipMark size={14} color={C.accent} glow />
          </div>
          <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 1.7 }}>
            Generate a code to share your schedule with your team.
          </div>
          {!generated ? (
            <GreenBtn onClick={generate} disabled={loading} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
              {loading ? "Generating..." : "Generate Share Code"}
            </GreenBtn>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.accent, letterSpacing: "0.2em", fontFamily: "monospace", marginBottom: 8 }}>{code}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Share this code with your teammates</div>
              <button
                onClick={function() { try { navigator.clipboard.writeText(code); } catch (e) {} }}
                style={Object.assign({}, btnBase, { background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border })}
              >
                Copy Code
              </button>
            </div>
          )}
          {err && <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>{err}</div>}
          <button
            onClick={function() { setEnterMode(true); }}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", textAlign: "center" }}
          >
            I have a code - Enter it here
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={function() { setEnterMode(false); }} title="Enter Share Code">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={inputCode}
          onChange={function(e) { setInputCode(e.target.value.toUpperCase()); }}
          placeholder="Enter code e.g. ABC123"
          style={Object.assign({}, inp, { textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: "0.2em", fontFamily: "monospace" })}
        />
        {err && <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>{err}</div>}
        <GreenBtn onClick={loadCode} disabled={loadingCode || !inputCode.trim()} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          {loadingCode ? "Loading..." : "Load Schedule"}
        </GreenBtn>
        <button
          onClick={function() { setEnterMode(false); }}
          style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", textAlign: "center" }}
        >
          Back
        </button>
      </div>
    </Modal>
  );
}
function PipChatModal(props) {
  var role = props.role;
  var customTitle = props.customTitle;
  var sessions = props.sessions;
  var partners = props.partners;
  var now = props.now;
  const [msgs, setMsgs] = useState([
    { sender: "assistant", content: "Hi! I'm Pip. Ask me anything about your schedule, partners, or today's meetings." },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(function() {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  function send() {
    if (!inputVal.trim() || loading) return;
    var userMsg = { sender: "user", content: inputVal };
    setMsgs(function(p) { return p.concat([userMsg]); });
    setInputVal("");
    setLoading(true);
    var todayKey = getConferenceDayKey(now) || "tue";
    var dayInfo = DAYS.find(function(d) { return d.key === todayKey; }) || { full: "conference day" };
    var todaySess = sessions.filter(function(s) {
      return s.day === todayKey && !s.isChild;
    }).sort(function(a, b) {
      return parseTime(a.time) - parseTime(b.time);
    });
    var ctx = "Today: " + dayInfo.full + ". Schedule: " +
      todaySess.map(function(s) { return s.title + " at " + s.time; }).join(", ") +
      ". Partners: " +
      partners.map(function(p) { return p.name + " (" + p.revenue + ", " + STATUS_LABELS[p.status] + ")"; }).join(", ") + ".";
    var history = msgs.concat([userMsg]).map(function(m) {
      return { role: m.sender === "user" ? "user" : "assistant", content: m.content };
    });
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system: getRoleCtx(role, customTitle) + "\n\nContext: " + ctx,
        messages: history,
      }),
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      var t = data.content && data.content[0] && data.content[0].text;
      setMsgs(function(p) { return p.concat([{ sender: "assistant", content: t || "I couldn't respond right now." }]); });
    }).catch(function() {
      setMsgs(function(p) { return p.concat([{ sender: "assistant", content: "Something went wrong. Try again." }]); });
    }).finally(function() { setLoading(false); });
  }
  return (
    <Modal onClose={props.onClose} title="">
      <div style={{ display: "flex", flexDirection: "column", height: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid " + C.border }}>
          <PipMark size={16} color={C.accent} glow pulse={loading} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Pip</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Your AI conference assistant</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          {msgs.map(function(m, i) {
            return (
              <div key={i} style={{ display: "flex", justifyContent: m.sender === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%",
                  background: m.sender === "user" ? C.accent : C.bgCardAlt,
                  color: m.sender === "user" ? "#fff" : C.text,
                  padding: "10px 14px",
                  borderRadius: m.sender === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}>
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ background: C.bgCardAlt, padding: "10px 14px", borderRadius: "18px 18px 18px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                <PipMark size={8} color={C.accent} glow pulse />
                <span style={{ fontSize: 12, color: C.textMuted }}>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={inputVal}
            onChange={function(e) { setInputVal(e.target.value); }}
            onKeyDown={function(e) { if (e.key === "Enter") send(); }}
            placeholder="Ask Pip anything..."
            style={Object.assign({}, inp, { flex: 1 })}
          />
          <GreenBtn onClick={send} disabled={loading || !inputVal.trim()} style={{ padding: "9px 16px", fontSize: 13 }}>
            Send
          </GreenBtn>
        </div>
      </div>
    </Modal>
  );
}

function DailyBriefingModal(props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  var todayKey = getConferenceDayKey(props.now) || "tue";
  var dayInfo = DAYS.find(function(d) { return d.key === todayKey; }) || { full: "Today" };
  useEffect(function() {
    setLoading(true);
    var pMap = {};
    props.partners.forEach(function(p) { pMap[p.id] = p; });
    var todaySess = props.sessions.filter(function(s) {
      return s.day === todayKey && !s.isChild && s.track !== "Open Slot";
    }).sort(function(a, b) { return parseTime(a.time) - parseTime(b.time); });
    var ctx = "Today is " + dayInfo.full + ". Schedule: " + todaySess.map(function(s) {
      var p = s.partnerId ? pMap[s.partnerId] : null;
      return s.title + " at " + s.time + (p ? " (" + p.name + ", " + p.revenue + ", " + STATUS_LABELS[p.status] + ")" : "");
    }).join("; ") + ".";
    askPip("Generate a morning briefing for today. Be encouraging and highlight what matters.", props.role, props.customTitle, ctx, function(err, result) {
      setText(result);
      setLoading(false);
    });
  }, []);
  return (
    <Modal onClose={props.onClose} title="">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "1px solid " + C.border }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PipMark size={20} color={C.accent} glow pulse={loading} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>Good Morning</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{dayInfo.full}</div>
        </div>
        {loading
          ? <div style={{ textAlign: "center", padding: "20px", color: C.textMuted, fontSize: 13 }}>Pip is preparing your briefing...</div>
          : <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</div>
        }
        <GreenBtn onClick={props.onClose} style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24 }}>
          {"Let's go"}
        </GreenBtn>
      </div>
    </Modal>
  );
}

function DebriefModal(props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(function() {
    setLoading(true);
    var pMap = {};
    props.partners.forEach(function(p) { pMap[p.id] = p; });
    var meetings = props.sessions.filter(function(s) { return s.track === "Partner Meeting" && !s.isChild; });
    var ctx = meetings.map(function(s) {
      var p = s.partnerId ? pMap[s.partnerId] : null;
      var parts = [s.title + " (" + s.day + " " + s.time + ")"];
      if (p) parts.push("Partner: " + p.name + ", Revenue: " + p.revenue + ", Status: " + STATUS_LABELS[p.status]);
      if (s.takeaways) parts.push("Takeaways: " + s.takeaways);
      if (s.actionItems) parts.push("Actions: " + s.actionItems);
      if (s.rating > 0) parts.push("Rating: " + s.rating + "/5");
      return parts.join(". ");
    }).join("\n\n");
    askPip("Generate a comprehensive post-conference debrief. Highlight wins, at-risk relationships, and action items.", props.role, props.customTitle, ctx, function(err, result) {
      setText(result);
      setLoading(false);
    });
  }, []);
  return (
    <Modal onClose={props.onClose} title="" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "1px solid " + C.border }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PipMark size={20} color={C.accent} glow pulse={loading} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>Conference Debrief</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>Powered by Pip</div>
        </div>
        {loading
          ? <div style={{ textAlign: "center", padding: "20px", color: C.textMuted }}>Pip is analyzing your conference...</div>
          : <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</div>
        }
        <GreenBtn onClick={props.onClose} style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24 }}>Done</GreenBtn>
      </div>
    </Modal>
  );
}

function RelHealthModal(props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(function() {
    setLoading(true);
    var ctx = props.partners.map(function(p) {
      var open = p.openItems.filter(function(o) { return !o.done; }).length;
      return p.name + ": Revenue " + p.revenue + ", Status " + STATUS_LABELS[p.status] + ", Tier " + p.tier +
        (open > 0 ? ", " + open + " unresolved items" : "") +
        (p.pastNotes ? ", Notes: " + p.pastNotes.slice(0, 80) : "");
    }).join("\n");
    askPip("Analyze these partner relationships. Which need the most attention? What should I prioritize?", props.role, props.customTitle, ctx, function(err, result) {
      setText(result);
      setLoading(false);
    });
  }, []);
  return (
    <Modal onClose={props.onClose} title="" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "1px solid " + C.border }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PipMark size={20} color={C.accent} glow pulse={loading} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>Relationship Health</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{"Pip's analysis"}</div>
        </div>
        {loading
          ? <div style={{ textAlign: "center", padding: "20px", color: C.textMuted }}>Analyzing...</div>
          : <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{text}</div>
        }
        <GreenBtn onClick={props.onClose} style={{ width: "100%", padding: "11px", fontSize: 13, borderRadius: 24 }}>Done</GreenBtn>
      </div>
    </Modal>
  );
}

function PipDayModal(props) {
  var pMap = {};
  props.partners.forEach(function(p) { pMap[p.id] = p; });
  var todayKey = getConferenceDayKey(props.now) || "tue";
  var dayInfo = DAYS.find(function(d) { return d.key === todayKey; }) || { full: "" };
  var todaySess = props.sessions.filter(function(s) {
    return s.day === todayKey && !s.isChild && s.track !== "Open Slot" && s.track !== "Logistics";
  }).sort(function(a, b) { return parseTime(a.time) - parseTime(b.time); });
  var upcoming = todaySess.filter(function(s) { return s.status !== "complete"; });
  var partnerCount = todaySess.filter(function(s) { return s.track === "Partner Meeting"; }).length;
  return (
    <Modal onClose={props.onClose} title="" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid " + C.border }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PipMark size={22} color={C.accent} glow pulse />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>{"Pip's Day Overview"}</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{dayInfo.full}</div>
        </div>
        <div style={{ background: C.bgDark, border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
            {"You have "}
            <span style={{ color: C.text, fontWeight: 500 }}>{todaySess.length + " events"}</span>
            {" today including "}
            <span style={{ color: C.accentOrange, fontWeight: 500 }}>{partnerCount + " partner meetings"}</span>
            {"."}
            {upcoming.length > 0 && (
              <span>
                {" Next up: "}
                <span style={{ color: C.text, fontWeight: 500 }}>{upcoming[0].title}</span>
                {" at "}
                <span style={{ color: C.accent }}>{upcoming[0].time}</span>
                {"."}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {todaySess.map(function(s) {
            var color = TRACK_COLORS[s.track] || C.accent;
            var p = s.partnerId ? pMap[s.partnerId] : null;
            var openCount = p ? p.openItems.filter(function(o) { return !o.done; }).length : 0;
            return (
              <div
                key={s.id}
                onClick={function() { props.onSelectS(s); props.onClose(); }}
                style={{ background: C.bgDark, border: "1px solid " + C.border, borderLeft: "3px solid " + color, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  {s.time + (s.end ? " - " + s.end : "") + (s.location ? " | " + s.location : "")}
                </div>
                {p && (
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>
                    {p.revenue + " | " + (p.attendees.filter(function(a) { return a.poc; }).map(function(a) { return a.name; }).join(", ") || "No POC set")}
                  </div>
                )}
                {openCount > 0 && (
                  <div style={{ fontSize: 10, color: C.accentOrange, marginTop: 3 }}>
                    {openCount + " open item" + (openCount > 1 ? "s" : "")}
                  </div>
                )}
              </div>
            );
          })}
          {todaySess.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px", color: C.textMuted, fontSize: 13 }}>
              No events scheduled for today
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AIImportModal(props) {
  const [mode, setMode] = useState(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  function runImport() {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setErrMsg("");
    var prompt = "Extract all conference sessions from this text. Return ONLY a JSON array. Each object must have: title, day (use Day 1, Day 2, Day 3), time (like 9:00 AM), end (like 10:00 AM), location, track (one of: Conference, Partner Meeting, Meal/Reception, Keynote, Logistics, Open Slot). Return ONLY the JSON array.\n\n" + inputText.slice(0, 3000);
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      var text = data.content && data.content[0] && data.content[0].text || "";
      var parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        props.onImport(parsed);
      } else {
        setErrMsg("Couldn't find events. Try pasting more.");
      }
    }).catch(function() {
      setErrMsg("Something went wrong. Try plain text.");
    }).finally(function() { setIsLoading(false); });
  }
  if (!mode) {
    return (
      <Modal onClose={props.onClose} title="Import Your Schedule">
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <PipMark size={16} color={C.accent} glow pulse />
          </div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
            Pip will read your schedule and load all events automatically.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { id: "paste", label: "Paste your schedule",  desc: "Copy from email, Word, or anywhere" },
            { id: "url",   label: "Drop in a URL",         desc: "Paste a link to your agenda" },
          ].map(function(opt) {
            return (
              <button
                key={opt.id}
                onClick={function() { setMode(opt.id); }}
                style={{ background: C.bgCardAlt, border: "1px solid " + C.border, borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{opt.desc}</div>
              </button>
            );
          })}
          <button
            onClick={props.onClose}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", padding: "8px" }}
          >
            {"I'll build it manually"}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={function() { setMode(null); }} title={mode === "url" ? "Conference URL" : "Paste Schedule"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PipMark size={14} color={C.accent} glow pulse />
        </div>
        {mode === "url"
          ? <input value={inputText} onChange={function(e) { setInputText(e.target.value); }} placeholder="https://conference.com/agenda" style={inp} />
          : <textarea value={inputText} onChange={function(e) { setInputText(e.target.value); }} placeholder="Paste your schedule here..." style={Object.assign({}, ta, { minHeight: 180 })} />
        }
        {errMsg && (
          <div style={{ fontSize: 12, color: C.red, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 12px" }}>
            {errMsg}
          </div>
        )}
        <GreenBtn onClick={runImport} disabled={isLoading} style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 24 }}>
          {isLoading ? "Pip is reading..." : "Let Pip Read It"}
        </GreenBtn>
        <button onClick={function() { setMode(null); }} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
          Back
        </button>
      </div>
    </Modal>
  );
}

function SessionPickerModal(props) {
  var importedSessions = props.importedSessions;
  const [sel, setSel] = useState(function() {
    return new Set(importedSessions.map(function(_, i) { return i; }));
  });
  function toggle(i) {
    setSel(function(p) {
      var n = new Set(p);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }
  return (
    <Modal onClose={props.onClose} title="Build Your Agenda" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PipMark size={14} color={C.accent} glow />
        </div>
        <div style={{ fontSize: 12, color: C.textSub, textAlign: "center", lineHeight: 1.7 }}>
          {"Pip found " + importedSessions.length + " events. Tap what you want to attend."}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={function() { setSel(new Set(importedSessions.map(function(_, i) { return i; }))); }}
            style={{ background: C.bgDark, color: C.textSub, border: "1px solid " + C.border, borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}
          >
            Select All
          </button>
          <button
            onClick={function() { setSel(new Set()); }}
            style={{ background: C.bgDark, color: C.textMuted, border: "1px solid " + C.border, borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}
          >
            Clear
          </button>
          <span style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center" }}>
            {sel.size + " selected"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {importedSessions.map(function(s, i) {
            var color = TRACK_COLORS[s.track] || C.accent;
            var isSelected = sel.has(i);
            return (
              <div
                key={i}
                onClick={function() { toggle(i); }}
                style={{ background: isSelected ? "rgba(" + toRgb(color) + ",0.1)" : C.bgDark, border: "1px solid " + (isSelected ? color + "40" : C.border), borderLeft: "3px solid " + (isSelected ? color : "transparent"), borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid " + (isSelected ? color : C.textMuted), background: isSelected ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isSelected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? C.text : C.textSub, marginBottom: 3, lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.time && <span style={{ fontSize: 10, color: C.textMuted }}>{s.time}</span>}
                    {s.location && <span style={{ fontSize: 10, color: C.textMuted }}>{s.location}</span>}
                    <Pill color={color}>{s.track}</Pill>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <GreenBtn
          onClick={function() { props.onConfirm(importedSessions.filter(function(_, i) { return sel.has(i); })); }}
          style={{ width: "100%", padding: "13px", fontSize: 14, borderRadius: 24 }}
        >
          {"Build My Agenda (" + sel.size + " events)"}
        </GreenBtn>
      </div>
    </Modal>
  );
}
function InviteWelcome(props) {
  var name = props.name || "there";
  var role = props.role || "am";
  var roleDesc = role === "vp" ? "VP" : role === "dir" ? "Director" : "Account Manager";
  const [step, setStep] = useState(0);
  const [pipText, setPipText] = useState("");
  const [loading, setLoading] = useState(false);
  var STEPS = [
    { label: "Welcome",  prompt: "Give a warm 2-sentence personal welcome to " + name + " who is a " + roleDesc + " about to use a conference app called Lanyard built by Chris Vasconcellos for ABPA 2026. Be personal and excited." },
    { label: "Schedule", prompt: "In 2 sentences tell " + name + " (a " + roleDesc + ") what to expect from the ABPA 2026 schedule. May 18-21 Indian Wells. Partner meetings, keynotes, networking all pre-loaded." },
    { label: "Partners", prompt: "In 2 sentences explain to " + name + " why having partner context before meetings matters. Mention LKQ at $222M is the top account with open items needing attention." },
    { label: "Pip",      prompt: "In 2 sentences tell " + name + " how Pip will help them. Be specific about their role - " + (role === "vp" ? "short executive summaries" : role === "dir" ? "strategic context" : "full operational detail") + "." },
    { label: "Go",       prompt: null },
  ];
  var titles = ["Hey " + name, "Your Schedule", "Key Partners", "I've Got You Covered", "You're All Set"];
  var bodies = [
    "Chris set this up for you. I'm Pip, your AI conference assistant for ABPA 2026 in Indian Wells.",
    "The full conference is loaded - every session, every partner meeting, every dinner. May 18-21.",
    "All 9 partner profiles are ready - revenue, open items, who you're meeting, and what matters going in.",
    "Tap any meeting and ask me for a brief, talking points, or a risk flag. I know your role.",
    "Everything Chris built is here for you. Let's make this conference count.",
  ];
  var current = STEPS[step];
  useEffect(function() {
    if (current.prompt && !pipText) {
      setLoading(true);
      askPip(current.prompt, role, "", "", function(err, result) {
        setPipText(result);
        setLoading(false);
      });
    }
  }, [step]);
  function next() {
    if (step < STEPS.length - 1) {
      setPipText("");
      setStep(function(s) { return s + 1; });
    } else {
      props.onDone();
    }
  }
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 400, margin: "0 auto", width: "100%", padding: "60px 32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <PipMark size={28} color={C.accent} glow pulse />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            {"Pip - " + current.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: C.text, marginBottom: 16, lineHeight: 1.2 }}>
            {titles[step]}
          </div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, marginBottom: 24 }}>
            {bodies[step]}
          </div>
          {current.prompt && (
            <div style={{ background: "rgba(74,155,130,0.08)", border: "1px solid rgba(74,155,130,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: loading ? 0 : 10 }}>
                <PipMark size={10} color={C.accent} glow pulse={loading} />
                <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pip says</div>
              </div>
              {loading
                ? <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Thinking...</div>
                : <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8 }}>{pipText}</div>
              }
            </div>
          )}
          {step === STEPS.length - 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
              {[
                { l: "Partner Meetings", v: "9",      c: C.accentOrange },
                { l: "Conference Days",  v: "4",      c: C.accent },
                { l: "Sessions Loaded", v: "21",      c: C.blue },
                { l: "Your Role",       v: roleDesc,  c: C.purple },
              ].map(function(s) {
                return (
                  <div key={s.l} style={{ background: C.bgCard, border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: s.v.length > 4 ? 13 : 20, fontWeight: 600, color: s.c, marginBottom: 3 }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{s.l}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 24 }}>
            {STEPS.map(function(_, i) {
              return (
                <div
                  key={i}
                  style={{ width: i === step ? 24 : 6, height: 6, borderRadius: 3, background: i === step ? C.accent : i < step ? C.accentDim : C.bgPillActive, transition: "all 0.2s" }}
                />
              );
            })}
          </div>
          <GreenBtn onClick={next} disabled={loading} style={{ width: "100%", padding: "14px", fontSize: 15, borderRadius: 24 }}>
            {step === STEPS.length - 1 ? "Open Lanyard" : "Next"}
          </GreenBtn>
        </div>
      </div>
      <style>{".pip-pulse{animation:pipPulse 2s ease-in-out infinite}@keyframes pipPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.92)}}"}</style>
    </div>
  );
}

function RoleModal(props) {
  const [selected, setSelected] = useState("am");
  const [customTitle, setCustomTitle] = useState("");
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <PipMark size={24} color={C.accent} glow pulse />
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8 }}>One quick thing</div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 28, lineHeight: 1.7 }}>
          {"What's your role? Pip will tailor everything to you."}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {ROLES.map(function(r) {
            return (
              <button
                key={r.id}
                onClick={function() { setSelected(r.id); }}
                style={{ background: selected === r.id ? C.bgPillActive : C.bgCard, border: "1px solid " + (selected === r.id ? C.accent : C.border), borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: selected === r.id ? C.text : C.textSub, marginBottom: 3 }}>{r.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{r.desc}</div>
              </button>
            );
          })}
        </div>
        {selected === "custom" && (
          <input
            value={customTitle}
            onChange={function(e) { setCustomTitle(e.target.value); }}
            placeholder="Enter your title..."
            style={Object.assign({}, inp, { marginBottom: 16, textAlign: "center" })}
          />
        )}
        <GreenBtn onClick={function() { props.onSave(selected, customTitle); }} style={{ width: "100%", padding: "13px", fontSize: 15, borderRadius: 24 }}>
          {"Set Up Pip"}
        </GreenBtn>
      </div>
    </div>
  );
}

function Onboarding(props) {
  const [step, setStep] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [imported, setImported] = useState(null);
  var totalSteps = 4;
  if (imported) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <SessionPickerModal
          importedSessions={imported}
          onConfirm={function(sel) { props.onImport(sel); props.onDone(); }}
          onClose={function() { setImported(null); }}
        />
      </div>
    );
  }
  if (showImport) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <AIImportModal
          onClose={function() { setShowImport(false); }}
          onImport={function(s) { setImported(s); setShowImport(false); }}
        />
      </div>
    );
  }
  function renderStep() {
    if (step === 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "0 32px" }}>
          <div style={{ marginBottom: 28 }}><LanyardLogo size={72} color={C.accent} /></div>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.text, letterSpacing: "-0.5px", marginBottom: 12 }}>LANYARD</div>
          <div style={{ fontSize: 15, color: C.textSub, fontWeight: 300, letterSpacing: "0.04em" }}>Your conference. Fully loaded.</div>
        </div>
      );
    }
    if (step === 1) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "0 32px" }}>
          <div style={{ marginBottom: 28, position: "relative" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 100, height: 100, borderRadius: "50%", background: "rgba(74,155,130,0.06)", animation: "pipRing 2.5s ease-in-out infinite" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center" }}>
              <PipMark size={32} color={C.accent} glow pulse />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 12 }}>Meet Pip</div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, maxWidth: 280 }}>
            {"Hi, I'm Pip - your AI conference assistant. I'll help you prep for meetings, take notes, and keep you one step ahead."}
          </div>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "0 32px" }}>
          <div style={{ marginBottom: 20 }}><PipMark size={18} color={C.accent} glow /></div>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 16, lineHeight: 1.3 }}>Everything before you walk in the room</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}>
            {[
              { icon: "📋", text: "Full conference schedule in one place" },
              { icon: "🤝", text: "Partner profiles with revenue and open items" },
              { icon: "📝", text: "Meeting notes, action items, follow ups" },
              { icon: "✨", text: "Powered by Pip" },
            ].map(function(item) {
              return (
                <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12, background: C.bgCard, border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px", textAlign: "left" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.4 }}>{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "0 32px" }}>
        <div style={{ marginBottom: 16 }}><PipMark size={18} color={C.accent} glow /></div>
        <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 8 }}>Load your schedule</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.7 }}>Pip reads any format automatically</div>
        <GreenBtn onClick={function() { setShowImport(true); }} style={{ padding: "12px 32px", fontSize: 14, marginBottom: 12 }}>
          Import with Pip
        </GreenBtn>
        <button
          onClick={props.onDone}
          style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}
        >
          {"Skip - add manually"}
        </button>
      </div>
    );
  }
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 400, margin: "0 auto", width: "100%", paddingTop: 60, paddingBottom: 40 }}>
        {renderStep()}
        <div style={{ padding: "0 32px" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
            {Array.from({ length: totalSteps }).map(function(_, i) {
              return (
                <div
                  key={i}
                  style={{ width: i === step ? 24 : 6, height: 6, borderRadius: 3, background: i === step ? C.accent : C.bgPillActive, transition: "all 0.2s" }}
                />
              );
            })}
          </div>
          {step < totalSteps - 1 && step !== 3 && (
            <GreenBtn onClick={function() { setStep(function(s) { return s + 1; }); }} style={{ width: "100%", padding: "13px", fontSize: 15, borderRadius: 24 }}>
              Continue
            </GreenBtn>
          )}
          {step > 0 && (
            <button
              onClick={function() { setStep(function(s) { return s - 1; }); }}
              style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif", display: "block", width: "100%", marginTop: 12, textAlign: "center" }}
            >
              Back
            </button>
          )}
          {step === 0 && (
            <button
              onClick={props.onDone}
              style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", display: "block", width: "100%", marginTop: 12, textAlign: "center" }}
            >
              Skip intro
            </button>
          )}
        </div>
      </div>
      <style>{".pip-pulse{animation:pipPulse 2s ease-in-out infinite}@keyframes pipPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.92)}}@keyframes pipRing{0%,100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.2;transform:translate(-50%,-50%) scale(1.15)}}"}</style>
    </div>
  );
}
// ---- VIEWS ----
function HomeView(props) {
  var sessions = props.sessions;
  var partners = props.partners;
  var now = props.now;
  var hotel = props.hotel;
  var weather = props.weather;
  var timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  var dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  var todayKey = getConferenceDayKey(now) || "tue";
  var nextUp = sessions.find(function(s) {
    return !s.isChild && s.time && ["Partner Meeting","Conference","Meal/Reception"].includes(s.track) && s.day === todayKey && s.status === "upcoming";
  });
  return (
    <div>
      <Card style={{ padding: "14px 16px", marginBottom: 10, background: C.bgCardAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 300, color: C.text, letterSpacing: "-0.5px" }}>{timeStr}</div>
            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{dateStr}</div>
          </div>
          {weather ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>{getWeatherEmoji(weather.code)}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>{weather.temp + "°F"}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{getWeatherDesc(weather.code)}</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>Indian Wells</div>
            </div>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.accent }}>May 18-21</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Indian Wells, CA</div>
            </div>
          )}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          { l: "Meetings", v: sessions.filter(function(s) { return s.track === "Partner Meeting"; }).length, c: C.accentOrange },
          { l: "Partners", v: partners.length, c: C.accent },
          { l: "Pending",  v: partners.filter(function(p) { return p.unscheduled; }).length, c: C.yellow },
          { l: "At Risk",  v: partners.filter(function(p) { return p.status === "red"; }).length, c: C.red },
        ].map(function(s) {
          return (
            <Card key={s.l} style={{ padding: "13px 15px" }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>{s.l}</div>
            </Card>
          );
        })}
      </div>
      <div
        onClick={props.onPipDay}
        style={{ background: "linear-gradient(135deg,rgba(74,155,130,0.12),rgba(45,107,90,0.08))", border: "1px solid rgba(74,155,130,0.25)", borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flexShrink: 0 }}><PipMark size={18} color={C.accent} glow pulse /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Pip - Your Day</div>
            {nextUp ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2 }}>{nextUp.title}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{nextUp.time + (nextUp.location ? " | " + nextUp.location : "")}</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.textSub }}>Tap for your full day overview</div>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{">"}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        <button onClick={props.onBriefing}  style={Object.assign({}, btnBase, { flex: 1, background: C.bgCard, color: C.textSub, border: "1px solid " + C.border, fontSize: 11, padding: "9px 8px" })}>Daily Brief</button>
        <button onClick={props.onDebrief}   style={Object.assign({}, btnBase, { flex: 1, background: C.bgCard, color: C.textSub, border: "1px solid " + C.border, fontSize: 11, padding: "9px 8px" })}>Debrief</button>
        <button onClick={props.onRelHealth} style={Object.assign({}, btnBase, { flex: 1, background: C.bgCard, color: C.textSub, border: "1px solid " + C.border, fontSize: 11, padding: "9px 8px" })}>Health</button>
      </div>
      <Card style={{ padding: "12px 16px", marginBottom: 10, cursor: "pointer", background: props.quickNote ? C.bgCardAlt : C.bgCard }} onClick={props.onQuickNote}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18 }}>{"📝"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>Quick Notes</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
              {props.quickNote ? props.quickNote.slice(0, 40) + (props.quickNote.length > 40 ? "..." : "") : "Tap to jot something down"}
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{">"}</div>
        </div>
      </Card>
      <Card style={{ padding: "13px 15px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Conference Hotel</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>{hotel.name}</div>
            <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
              {hotel.address}<br />{hotel.phone}<br />{"Check-in: " + hotel.checkIn}
              {hotel.roomNumber && <span><br />{"Room: " + hotel.roomNumber}</span>}
            </div>
          </div>
          <button onClick={props.onHotel} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, padding: "2px 6px" }}>edit</button>
        </div>
      </Card>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Partner Health</div>
      {partners.length === 0 ? (
        <EmptyState title="No partners yet" body="Add partner profiles to track relationships." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {partners.map(function(p) {
            return (
              <Card key={p.id} accent={STATUS_COLORS[p.status]} style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={function() { props.onSelectP(p); }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{p.revenue + " | " + (p.scheduledMeeting || "Not scheduled")}</div>
                </div>
                <Pill color={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Pill>
                <Pill color={TIER_COLORS[p.tier]}>{p.tier}</Pill>
              </Card>
            );
          })}
        </div>
      )}
      <button
        onClick={props.onExport}
        style={{ width: "100%", marginTop: 16, background: C.bgDark, color: C.textSub, border: "1px solid " + C.border, borderRadius: 24, padding: "11px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}
      >
        Export Summary
      </button>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24, opacity: 0.15 }}>
        <PipMark size={10} color={C.accent} />
      </div>
    </div>
  );
}

function ScheduleView(props) {
  var sessions = props.sessions;
  var day = props.day;
  var conflicts = props.conflicts;
  const [expandedId, setExp] = useState(null);
  const [qf, setQf] = useState(false);
  const [filters, setFilters] = useState({
    "Partner Meeting": true, "Conference": true, "Meal/Reception": true,
    "Open Slot": true, "Logistics": true, "Keynote": true,
  });
  if (day === "thu") {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: C.bgCard, border: "1px solid " + C.border, borderRadius: 14 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{"✈️"}</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: C.text, marginBottom: 8 }}>Travel Day</div>
        <div style={{ fontSize: 13, color: C.textMuted }}>Safe travels!</div>
      </div>
    );
  }
  var di = sessions.filter(function(s) { return s.day === day; });
  var vis = qf
    ? di.filter(function(s) { return ["Partner Meeting","Meal/Reception"].includes(s.track) && !s.isChild; })
    : di.filter(function(s) { return !s.isChild && filters[s.track]; });
  var kids = sessions.filter(function(s) { return s.isChild && s.day === day; });
  return (
    <div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={function() { setQf(!qf); }}
          style={{ background: qf ? C.accent : C.bgDark, color: qf ? "#fff" : C.textSub, border: "1px solid " + (qf ? C.accent : C.border), borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}
        >
          My Meetings
        </button>
        {!qf && Object.keys(filters).map(function(track) {
          return (
            <button
              key={track}
              onClick={function() { setFilters(function(p) { return Object.assign({}, p, { [track]: !p[track] }); }); }}
              style={{ background: filters[track] ? "rgba(" + toRgb(TRACK_COLORS[track] || C.accent) + ",0.12)" : C.bgDark, color: filters[track] ? (TRACK_COLORS[track] || C.accent) : C.textMuted, border: "1px solid " + (filters[track] ? (TRACK_COLORS[track] || C.accent) + "40" : C.border), borderRadius: 20, padding: "4px 9px", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}
            >
              {track}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
        {(DAYS.find(function(d) { return d.key === day; }) || { full: "" }).full}
      </div>
      {vis.length === 0 ? (
        <EmptyState title="No events match filters" body="Try adjusting the filters above." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {vis.map(function(s) {
            var color = TRACK_COLORS[s.track] || C.accent;
            var isOpen = s.track === "Open Slot";
            var hasC = conflicts.has(s.id);
            var isExp = expandedId === s.id;
            var hasKids = s.isParent && kids.length > 0;
            var vKey = getVenueKey(s.location);
            return (
              <div key={s.id}>
                <Card
                  accent={hasC ? C.red : isOpen ? undefined : color}
                  style={{ padding: "11px 14px", display: "flex", gap: 12, alignItems: "flex-start", cursor: isOpen ? "default" : "pointer", opacity: isOpen ? 0.7 : 1 }}
                  onClick={function() {
                    if (!isOpen && !s.isParent) props.onSelectS(s);
                    if (hasKids) setExp(isExp ? null : s.id);
                  }}
                >
                  <div style={{ minWidth: 60, textAlign: "right", paddingTop: 2, flexShrink: 0 }}>
                    {s.time ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: C.textSub }}>{s.time}</div>
                        {s.end && <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{"-> " + s.end}</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: C.textMuted }}>{"--"}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
                      <Pill color={color}>{s.track}</Pill>
                      {!isOpen && <Pill color={MS_COLORS[s.status] || C.blue}>{MS_LABELS[s.status] || "Upcoming"}</Pill>}
                      {hasC && <Pill color={C.red}>Conflict</Pill>}
                      {hasKids && <span style={{ fontSize: 10, color: C.accent, marginLeft: "auto" }}>{isExp ? "hide" : "speakers"}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: isOpen ? 400 : 500, fontStyle: isOpen ? "italic" : "normal", color: isOpen ? C.textMuted : C.text, lineHeight: 1.4 }}>
                      {isOpen ? "-- " + s.notes : s.title}
                    </div>
                    {s.location && (
                      <div
                        onClick={function(e) { e.stopPropagation(); if (vKey) props.onSelectV(s.location); }}
                        style={{ fontSize: 10, color: vKey ? C.accent : C.textMuted, marginTop: 3, cursor: vKey ? "pointer" : "default" }}
                      >
                        {s.location + (vKey ? " >" : "")}
                      </div>
                    )}
                    {s.notes && !isOpen && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{s.notes}</div>}
                    {!isOpen && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                        {TEAM.filter(function(t) { return s.attendees && s.attendees.includes(t.key); }).map(function(t) {
                          return (
                            <span key={t.key} style={{ background: "rgba(" + toRgb(t.color) + ",0.12)", color: t.color, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>
                              {t.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {!isOpen && <div style={{ fontSize: 14, color: C.textMuted, paddingTop: 2, flexShrink: 0 }}>{">"}</div>}
                </Card>
                {hasKids && isExp && (
                  <div style={{ marginLeft: 16, marginTop: 3, display: "flex", flexDirection: "column", gap: 3 }}>
                    {kids.map(function(child) {
                      return (
                        <div key={child.id} style={{ background: C.bgDark, border: "1px solid " + C.border, borderLeft: "2px solid " + C.yellow, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 10 }}>
                          <div style={{ minWidth: 54, textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: C.textSub }}>{child.time}</div>
                            <div style={{ fontSize: 9, color: C.textMuted }}>{"-> " + child.end}</div>
                          </div>
                          <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{child.title}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamView(props) {
  var di = props.sessions.filter(function(s) { return s.day === props.day && !s.isChild; });
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TEAM.map(function(t) {
          return (
            <Card key={t.key} style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{t.name}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{t.title}</div>
              </div>
            </Card>
          );
        })}
      </div>
      {di.length === 0 ? (
        <EmptyState title="No events this day" body="Check another day." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {di.map(function(s) {
            return (
              <Card key={s.id} style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 60, textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: C.textSub }}>{s.time || "--"}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 4, lineHeight: 1.3 }}>
                    {s.track === "Open Slot" ? <em style={{ color: C.textMuted }}>Open Slot</em> : s.title}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {TEAM.filter(function(t) { return s.attendees && s.attendees.includes(t.key); }).map(function(t) {
                      return (
                        <span key={t.key} style={{ background: "rgba(" + toRgb(t.color) + ",0.12)", color: t.color, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>
                          {t.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <Pill color={TRACK_COLORS[s.track] || C.accent}>{s.track}</Pill>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PartnersView(props) {
  var partners = props.partners;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textMuted }}>{partners.length + " partners"}</div>
        <GreenBtn onClick={props.onAdd} style={{ fontSize: 11, padding: "7px 14px" }}>+ Add Partner</GreenBtn>
      </div>
      {partners.length === 0 ? (
        <EmptyState title="No partners yet" body="Add partner profiles to track relationships." action="Add Your First Partner" onAction={props.onAdd} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {partners.map(function(p) {
            return (
              <Card key={p.id} accent={STATUS_COLORS[p.status]} style={{ padding: "12px 15px", cursor: "pointer" }} onClick={function() { props.onSelect(p); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{p.name}</div>
                      <Pill color={TIER_COLORS[p.tier]}>{p.tier}</Pill>
                      <Pill color={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Pill>
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{p.revenue + " YTD"}</div>
                    {p.scheduledMeeting && <div style={{ fontSize: 10, color: C.textMuted }}>{p.scheduledMeeting}</div>}
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      {p.attendees && p.attendees.filter(function(a) { return a.poc; }).map(function(a) {
                        return (
                          <span key={a.id} style={{ background: "rgba(" + toRgb(C.accent) + ",0.1)", color: C.accent, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>
                            {"POC: " + a.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 10 }} onClick={function(e) { e.stopPropagation(); }}>
                  <GreenBtn onClick={function() { props.onSchedule(p); }} style={{ fontSize: 11, padding: "6px 12px" }}>Schedule</GreenBtn>
                  <SecBtn onClick={function() { props.onEdit(p); }} style={{ fontSize: 11, padding: "6px 12px" }}>Edit</SecBtn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PendingView(props) {
  var unsched = props.partners.filter(function(p) { return p.unscheduled; });
  var openSlots = props.sessions.filter(function(s) { return s.track === "Open Slot"; });
  return (
    <div>
      <Card style={{ padding: "13px 16px", marginBottom: 16, background: C.bgCardAlt }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.purple, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Available Open Slots</div>
        {openSlots.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>No open slots</div>
        ) : (
          openSlots.map(function(s) {
            var d = DAYS.find(function(x) { return x.key === s.day; }) || { label: "", date: "" };
            return (
              <div key={s.id} style={{ display: "flex", gap: 10, marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: C.purple, fontWeight: 500, minWidth: 64 }}>{d.label + " " + d.date}</span>
                <span style={{ color: C.textSub }}>{s.time + " - " + s.end}</span>
              </div>
            );
          })
        )}
      </Card>
      {unsched.length === 0 ? (
        <EmptyState title="All partners scheduled!" body="Every partner has a meeting slot." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {unsched.map(function(p) {
            return (
              <Card key={p.id} accent={C.accentOrange} style={{ padding: "13px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.textSub }}>{p.revenue}</div>
                    {p.openItems && p.openItems.length > 0 && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{p.openItems[0].text}</div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Fits:</div>
                    {openSlots.map(function(s) {
                      var d = DAYS.find(function(x) { return x.key === s.day; }) || { label: "" };
                      return (
                        <div key={s.id} style={{ fontSize: 10, color: C.purple, marginTop: 2 }}>
                          {d.label + " " + s.time + "-" + s.end}
                        </div>
                      );
                    })}
                  </div>
                  <Pill color={C.accentOrange}>Pending</Pill>
                </div>
                <GreenBtn onClick={function() { props.onSchedule(p); }} style={{ width: "100%", fontSize: 12 }}>
                  Schedule Meeting
                </GreenBtn>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
function NotificationsModal(props) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(function() {
    sbLoadNotifications(function(err, data) {
      setNotifs(data || []);
      setLoading(false);
    });
  }, []);

  function timeAgo(dateStr) {
    var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }

  return (
    <Modal onClose={props.onClose} title="Team Activity">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "20px", color: C.textMuted, fontSize: 13 }}>
            Loading...
          </div>
        )}
        {!loading && notifs.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px", color: C.textMuted, fontSize: 13 }}>
            No activity yet
          </div>
        )}
        {notifs.map(function(n) {
          return (
            <div
              key={n.id}
              style={{ background: C.bgDark, border: "1px solid " + C.border, borderRadius: 10, padding: "11px 14px" }}
            >
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{n.message}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 10, color: C.accent }}>{n.who || "Team"}</span>
                <span style={{ fontSize: 10, color: C.textMuted }}>{timeAgo(n.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
// ---- MAIN APP (BLANK VERSION) ----
export default function Lanyard() {
  const inviteParams = useMemo(function() { return getInviteParams(); }, []);
  const [inviteDone, setInviteDone] = useState(function() {
    try { return !!localStorage.getItem("lanyard_invite_done"); } catch (e) { return false; }
  });
  const [onboarded, setOnboarded] = useState(function() {
    try { return !!localStorage.getItem("lanyard_onboarded"); } catch (e) { return false; }
  });
  const [roleSet, setRoleSet] = useState(function() {
    try { return !!localStorage.getItem("lanyard_role"); } catch (e) { return false; }
  });
  const [role, setRole] = useState(function() {
    try { return localStorage.getItem("lanyard_role") || "am"; } catch (e) { return "am"; }
  });
  const [customTitle, setCustomTitle] = useState(function() {
    try { return localStorage.getItem("lanyard_custom_title") || ""; } catch (e) { return ""; }
  });
  const [view, setView] = useState("home");
  const [day, setDay] = useState("mon");
  const [sessions, setSess] = useState(function() {
    var s = loadLocal();
    return s ? s.sessions : INIT_SESSIONS;
  });
  const [partners, setPart] = useState(function() {
    var s = loadLocal();
    return s ? s.partners : INIT_PARTNERS;
  });
  const [hotel, setHotel] = useState(function() {
    var s = loadLocal();
    return s ? s.hotel : HOTEL_DEFAULT;
  });
  const [quickNote, setQN] = useState(function() {
    var s = loadLocal();
    return s ? (s.quickNote || "") : "";
  });
  const [weather, setWeather] = useState(null);
  const [selS, setSelS] = useState(null);
  const [editS, setEditS] = useState(null);
  const [selP, setSelP] = useState(null);
  const [editP, setEditP] = useState(null);
  const [schedP, setSchedP] = useState(null);
  const [venueModal, setVM] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAddE, setAddE] = useState(false);
  const [showAddP, setAddP] = useState(false);
  const [showHotel, setHotelM] = useState(false);
  const [showQN, setShowQN] = useState(false);
  const [showExport, setExport] = useState(false);
  const [showSearch, setSearch] = useState(false);
  const [showImport, setImport] = useState(false);
  const [showPipDay, setPipDay] = useState(false);
  const [showPipChat, setPipChat] = useState(false);
  const [showBriefing, setBriefing] = useState(false);
  const [showDebrief, setDebrief] = useState(false);
  const [showRelHealth, setRelHealth] = useState(false);
  const [showShare, setShare] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenNotif, setLastSeenNotif] = useState(function() {
    try { return localStorage.getItem("lanyard_last_notif") || ""; } catch (e) { return ""; }
  });
  const [srchQ, setSrchQ] = useState("");
  const [now, setNow] = useState(function() { return new Date(); });
  const [alertMsg, setAlertMsg] = useState(null);
  const [conferenceName, setConferenceName] = useState(function() {
    try { return localStorage.getItem("lanyard_conf_name") || "My Conference"; } catch (e) { return "My Conference"; }
  });

  useEffect(function() {
    sbLoad(function(data) {
      if (data) {
        if (data.sessions && data.sessions.length > 0) setSess(data.sessions);
        if (data.partners && data.partners.length > 0) setPart(data.partners);
        if (data.hotel) setHotel(data.hotel);
        if (data.quickNote) setQN(data.quickNote);
      }
    });
    try {
      var imp = localStorage.getItem("lanyard_share_import");
      if (imp) {
        var d = JSON.parse(imp);
        if (d.sessions) setSess(d.sessions);
        if (d.partners) setPart(d.partners);
        if (d.hotel) setHotel(d.hotel);
        localStorage.removeItem("lanyard_share_import");
      }
    } catch (e) {}
  }, []);

  useEffect(function() {
    saveLocal({ sessions: sessions, partners: partners, hotel: hotel, quickNote: quickNote });
    var t = setTimeout(function() { sbSave(sessions, partners, hotel, quickNote); }, 1500);
    return function() { clearTimeout(t); };
  }, [sessions, partners, hotel, quickNote]);

  useEffect(function() {
    var t = setInterval(function() { setNow(new Date()); }, 30000);
    return function() { clearInterval(t); };
  }, []);

  useEffect(function() {
    function pollNotifs() {
      sbLoadNotifications(function(err, data) {
        if (!data || data.length === 0) return;
        var lastSeen = lastSeenNotif ? parseInt(lastSeenNotif) : 0;
        var newCount = data.filter(function(n) {
          return new Date(n.created_at).getTime() > lastSeen;
        }).length;
        setUnreadCount(newCount);
      });
    }
    pollNotifs();
    var t = setInterval(pollNotifs, 30000);
    return function() { clearInterval(t); };
  }, [lastSeenNotif]);

  function notify(msg) { setToast(msg); setTimeout(function() { setToast(null); }, 2800); }

  var roleLabel = role === "custom" ? customTitle : (ROLES.find(function(r) { return r.id === role; }) || { label: "Account Manager" }).label;

  function updateS(id, f, v) {
    setSess(function(p) { return p.map(function(s) { return s.id === id ? Object.assign({}, s, { [f]: v }) : s; }); });
    setSelS(function(p) { return p && p.id === id ? Object.assign({}, p, { [f]: v }) : p; });
  }
  function updateP(id, f, v) {
    setPart(function(p) { return p.map(function(x) { return x.id === id ? Object.assign({}, x, { [f]: v }) : x; }); });
    setSelP(function(p) { return p && p.id === id ? Object.assign({}, p, { [f]: v }) : p; });
  }
  function saveEditS(draft) {
    if (!draft) {
      setSess(function(p) { return p.filter(function(s) { return s.id !== editS.id; }); });
      setSelS(null);
    } else {
      setSess(function(p) { return p.map(function(s) { return s.id === draft.id ? Object.assign({}, draft) : s; }); });
      setSelS(Object.assign({}, draft));
    }
    setEditS(null);
    notify(draft ? "Event updated" : "Event deleted");
  }
  function saveEditP(draft) {
    setPart(function(p) { return p.map(function(x) { return x.id === draft.id ? Object.assign({}, draft) : x; }); });
    setSelP(function(p) { return p && p.id === draft.id ? Object.assign({}, draft) : p; });
    setEditP(null);
    notify("Partner updated");
    sbSaveNotification(roleLabel + " updated " + draft.name, roleLabel);
  }
  function addEvent(f) {
    if (!f.title || !f.time) return;
    var s = Object.assign({}, f, {
      id: Date.now(), track: f.type, attendees: ["A","B","C"],
      isParent: false, isChild: false, status: "upcoming", partnerId: f.partnerId || null,
    });
    setSess(function(p) { return p.concat([s]); });
    if (f.partnerId) updateP(f.partnerId, "unscheduled", false);
    setAddE(false);
    setSchedP(null);
    notify("Event added");
    sbSaveNotification(roleLabel + " added " + f.title, roleLabel);
  }
  function addPartner(f) {
    if (!f.name) return;
    setPart(function(p) {
      return p.concat([Object.assign({}, f, { id: "p" + Date.now(), openItems: [], attendees: [], rating: 0, pastNotes: "", unscheduled: true, scheduledMeeting: "" })]);
    });
    setAddP(false);
    notify("Partner added");
    sbSaveNotification(roleLabel + " added partner: " + f.name, roleLabel);
  }
  function handleImport(importedSessions) {
    var mapped = importedSessions.map(function(s, i) {
      return {
        id: "import_" + Date.now() + "_" + i,
        day: s.day && s.day.toString().includes("1") ? "mon" : s.day && s.day.toString().includes("2") ? "tue" : s.day && s.day.toString().includes("3") ? "wed" : "thu",
        time: s.time || "9:00 AM", end: s.end || "",
        title: s.title || "Untitled", location: s.location || "",
        track: s.track || "Conference", attendees: ["A","B","C"],
        notes: "", status: "upcoming", partnerId: null, isParent: false, isChild: false,
      };
    });
    setSess(function(p) { return p.concat(mapped); });
    notify(mapped.length + " events imported");
  }
  function saveRole(r, ct) {
    setRole(r); setCustomTitle(ct); setRoleSet(true);
    try { localStorage.setItem("lanyard_role", r); localStorage.setItem("lanyard_custom_title", ct || ""); } catch (e) {}
  }

  const conflicts = useMemo(function() {
    var ids = new Set();
    var g = {};
    sessions.forEach(function(s) {
      if (!s.time || s.isChild) return;
      if (!g[s.day]) g[s.day] = [];
      g[s.day].push(s);
    });
    Object.values(g).forEach(function(arr) {
      for (var i = 0; i < arr.length; i++) {
        for (var j = i + 1; j < arr.length; j++) {
          if (arr[i].time === arr[j].time) { ids.add(arr[i].id); ids.add(arr[j].id); }
        }
      }
    });
    return ids;
  }, [sessions]);

  const pMap = useMemo(function() {
    var m = {};
    partners.forEach(function(p) { m[p.id] = p; });
    return m;
  }, [partners]);

  const openSlots = sessions.filter(function(s) { return s.track === "Open Slot"; });
  const showDayTabs = view === "schedule" || view === "team";

  const srchRes = useMemo(function() {
    if (!srchQ.trim()) return { s: [], p: [] };
    var q = srchQ.toLowerCase();
    return {
      s: sessions.filter(function(x) { return x.title.toLowerCase().includes(q) || (x.location || "").toLowerCase().includes(q); }),
      p: partners.filter(function(x) { return x.name.toLowerCase().includes(q); }),
    };
  }, [srchQ, sessions, partners]);

  if (inviteParams && !inviteDone) {
    return (
      <InviteWelcome
        name={inviteParams.name || inviteParams.invite || "there"}
        role={inviteParams.role || "am"}
        onDone={function() {
          try { localStorage.setItem("lanyard_invite_done", "1"); } catch (e) {}
          if (inviteParams.role) {
            try { localStorage.setItem("lanyard_role", inviteParams.role); localStorage.setItem("lanyard_onboarded", "1"); } catch (e) {}
            setRole(inviteParams.role); setRoleSet(true); setOnboarded(true);
          }
          setInviteDone(true);
        }}
      />
    );
  }
  if (!onboarded) {
    return (
      <Onboarding
        onDone={function() { try { localStorage.setItem("lanyard_onboarded", "1"); } catch (e) {} setOnboarded(true); }}
        onImport={handleImport}
      />
    );
  }
  if (!roleSet) {
    return <RoleModal onSave={saveRole} />;
  }

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <Toast message={toast} />
      {alertMsg && (
        <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 9998, background: C.accentOrange, color: "#fff", padding: "12px 20px", textAlign: "center", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
          {alertMsg}
        </div>
      )}

      <div style={{ background: C.bg, borderBottom: "1px solid " + C.border, padding: "14px 18px 10px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }} onClick={function() { setView("home"); }}>
              <LanyardLogo size={28} color={C.accent} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: C.text, letterSpacing: "0.02em" }}>Lanyard</div>
                  <PipMark size={7} color={C.accent} opacity={0.5} />
                </div>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em" }}>{roleLabel.toUpperCase()}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={function() { setSearch(!showSearch); }}
                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, padding: "4px" }}
              >
                {"🔍"}
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={function() {
                    setShowNotifs(true);
                    setUnreadCount(0);
                    var ts = String(Date.now());
                    setLastSeenNotif(ts);
                    try { localStorage.setItem("lanyard_last_notif", ts); } catch (e) {}
                  }}
                  style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, padding: "4px" }}
                >
                  {"🔔"}
                </button>
                {unreadCount > 0 && (
                  <div style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: C.red, border: "1px solid " + C.bg }} />
                )}
              </div>
              <button onClick={function() { setShare(true); }} style={Object.assign({}, btnBase, { background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border, fontSize: 11, padding: "6px 10px" })}>Share</button>
              <button onClick={function() { setImport(true); }} style={Object.assign({}, btnBase, { background: C.bgCardAlt, color: C.textSub, border: "1px solid " + C.border, fontSize: 11, padding: "6px 10px" })}>Import</button>
              <GreenBtn onClick={function() { setAddE(true); }} style={{ fontSize: 11, padding: "7px 13px" }}>+ Add</GreenBtn>
            </div>
          </div>
          {showSearch && (
            <div style={{ paddingBottom: 8 }}>
              <input autoFocus value={srchQ} onChange={function(e) { setSrchQ(e.target.value); }} placeholder="Search..." style={Object.assign({}, inp, { fontSize: 13 })} />
              {srchQ && (
                <div style={{ background: C.bgDark, border: "1px solid " + C.border, borderRadius: 10, marginTop: 4 }}>
                  {srchRes.s.map(function(s) {
                    return (
                      <div key={s.id} onClick={function() { setSelS(s); setSearch(false); setSrchQ(""); }} style={{ padding: "9px 14px", borderBottom: "1px solid " + C.border, cursor: "pointer", fontSize: 12, color: C.text }}>
                        {s.title + " | " + (DAYS.find(function(d) { return d.key === s.day; }) || { label: "" }).label + " " + s.time}
                      </div>
                    );
                  })}
                  {srchRes.p.map(function(p) {
                    return (
                      <div key={p.id} onClick={function() { setSelP(p); setSearch(false); setSrchQ(""); }} style={{ padding: "9px 14px", borderBottom: "1px solid " + C.border, cursor: "pointer", fontSize: 12, color: C.text }}>
                        {p.name + " - " + p.revenue}
                      </div>
                    );
                  })}
                  {!srchRes.s.length && !srchRes.p.length && (
                    <div style={{ padding: "11px 14px", fontSize: 12, color: C.textMuted }}>No results</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["home","Home"],["schedule","Schedule"],["team","Team"],["partners","Partners"],["pending","Pending"]].map(function(pair) {
              return (
                <button
                  key={pair[0]}
                  onClick={function() { setView(pair[0]); }}
                  style={{ flex: 1, padding: "6px 4px", borderRadius: 8, cursor: "pointer", fontSize: 9, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", background: view === pair[0] ? C.bgPillActive : "transparent", color: view === pair[0] ? C.accent : C.textMuted, border: "1px solid " + (view === pair[0] ? C.border : "transparent") }}
                >
                  {pair[1]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showDayTabs && (
        <div style={{ padding: "12px 18px 0", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {DAYS.map(function(d) {
              return (
                <button
                  key={d.key}
                  onClick={function() { setDay(d.key); }}
                  style={{ flex: 1, padding: "8px 4px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", border: "none", background: day === d.key ? C.bgPillActive : C.bgPill }}
                >
                  <div style={{ fontSize: 9, color: day === d.key ? C.textSub : C.textMuted, marginBottom: 2 }}>{d.label}</div>
                  <div style={{ fontSize: 14, fontWeight: day === d.key ? 600 : 400, color: day === d.key ? C.text : C.textSub }}>{d.date}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ padding: "16px 18px 100px", maxWidth: 480, margin: "0 auto" }}>
        {view === "home"     && <HomeView sessions={sessions} partners={partners} now={now} hotel={hotel} weather={weather} onSelectP={function(p) { setSelP(p); }} onHotel={function() { setHotelM(true); }} onExport={function() { setExport(true); }} quickNote={quickNote} onQuickNote={function() { setShowQN(true); }} onPipDay={function() { setPipDay(true); }} onBriefing={function() { setBriefing(true); }} onDebrief={function() { setDebrief(true); }} onRelHealth={function() { setRelHealth(true); }} />}
        {view === "schedule" && <ScheduleView sessions={sessions} day={day} onSelectS={function(s) { setSelS(s); }} onSelectV={function(v) { setVM(v); }} conflicts={conflicts} />}
        {view === "team"     && <TeamView sessions={sessions} day={day} />}
        {view === "partners" && <PartnersView partners={partners} onSelect={function(p) { setSelP(p); }} onSchedule={function(p) { setSchedP(p); setSelP(null); }} onEdit={function(p) { setEditP(Object.assign({}, p)); }} onAdd={function() { setAddP(true); }} />}
        {view === "pending"  && <PendingView partners={partners} sessions={sessions} onSchedule={function(p) { setSchedP(p); }} />}
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 18px 28px" }}>
        <div style={{ borderTop: "1px solid " + C.border, paddingTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(TRACK_COLORS).map(function(entry) {
            return (
              <div key={entry[0]} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: entry[1] }} />
                <span style={{ fontSize: 10, color: C.textMuted }}>{entry[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={function() { setPipChat(true); }}
        style={{ position: "fixed", bottom: 80, right: 20, width: 52, height: 52, borderRadius: "50%", background: "rgba(74,155,130,0.18)", border: "1px solid rgba(74,155,130,0.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 0 20px rgba(74,155,130,0.2)", zIndex: 90 }}
      >
        <PipMark size={14} color={C.accent} glow pulse />
      </button>

      {selS && !editS && <MeetingModal session={selS} pMap={pMap} hasConflict={conflicts.has(selS.id)} onClose={function() { setSelS(null); }} onUpdateS={updateS} onUpdateP={updateP} onEdit={function(s) { setEditS(Object.assign({}, s)); }} role={role} customTitle={customTitle} />}
      {editS && <EditSessionModal session={editS} onClose={function() { setEditS(null); }} onSave={saveEditS} />}
      {selP && !editP && <PartnerModal partner={selP} onClose={function() { setSelP(null); }} onUpdate={updateP} onSchedule={function(p) { setSchedP(p); setSelP(null); }} onEdit={function(p) { setEditP(Object.assign({}, p)); }} />}
      {editP && <EditPartnerModal partner={editP} onClose={function() { setEditP(null); }} onSave={saveEditP} />}
      {schedP && <ScheduleMtgModal partner={schedP} openSlots={openSlots} onClose={function() { setSchedP(null); }} onAdd={addEvent} />}
      {showAddE && <AddEventModal partners={partners} openSlots={openSlots} onClose={function() { setAddE(false); }} onAdd={addEvent} />}
      {showAddP && <AddPartnerModal onClose={function() { setAddP(false); }} onAdd={addPartner} />}
      {venueModal && <VenueModal locationName={venueModal} onClose={function() { setVM(null); }} />}
      {showHotel && <HotelModal hotel={hotel} onChange={function(d) { setHotel(d); }} onClose={function() { setHotelM(false); }} />}
      {showQN && <QuickNotesModal notes={quickNote} onChange={function(v) { setQN(v); }} onClose={function() { setShowQN(false); }} />}
      {showExport && <ExportModal sessions={sessions} partners={partners} onClose={function() { setExport(false); }} />}
      {showImport && <AIImportModal onClose={function() { setImport(false); }} onImport={handleImport} />}
      {showPipDay && <PipDayModal sessions={sessions} partners={partners} now={now} onClose={function() { setPipDay(false); }} onSelectS={function(s) { setSelS(s); setPipDay(false); }} />}
      {showPipChat && <PipChatModal onClose={function() { setPipChat(false); }} sessions={sessions} partners={partners} role={role} customTitle={customTitle} now={now} />}
      {showBriefing && <DailyBriefingModal onClose={function() { setBriefing(false); }} sessions={sessions} partners={partners} role={role} customTitle={customTitle} now={now} />}
      {showDebrief && <DebriefModal onClose={function() { setDebrief(false); }} sessions={sessions} partners={partners} role={role} customTitle={customTitle} />}
      {showRelHealth && <RelHealthModal onClose={function() { setRelHealth(false); }} partners={partners} role={role} customTitle={customTitle} />}
      {showShare && <ShareModal onClose={function() { setShare(false); }} sessions={sessions} partners={partners} hotel={hotel} />}
      {showNotifs && <NotificationsModal onClose={function() { setShowNotifs(false); }} />}

      <style>{`
        * { box-sizing: border-box; }
        select option { background: #142420; color: #E8F0EE; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #2D5A4F; border-radius: 4px; }
        .pip-pulse { animation: pipPulse 2s ease-in-out infinite; }
        @keyframes pipPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.92)} }
        @keyframes pipRing { 0%,100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.2;transform:translate(-50%,-50%) scale(1.15)} }
      `}</style>
    </div>
  );
}
