import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const socket=io();
const root=document.getElementById("game");
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x91b5c8); scene.fog=new THREE.Fog(0x91b5c8,55,145);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.1,250); camera.position.set(0,1.7,8);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; root.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd9efff,0x53606a,2.1));
const sun=new THREE.DirectionalLight(0xffedcf,2.2); sun.position.set(-25,45,20); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);
const mat=(c,r=.8,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),mat(0x596b68)); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
const grid=new THREE.GridHelper(120,60,0x8da7a0,0x718780); grid.position.y=.015; scene.add(grid);
function box(x,y,z,sx,sy,sz,color){const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}
function cylinder(x,y,z,r,h,color){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),mat(color));o.position.set(x,y,z);o.castShadow=true;scene.add(o);return o}
// Arena architecture: cover blocks, raised platforms, towers and sightline lanes.
for(let i=-2;i<=2;i++){box(i*19,2,-27,10,4,5,0x596875);box(i*19,2,27,10,4,5,0x596875);box(-27,2,i*19,5,4,10,0x596875);box(27,2,i*19,5,4,10,0x596875)}
for(let i=0;i<18;i++){let x=(Math.random()-.5)*72,z=(Math.random()-.5)*72;if(Math.abs(x)<9&&Math.abs(z)<9)continue;let h=1.3+Math.random()*2.8;box(x,h/2,z,2.8,h,2.8,[0x65727a,0x7a7467,0x536b70][i%3]);}
for(let i=0;i<4;i++){let x=(i%2?1:-1)*17,z=(i<2?-1:1)*17;box(x,3.5,z,7,7,7,0x354a59);box(x,7.2,z,8,.5,8,0x91a6ad);for(let k=-1;k<=1;k++)box(x+k*2,1.5,z+4,1,3,.5,0x9aafba)}
// Decorative lights
for(let i=-2;i<=2;i++){let pole=cylinder(i*16,3,-5,.12,6,0x263c4a);cylinder(i*16,6,-5,.35,.25,0x75dfff)}
const floorColliders=[]; // visual cover; movement bounds keep player in arena.
const players=new Map(); let myId=null,serverSpawn=null,yaw=0,pitch=0,started=false,aiming=false,ammo=5,reloading=false,shotPending=false,kills=0,deaths=0,hp=100,lastMove=0,meleeUntil=0;
const keys={}; const clock=new THREE.Clock();
const gun=new THREE.Group(); camera.add(gun); scene.add(camera);
const dark=mat(0x17232b,.38,.55), steel=mat(0x52636c,.3,.7);
const body=new THREE.Mesh(new THREE.BoxGeometry(.18,.16,.58),dark);body.position.set(.28,-.23,-.48);gun.add(body);
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.62,12),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(.28,-.19,-.98);gun.add(barrel);
const scope=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.25,16),mat(0x111b22,.2,.7));scope.rotation.x=Math.PI/2;scope.position.set(.28,-.095,-.52);gun.add(scope);
const stock=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.28),mat(0x554638));stock.position.set(.28,-.24,-.1);gun.add(stock);
const armMat=mat(0xc58e69);const arm=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.34),armMat);arm.position.set(.16,-.32,-.38);gun.add(arm);
const fist=new THREE.Group();const palm=new THREE.Mesh(new THREE.BoxGeometry(.2,.17,.22),armMat);fist.add(palm);for(let i=0;i<4;i++){let f=new THREE.Mesh(new THREE.BoxGeometry(.045,.06,.15),armMat);f.position.set(-.07+i*.045,.09,-.04);fist.add(f)}fist.position.set(.35,-.28,-.35);fist.visible=false;camera.add(fist);
function makeAvatar(id){const g=new THREE.Group();const suit=mat(0x263c4a),skin=mat(0xc99470),visor=mat(0x72d9ef,.2,.4);let torso=new THREE.Mesh(new THREE.BoxGeometry(.65,.8,.35),suit);torso.position.y=1.05;g.add(torso);let head=new THREE.Mesh(new THREE.SphereGeometry(.23,16,12),skin);head.position.y=1.62;g.add(head);let helmet=new THREE.Mesh(new THREE.SphereGeometry(.25,16,8,0,Math.PI*2,0,Math.PI/2),mat(0x1d303d));helmet.position.y=1.7;g.add(helmet);let face=new THREE.Mesh(new THREE.BoxGeometry(.25,.08,.04),visor);face.position.set(0,1.62,-.21);g.add(face);for(let s of [-1,1]){let leg=new THREE.Mesh(new THREE.BoxGeometry(.22,.65,.24),mat(0x1b2731));leg.position.set(s*.18,.35,0);g.add(leg);let arm2=new THREE.Mesh(new THREE.BoxGeometry(.18,.65,.2),suit);arm2.position.set(s*.43,1.05,0);g.add(arm2)}g.userData.id=id;scene.add(g);return g}
function updateRemote(p){let o=players.get(p.id);if(!o){const mesh=makeAvatar(p.id);mesh.position.set(p.x,0,p.z);o={mesh,data:p,target:{x:p.x,y:0,z:p.z},targetYaw:p.yaw||0};players.set(p.id,o)}o.data={...o.data,...p};o.target={x:p.x,y:0,z:p.z};o.targetYaw=p.yaw||0}
function removePlayer(id){let o=players.get(id);if(o){scene.remove(o.mesh);players.delete(id)}}
function notify(t){const el=document.createElement("div");el.textContent=t;document.getElementById("feed").prepend(el);setTimeout(()=>el.remove(),3500)}
socket.on("welcome",d=>{myId=d.id;serverSpawn=d.players.find(p=>p.id===myId)||null;if(started&&serverSpawn)camera.position.set(serverSpawn.x,serverSpawn.y||1.7,serverSpawn.z);d.players.forEach(p=>{if(p.id!==myId)updateRemote(p)});document.getElementById("online").textContent="ONLINE "+d.players.length});
socket.on("playerJoined",p=>{updateRemote(p);document.getElementById("online").textContent="ONLINE "+(players.size+1)});
socket.on("playerMoved",p=>{if(p.id!==myId)updateRemote(p)});
socket.on("playerLeft",id=>{removePlayer(id);document.getElementById("online").textContent="ONLINE "+(players.size+1)});
socket.on("kill",d=>notify(`${d.killer}  ▸  ${d.victim}`));
socket.on("gotHit",d=>{hp=Math.max(0,hp-(d.melee?25:0));document.getElementById("hitmark").style.opacity=1;setTimeout(()=>document.getElementById("hitmark").style.opacity=0,180)});
socket.on("scoreUpdate",arr=>{const me=arr.find(p=>p.id===myId);if(me){kills=me.kills;deaths=me.deaths;hp=me.hp;if(Number.isFinite(me.ammo)&&!reloading)ammo=me.ammo;document.getElementById("score").textContent=`K ${kills} / D ${deaths}`;document.getElementById("hpnum").textContent=hp;document.getElementById("hpbar").style.width=hp+"%";document.getElementById("ammo").innerHTML=ammo+' <small>/ 5</small>' }});
socket.on("ammoUpdate",d=>{ammo=d.ammo;reloading=false;document.getElementById("ammo").innerHTML=ammo+' <small>/ 5</small>';document.getElementById("reload").classList.add("hidden")});
socket.on("respawn",d=>{camera.position.set(d.x,d.y||1.7,d.z);hp=d.hp||100;ammo=d.ammo??5;reloading=false;shotPending=false;document.getElementById("hpnum").textContent=hp;document.getElementById("hpbar").style.width=hp+"%";document.getElementById("ammo").innerHTML=ammo+' <small>/ 5</small>';document.getElementById("reload").classList.add("hidden");notify("재배치 완료")});
socket.on("shotFX",d=>{if(d.id!==myId){const a=new THREE.Vector3(d.x,d.y,d.z),b=a.clone().add(new THREE.Vector3(d.dir.x,d.dir.y,d.dir.z).multiplyScalar(9));const geo=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffd78a,transparent:true,opacity:.8}));scene.add(line);setTimeout(()=>{scene.remove(line);geo.dispose()},100)}});
socket.on("meleeFX",d=>{if(d.id!==myId)return;});
function start(){started=true;document.getElementById("menu").classList.add("hidden");document.getElementById("quiz").classList.add("hidden");document.getElementById("hud").classList.remove("hidden");if(serverSpawn)camera.position.set(serverSpawn.x,serverSpawn.y||1.7,serverSpawn.z);else camera.position.set(0,1.7,0);if(matchMedia("(pointer:fine)").matches)renderer.domElement.requestPointerLock?.();const name=document.getElementById("nickname").value.trim().slice(0,14)||"Sniper";socket.emit("rename",name)}
const quizBank=[
{subject:"수학",q:"분수 3/4를 소수로 나타내면?",a:["0.25","0.5","0.75","1.25"],c:2},
{subject:"수학",q:"직육면체의 부피는 어떻게 구할까요?",a:["가로 × 세로 × 높이","(가로 + 세로) × 2","밑변 × 높이 ÷ 2","한 변 × 4"],c:0},
{subject:"수학",q:"비율 2 : 5에서 전체를 35로 나누어 배분할 때 작은 쪽의 양은?",a:["5","10","14","25"],c:1},
{subject:"과학",q:"태양이 지는 쪽은 어느 방향일까요?",a:["동쪽","서쪽","남쪽","북쪽"],c:1},
{subject:"과학",q:"전류가 흐르려면 전기 회로는 어떤 상태여야 할까요?",a:["끊어진 상태","열린 상태","닫힌 상태","전지가 없는 상태"],c:2},
{subject:"과학",q:"운동 방향과 반대 방향으로 힘이 작용하면 보통 속력은 어떻게 될까요?",a:["줄어든다","무조건 커진다","질량이 사라진다","색이 변한다"],c:0},
{subject:"사회",q:"국민이 대표자를 뽑는 권리는?",a:["참정권","청구권","환경권","재산권"],c:0},
{subject:"사회",q:"국회가 하는 대표적인 일은?",a:["법률을 만들고 고친다","재판을 한다","수업을 진행한다","날씨를 예보한다"],c:0},
{subject:"사회",q:"적도는 지구를 어떻게 나누는 선일까요?",a:["동쪽과 서쪽","북반구와 남반구","대륙과 바다","낮과 밤"],c:1},
{subject:"수학",q:"원의 둘레를 구할 때 사용하는 식은?",a:["반지름 × 반지름","지름 × 원주율","한 변 × 4","밑변 × 높이"],c:1}
];
function showQuiz(){document.getElementById("menu").classList.add("hidden");document.getElementById("quiz").classList.remove("hidden");const q=quizBank[Math.floor(Math.random()*quizBank.length)];document.getElementById("quiz-subject").textContent=q.subject;document.getElementById("quiz-question").textContent=q.q;document.getElementById("quiz-feedback").textContent="";const box=document.getElementById("quiz-options");box.innerHTML="";q.a.forEach((answer,i)=>{const b=document.createElement("button");b.className="quiz-option";b.textContent=`${i+1}. ${answer}`;b.onclick=()=>{if(i===q.c){b.classList.add("correct");document.getElementById("quiz-feedback").textContent="정답입니다! 전투에 입장합니다.";box.querySelectorAll("button").forEach(x=>x.disabled=true);setTimeout(start,650)}else{b.classList.add("wrong");document.getElementById("quiz-feedback").textContent="오답이에요. 다시 선택해 보세요.";setTimeout(()=>b.classList.remove("wrong"),450)}};box.appendChild(b)})}
document.getElementById("play").onclick=showQuiz;
document.getElementById("quiz-back").onclick=()=>{document.getElementById("quiz").classList.add("hidden");document.getElementById("menu").classList.remove("hidden")};
document.addEventListener("pointerlockchange",()=>{});
document.addEventListener("mousemove",e=>{if(!started||document.pointerLockElement!==renderer.domElement)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=Math.max(-1.25,Math.min(1.25,pitch))});
document.addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyF")melee();if(e.code==="KeyR")reload();if(e.code==="ShiftLeft"||e.code==="ShiftRight")beginSlide();if(e.code==="Escape"&&started)document.exitPointerLock?.()});
document.addEventListener("keyup",e=>keys[e.code]=false);
renderer.domElement.addEventListener("click",()=>{if(started&&!matchMedia("(pointer:coarse)").matches&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.()});
document.addEventListener("mousedown",e=>{if(!started)return;if(e.button===0)shoot();if(e.button===2)setAim(true)});
document.addEventListener("mouseup",e=>{if(e.button===2)setAim(false)});
document.addEventListener("contextmenu",e=>e.preventDefault());
function setAim(v){aiming=v;document.body.classList.toggle("aim",v);camera.fov=v?25:76;camera.updateProjectionMatrix();gun.visible=!v}
function shoot(){if(!started||reloading||shotPending||ammo<=0||!socket.connected)return;shotPending=true;socket.emit("shoot",{},result=>{shotPending=false;if(!result||!result.ok){if(result?.reason==="empty")reload();return;}ammo=result.ammo;document.getElementById("ammo").innerHTML=ammo+' <small>/ 5</small>';gun.position.z=.08;setTimeout(()=>gun.position.z=0,70);if(ammo===0)reload()})}
function reload(){if(reloading||ammo===5||!socket.connected)return;reloading=true;socket.emit("reload",result=>{if(!result?.ok){reloading=false;return;}document.getElementById("reload").classList.remove("hidden")})}
function melee(){if(!started||Date.now()<meleeUntil)return;meleeUntil=Date.now()+700;socket.emit("melee");fist.visible=true;gun.visible=false;fist.rotation.x=-.9;fist.position.set(.34,-.25,-.35);let t=0;const anim=()=>{t+=.12;fist.rotation.x=-.9+Math.sin(t*Math.PI)*1.7;fist.position.x=.34+Math.sin(t*Math.PI)*.16;if(t<1){requestAnimationFrame(anim)}else{fist.visible=false;gun.visible=!aiming}};anim()}
function moveMobile(vec){mobileMove=vec}
let mobileMove={x:0,y:0};const stick=document.getElementById("stick"),nub=document.getElementById("nub");let stickId=null;
stick.addEventListener("pointerdown",e=>{stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e)});
stick.addEventListener("pointermove",e=>{if(e.pointerId===stickId)moveStick(e)});
stick.addEventListener("pointerup",e=>{if(e.pointerId===stickId){stickId=null;mobileMove={x:0,y:0};nub.style.transform="translate(0,0)"}});
function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),k=Math.min(1,48/(len||1));mobileMove={x:dx*k/48,y:dy*k/48};nub.style.transform=`translate(${dx*k}px,${dy*k}px)`}
let lookId=null,lastTouch=null;renderer.domElement.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"&&e.clientX>innerWidth*.35){lookId=e.pointerId;lastTouch={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(lookId)}});
renderer.domElement.addEventListener("pointermove",e=>{if(e.pointerId===lookId&&lastTouch){yaw-=(e.clientX-lastTouch.x)*.006;pitch-=(e.clientY-lastTouch.y)*.006;pitch=Math.max(-1.2,Math.min(1.2,pitch));lastTouch={x:e.clientX,y:e.clientY}}});
renderer.domElement.addEventListener("pointerup",e=>{if(e.pointerId===lookId){lookId=null;lastTouch=null}});
document.getElementById("fire").onclick=shoot;document.getElementById("punch").onclick=melee;document.getElementById("slide").onclick=beginSlide;document.getElementById("aim").onpointerdown=()=>setAim(true);document.getElementById("aim").onpointerup=()=>setAim(false);document.getElementById("jump").onclick=()=>{if(onGround)vy=5.5};
let vy=0,onGround=true,sliding=false,slideUntil=0,lastSlide=0,slideDir={x:0,z:-1};
function beginSlide(){if(!started||sliding||Date.now()-lastSlide<1100)return;lastSlide=Date.now();sliding=true;slideUntil=Date.now()+560;slideDir={x:-Math.sin(yaw),z:-Math.cos(yaw)};}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);const smooth=1-Math.exp(-dt*15);for(const remote of players.values()){remote.mesh.position.lerp(new THREE.Vector3(remote.target.x,remote.target.y,remote.target.z),smooth);const da=Math.atan2(Math.sin(remote.targetYaw-remote.mesh.rotation.y),Math.cos(remote.targetYaw-remote.mesh.rotation.y));remote.mesh.rotation.y+=da*smooth;}if(started){camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;
const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0)-mobileMove.y,side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+mobileMove.x;const speed=sliding?0:6;const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);camera.position.x+=(fx*forward+rx*side)*speed*dt;camera.position.z+=(fz*forward+rz*side)*speed*dt;
if(sliding){camera.position.x+=slideDir.x*13*dt;camera.position.z+=slideDir.z*13*dt;if(Date.now()>=slideUntil)sliding=false}
const targetY=sliding?1.05:1.7;camera.position.y+=(targetY-camera.position.y)*Math.min(1,dt*18);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-43,43);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-43,43);
if(keys.Space&&onGround){vy=5.5;onGround=false}vy-=15*dt;camera.position.y+=vy*dt;if(camera.position.y<targetY){camera.position.y=targetY;vy=0;onGround=true}
if(Date.now()-lastMove>50){lastMove=Date.now();socket.emit("move",{x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw,pitch})}
gun.position.y=-.02+Math.sin(performance.now()*.008)*.006;
}renderer.render(scene,camera)}
animate();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
