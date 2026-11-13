# SNIPER ARENA ONLINE

3D first-person online sniper arena starter project.

## Run locally
1. Install Node.js 18 or newer.
2. In this folder run `npm install`
3. Run `npm start`
4. Open `http://localhost:3000`

For another player to join, deploy the whole Node.js project to a host that supports persistent Node servers and WebSockets (for example Render or Railway), then share the deployed URL.

## Controls
- PC: WASD move, mouse look, left click shoot, right click scope, R reload, F punch, Space jump, Shift slide.
- Mobile: left virtual joystick move, drag right side to look, FIRE, 조준, 주먹, 점프 buttons.

## Current implementation notes
- Includes a shared Socket.IO room, replicated player movement with smoothed remote avatars, server-synchronized spawn and respawn, server-side sniper ammo/reload/cooldown, server-derived aim direction, torso/head ray-sphere hit volumes, kill/death scoreboard events, sniper scope, 3D arena, quiz gate, Shift slide, and quick melee animation.
- This remains a development build, not a production-grade competitive shooter. It still lacks persistent accounts, matchmaking, robust anti-cheat, lag compensation, cover/obstacle line-of-sight checks, and full collision/character animation systems. Keep the server process running for online sessions.
- Three.js is loaded from a CDN, so the client needs internet access.


## Visual and movement update
- Reduced the black overlay around the sniper scope for a clearer view.
- Added client-side AABB collision against arena box geometry for normal movement and sliding.
- Improved renderer tone mapping and visual contrast.
- Slowed the first-person F-key melee animation visually; the existing server-side melee rules and cooldown are unchanged.
- This is still a development build. Test multiplayer movement and collision on the deployed host before treating it as production-ready.
\n- Press Escape during a match to open settings; mouse sensitivity (1.0–10.0) is adjustable and saved in the browser. Press Escape again or Resume to return.\n