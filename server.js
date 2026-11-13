const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(path.join(__dirname, "public")));

const players = new Map();
const ARENA = { x: 46, z: 46 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

io.on("connection", socket => {
  const spawn = () => ({ x: (Math.random() - .5) * 30, y: 1.7, z: (Math.random() - .5) * 30 });
  players.set(socket.id, {
    id: socket.id, name: "Player-" + socket.id.slice(0, 4),
    x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, hp: 100, kills: 0, deaths: 0,
    lastShot: 0, lastMelee: 0, ammo: 5, reloadUntil: 0, ...spawn()
  });
  socket.emit("welcome", { id: socket.id, players: [...players.values()] });
  socket.broadcast.emit("playerJoined", players.get(socket.id));

  socket.on("rename", name => { const p=players.get(socket.id); if(p && typeof name==="string") { p.name=name.replace(/[^\w가-힣 -]/g,"").slice(0,14) || p.name; io.emit("scoreUpdate",[...players.values()].map(q=>({id:q.id,name:q.name,kills:q.kills,deaths:q.deaths,hp:q.hp,ammo:q.ammo}))); } });

  socket.on("move", data => {
    const p = players.get(socket.id); if (!p || !data) return;
    const x = Number(data.x), z = Number(data.z), y = Number(data.y);
    const nextYaw = Number(data.yaw), nextPitch = Number(data.pitch);
    if (![x, z, y, nextYaw, nextPitch].every(Number.isFinite)) return;
    p.x = clamp(x, -ARENA.x, ARENA.x);
    p.z = clamp(z, -ARENA.z, ARENA.z);
    p.y = clamp(y, 1.0, 5.0);
    p.yaw = nextYaw;
    p.pitch = clamp(nextPitch, -1.35, 1.35);
    io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
  });

  socket.on("reload", ack => {
    const p = players.get(socket.id);
    if (!p) { if (typeof ack === "function") ack({ ok: false }); return; }
    const now = Date.now();
    if (p.ammo >= 5 || p.reloadUntil > now) {
      if (typeof ack === "function") ack({ ok: false, ammo: p.ammo });
      return;
    }
    const finishAt = now + 1500;
    p.reloadUntil = finishAt;
    socket.emit("reloadStarted", { duration: 1500, ammo: p.ammo });
    if (typeof ack === "function") ack({ ok: true, ammo: p.ammo, duration: 1500 });
    setTimeout(() => {
      if (players.get(socket.id) !== p || p.reloadUntil !== finishAt) return;
      p.ammo = 5;
      p.reloadUntil = 0;
      socket.emit("ammoUpdate", { ammo: p.ammo });
    }, 1500);
  });

  socket.on("shoot", (_data, ack) => {
    const p = players.get(socket.id);
    const reply = value => { if (typeof ack === "function") ack(value); };
    if (!p) { reply({ ok: false, reason: "player" }); return; }
    const now = Date.now();
    if (p.reloadUntil > now) { reply({ ok: false, reason: "reloading", ammo: p.ammo }); return; }
    if (now - p.lastShot < 850) { reply({ ok: false, reason: "cooldown", ammo: p.ammo }); return; }
    if (p.ammo <= 0) { reply({ ok: false, reason: "empty", ammo: p.ammo }); return; }
    p.lastShot = now;
    p.ammo -= 1;

    // Aim is derived from the last server-accepted player rotation; clients cannot submit an arbitrary hit direction.
    const cp = Math.cos(p.pitch);
    const d = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    reply({ ok: true, ammo: p.ammo });

    // Ray/sphere intersection against separate torso and head hit volumes.
    const raySphere = (cx, cy, cz, radius) => {
      const vx = cx - p.x, vy = cy - p.y, vz = cz - p.z;
      const along = vx*d.x + vy*d.y + vz*d.z;
      if (along <= 0 || along > 85) return null;
      const dx = vx - along*d.x, dy = vy - along*d.y, dz = vz - along*d.z;
      const perpendicularSq = dx*dx + dy*dy + dz*dz;
      const radiusSq = radius*radius;
      if (perpendicularSq > radiusSq) return null;
      return along - Math.sqrt(radiusSq - perpendicularSq);
    };
    let hit = null, best = 85;
    for (const target of players.values()) {
      if (target.id === p.id || target.hp <= 0) continue;
      const postureOffset = (target.y || 1.7) - 1.7;
      const torso = raySphere(target.x, 1.05 + postureOffset, target.z, 0.48);
      const head = raySphere(target.x, 1.62 + postureOffset, target.z, 0.27);
      const distance = Math.min(torso ?? Infinity, head ?? Infinity);
      if (distance < best) { best = distance; hit = target; }
    }
    if (hit) {
      hit.hp = 0;
      hit.deaths++;
      p.kills++;
      io.to(hit.id).emit("gotHit", { by: p.id, damage: 100 });
      io.emit("kill", { killer: p.name, victim: hit.name, killerId: p.id, victimId: hit.id });
      const a = spawn();
      hit.x = a.x; hit.y = 1.7; hit.z = a.z; hit.hp = 100;
      hit.ammo = 5; hit.reloadUntil = 0;
      io.to(hit.id).emit("respawn", { x: hit.x, y: hit.y, z: hit.z, hp: hit.hp, ammo: hit.ammo });
      io.emit("playerMoved", { id: hit.id, x: hit.x, y: hit.y, z: hit.z, yaw: hit.yaw, pitch: hit.pitch });
      io.emit("scoreUpdate", [...players.values()].map(q => ({id:q.id,name:q.name,kills:q.kills,deaths:q.deaths,hp:q.hp,ammo:q.ammo})));
    }
    io.emit("shotFX", { id: p.id, x:p.x, y:p.y, z:p.z, dir:d, hitId:hit && hit.id });
  });

  socket.on("melee", () => {
    const p=players.get(socket.id); if(!p) return;
    const now=Date.now(); if(now-p.lastMelee<700) return;
    p.lastMelee=now;
    const fx=-Math.sin(p.yaw), fz=-Math.cos(p.yaw);
    for(const t of players.values()) {
      if(t.id===p.id || t.hp<=0) continue;
      const dx=t.x-p.x, dz=t.z-p.z, dist=Math.hypot(dx,dz);
      const dot=(dx*fx+dz*fz)/(dist||1);
      if(dist<2.15 && dot>.25) {
        t.hp-=25; io.to(t.id).emit("gotHit",{by:p.id,melee:true});
        if(t.hp<=0){
          p.kills++;t.deaths++;
          io.emit("kill",{killer:p.name,victim:t.name,killerId:p.id,victimId:t.id});
          const a=spawn();t.x=a.x;t.y=1.7;t.z=a.z;t.hp=100;t.ammo=5;t.reloadUntil=0;
          io.to(t.id).emit("respawn",{x:t.x,y:t.y,z:t.z,hp:t.hp,ammo:t.ammo});
          io.emit("playerMoved",{id:t.id,x:t.x,y:t.y,z:t.z,yaw:t.yaw,pitch:t.pitch});
        }
        io.emit("scoreUpdate",[...players.values()].map(q=>({id:q.id,name:q.name,kills:q.kills,deaths:q.deaths,hp:q.hp,ammo:q.ammo})));
        break;
      }
    }
    io.emit("meleeFX",{id:p.id});
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Sniper Arena running on port " + PORT));