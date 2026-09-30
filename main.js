import * as THREE from 'three';
import * as SH from './shaders.js';
THREE.ColorManagement.enabled=false; // hex colours are used as-is in shaders

/* ======================= PERFORMANCE SCORE (guide only - NEVER automatic) =======================
 Each CTRL press = stageIndex++. Times are rehearsal hints shown in the debug HUD.
 00:00 FLOW FIELD        long coloured lines enter from outside the screen
 00:24 -> FLOCKING       lines become birds (birds inherit line-agent positions); orange bg, dark birds
 CTRL  one bird orange, black bg        CTRL  back to orange bg + dark flock
 00:49 -> PHYSARUM       red bg, white/yellow growth bursting from the birds, camera pulls back
 01:14 -> FLOW FIELD     birds circle in a swirling current; orange Physarum "fire" background; camera moves in
 01:40 -> MULTI PHYSARUM climax, 4 layers, mouse drag draws attractant into the trail
 02:04 -> MELTDOWN       growth drips downward, bg -> black, camera follows
 CTRL  new flow-field agents enter over the Physarum
 02:29 -> FLOCKING       yellow bg, dark flock, red Physarum grows from centre
 CTRL  birds leave, red takes over        CTRL  yellow flow lines + orange Physarum
 CTRL  black, one still orange bird (hold as long as you like)
 Keys: CTRL next stage | D debug | F fullscreen | R restart | Z / X (hold) scatter / tighten flock | drag = stir the flow (right-drag in the climax, where left-drag draws)
================================================================================================ */
const W=48,TR=1536,AG=768,NB=SH.NB;           // world size, trail resolution, agent grid (AG*AG agents), bird grid
const ALL=[1,1,1,1];
// Stage parameters (all lerped smoothly). Non-listed keys use D. tc = transition seconds, ctc = camera zoom seconds.
// seed:[mode,mask] 1=agents burst from birds 2=from centre 3=ring outside screen (released gradually, rel seconds)
// seedB:1 = birds inherit agent positions.  wF/wP/dep are per species (4 paint layers).
const D={bg:'#000000',pal:['#8a0f08','#f2560e','#ffc21a','#fff1cc'],dep:[0,0,0,0],wF:[0,0,0,0],wP:[0,0,0,0],spd:1.4,dec:.97,blur:.5,gain:1.6,
 birdA:0,others:1,one:0,birdCol:'#0c0605',flockW:1,flowB:.5,swirl:0,camSpd:.03,camV:0,camZ:20,drift:0,draw:0,flap:1,freeze:0,leave:0,bias:0,marble:.6,sa:.6,sd:12,flapSpd:1};
const PH={pal:['#fff1cc','#ffb020','#ff7a12','#8a0f08'],dep:[.3,.3,.3,.3],wP:[1,1,1,1],wF:[.04,.04,.04,.04],dec:.95,blur:.6,gain:1.9};
const Y={...PH,bg:'#f2b705',pal:['#fff1cc','#ffc21a','#ff7a12','#c40d0d'],dep:[0,0,0,.5],wP:[0,0,0,1],wF:[0,0,0,0],birdA:1,camZ:20,ctc:8,tc:3,spd:1.1,flapSpd:.8,sa:.45,sd:13};
const stages=[
 {name:'FLOW LINES',mode:'FLOW FIELD',at:0,seed:[3,ALL],rel:22,dep:[.35,.35,.3,.25],wF:[1,1,1,1],dec:.993,blur:.06,gain:1.5,marble:.9,tc:1},
 {name:'LINES BECOME PELICANS',mode:'FLOCKING',at:24,seedB:1,bg:'#e0620c',birdA:1,flapSpd:.8,dec:.9,tc:4},
 {name:'ONE ORANGE BIRD',mode:'FLOCKING',at:34,bg:'#040203',birdA:1,others:.03,one:1,freeze:1,flap:0,tc:.8},
 {name:'FLOCK RETURNS',mode:'FLOCKING',at:42,bg:'#e0620c',birdA:1,flapSpd:1.1,tc:1},
 {name:'PHYSARUM EXPLOSION',mode:'PHYSARUM',at:49,seed:[1,ALL],...PH,bg:'#a80f0d',pal:['#ffffff','#ffd21f','#ff8a1f','#fff0c8'],spd:1.5,dec:.945,sa:.35,sd:14,camZ:46,ctc:22,tc:2.5},
 {name:'BIRD FLOW / MANDALA',mode:'FLOW FIELD + PHYSARUM',at:74,seedB:1,...PH,bg:'#b8340b',pal:['#ffe9b0','#ffb020','#ff7a12','#6e0a06'],dep:[.22,.26,.3,.2],wF:[.3,.3,.3,.3],wP:[.9,.9,.9,.9],swirl:.55,spd:1.6,blur:.55,birdA:1,flockW:.5,flowB:1.3,flapSpd:1.5,sa:.85,sd:9,camZ:11,ctc:40,camSpd:.05,tc:3},
 {name:'CLIMAX / MULTI PHYSARUM',mode:'PHYSARUM (4 layers)',at:100,...PH,bg:'#c4380e',pal:['#fffaf0','#ffd23a','#ff8a1e','#a81a08'],dep:[.38,.32,.32,.32],wF:[.05,.05,.05,.05],swirl:.25,gain:2,draw:1,sa:.5,sd:11,marble:.9,camZ:22,ctc:14,tc:3},
 {name:'MELTDOWN',mode:'PHYSARUM',at:124,...PH,bg:'#050202',drift:1.3,camV:2.3,sa:.3,sd:16,camZ:18,ctc:10,tc:6},
 {name:'FLOW AGENTS ENTER',mode:'FLOW FIELD + PHYSARUM',at:136,seed:[3,[1,1,0,0]],rel:15,...PH,bg:'#050202',wF:[1,1,.04,.04],wP:[0,0,1,1],drift:1.3,camV:2.3,camZ:18,tc:4},
 {name:'YELLOW FLOCK',mode:'FLOCKING + PHYSARUM',at:149,seedB:1,seed:[2,[0,0,0,1]],...Y},
 {name:'BIRDS LEAVE / RED TAKES OVER',mode:'PHYSARUM',at:158,...Y,leave:1,bg:'#a80b0b',dep:[0,0,0,.9],gain:2.4,tc:16},
 {name:'YELLOW LINES / ORANGE GROWTH',mode:'FLOW FIELD + PHYSARUM',at:166,seed:[3,[1,1,0,0]],rel:14,...PH,pal:['#ffd21f','#fff1c9','#ff7a12','#c40d0d'],bg:'#7d0a08',dep:[.3,.25,.32,.12],wF:[1,1,.04,.04],wP:[0,0,1,1],birdA:1,seedB:2,brel:20,flowB:.6,flockW:.6,bias:.8,flapSpd:1.2,sa:.7,sd:10,tc:3},
 {name:'ONE ORANGE BIRD (FINAL)',mode:'STILL',at:174,bg:'#000000',birdA:1,others:0,one:1,freeze:1,flap:0,dec:.7,tc:.5},
];

// ---- param helpers: build() makes a fresh param set, lerpP() eases P toward the target T
const build=s=>{const o={...D,...s},r={};for(const k in D){const v=o[k];r[k]=typeof v=='number'?v:typeof v=='string'?new THREE.Color(v):v.map(x=>typeof x=='string'?new THREE.Color(x):x)}return r};
const clone=p=>{const r={};for(const k in p){const v=p[k];r[k]=typeof v=='number'?v:v.isColor?v.clone():v.map(x=>x.isColor?x.clone():x)}return r};
const SNAP=['camZ','leave','freeze']; // not blended: camera eases on its own, leave/freeze switch instantly
const mixP=(o,a,b,e)=>{for(const key in b){if(SNAP.includes(key))continue;const y=b[key];
 if(typeof y=='number')o[key]=a[key]+(y-a[key])*e;else if(y.isColor)o[key].lerpColors(a[key],y,e);
 else y.forEach((v,i)=>v.isColor?o[key][i].lerpColors(a[key][i],v,e):(o[key][i]=a[key][i]+(v-a[key][i])*e))}};

// ---- renderer + GPU plumbing
const renderer=new THREE.WebGLRenderer({antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.autoClear=false;
document.body.appendChild(renderer.domElement);
const mkRT=(w,h,type,f)=>new THREE.WebGLRenderTarget(w,h,{type,minFilter:f,magFilter:f,depthBuffer:false,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping});
const pp=(w,h,type,f)=>{const a=[mkRT(w,h,type,f),mkRT(w,h,type,f)];return{a,get r(){return a[0].texture},get w(){return a[1]},swap(){a.reverse()}}};
const trail=pp(TR,TR,THREE.HalfFloatType,THREE.LinearFilter),agents=pp(AG,AG,THREE.FloatType,THREE.NearestFilter),birds=pp(NB,NB,THREE.FloatType,THREE.NearestFilter);
const qScene=new THREE.Scene(),qCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));qScene.add(quad);
const pass=(m,t)=>{quad.material=m;renderer.setRenderTarget(t);renderer.render(qScene,qCam)};
const shared={uT:{value:0},uSwirl:{value:0},uStir:{value:new THREE.Vector4()},uStirV:{value:new THREE.Vector2()}};
const U=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{value:v}]));
const mat=(fs,u)=>new THREE.ShaderMaterial({vertexShader:SH.VS_QUAD,fragmentShader:fs,uniforms:{...shared,...U(u)}});
const V4=()=>new THREE.Vector4();
const agentM=mat(SH.AGENT_FS,{uAg:null,uTrail:null,uBirds:null,uR:TR,uSpd:1,uEn:0,uRel:0,uSeed:0,uDrift:0,uSD:12,uSA:.6,uWF:V4(),uWP:V4(),uMask:V4(),uPark:V4(),uC:new THREE.Vector2(.5,.5)});
const diffM=mat(SH.DIFFUSE_FS,{uTrail:null,uR:TR,uBlur:.5,uDec:.95,uBrush:0,uM0:new THREE.Vector2(),uM1:new THREE.Vector2()});
const boidM=mat(SH.BOID_FS,{uB:null,uAg:null,uDt:1/60,uSp:5,uFW:1,uFB:.15,uSeed:0,uFrz:0,uLeave:0,uMW:.8,uBias:0,uBRel:1,uCoh:1,uSepM:1,uC:new THREE.Vector2(),uMouse:new THREE.Vector2()});
const postM=mat(SH.POST_FS,{uS:null,uPulse:0,uRes:new THREE.Vector2(1,1)});
// deposit: every agent drawn as a point, additively, into the trail
const ref=new Float32Array(AG*AG*2);for(let i=0;i<AG*AG;i++){ref[2*i]=((i%AG)+.5)/AG;ref[2*i+1]=(Math.floor(i/AG)+.5)/AG}
const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(AG*AG*3),3));dg.setAttribute('aRef',new THREE.BufferAttribute(ref,2));
const depM=new THREE.ShaderMaterial({vertexShader:SH.DEPOSIT_VS,fragmentShader:SH.DEPOSIT_FS,uniforms:{...shared,...U({uAg:null,uRel:0,uPulse:0,uMarble:.6,uDep:V4(),uPark:V4()})},
 blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,depthTest:false,transparent:true});
const depScene=new THREE.Scene(),pts=new THREE.Points(dg,depM);pts.frustumCulled=false;depScene.add(pts);

// ---- visible scene: paint plane + instanced birds, seen by the ever-rotating camera
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,500);cam.position.z=20;
const planeM=new THREE.ShaderMaterial({vertexShader:SH.PLANE_VS,fragmentShader:SH.PLANE_FS,uniforms:U({uTrail:null,uBg:new THREE.Color(),uPal:[new THREE.Color(),new THREE.Color(),new THREE.Color(),new THREE.Color()],uGain:1.6})});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(W*9,W*9),planeM));
const pl=new THREE.PlaneGeometry(1,1),bg=new THREE.InstancedBufferGeometry();bg.index=pl.index;bg.setAttribute('position',pl.attributes.position);bg.instanceCount=NB*NB;
const refB=new Float32Array(NB*NB*2);for(let i=0;i<NB*NB;i++){refB[2*i]=((i%NB)+.5)/NB;refB[2*i+1]=(Math.floor(i/NB)+.5)/NB}
bg.setAttribute('aRef',new THREE.InstancedBufferAttribute(refB,2));
const birdM=new THREE.ShaderMaterial({vertexShader:SH.BIRD_VS,fragmentShader:SH.BIRD_FS,uniforms:{...shared,...U({uB:null,uSize:3.2,uFrz:0,uC:new THREE.Vector2(),uFT:0,uFlap:1,uA:0,uOth:1,uOne:0,uCol:new THREE.Color()})},transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
const birdMesh=new THREE.Mesh(bg,birdM);birdMesh.frustumCulled=false;birdMesh.renderOrder=1;scene.add(birdMesh);
const sceneRT=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
function resize(){renderer.setSize(innerWidth,innerHeight);const s=new THREE.Vector2();renderer.getDrawingBufferSize(s);sceneRT.setSize(s.x,s.y);postM.uniforms.uRes.value.copy(s);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();

// ---- audio: subtle energy + onset pulse only. It NEVER changes stage.
const audio=new Audio('assets/song.mp3');
let actx,an,fbuf,en=0,pulse=0,avg=0,lastB=-9;
function initAudio(){actx=new AudioContext();const src=actx.createMediaElementSource(audio);an=actx.createAnalyser();an.fftSize=1024;an.smoothingTimeConstant=.15;src.connect(an);an.connect(actx.destination);fbuf=new Uint8Array(an.frequencyBinCount)}
let slow=0,prevLow=0,low=0,beats=0;
function readAudio(dt){if(!an)return;an.getByteFrequencyData(fbuf);let s=0;for(let i=1;i<10;i++)s+=fbuf[i]; // ~45-400 Hz: kick/bass region
 low=s/9/255;en+=(low-en)*.1;slow+=(low-slow)*Math.min(1,dt*2.5);            // slow = running average of the bass energy
 const rising=low>prevLow;prevLow=low;
 if(rising&&low>slow*1.12+.02&&audio.currentTime-lastB>.4){pulse=1;lastB=audio.currentTime;beats++} // onset = bass jumps above its own average (~77 BPM => beats ~0.78s apart)
 pulse*=Math.exp(-dt*4)}

// ---- stage manager
let stage=0,P=build(stages[0]),T=build(stages[0]),tc=1,ctc=8,camZs=20,rotZ=0,t=0,flapT=0,A=clone(P),tr=1,coh=1,sepM=1;const held={};
const S={seed:0,mask:[1,1,1,1],seedB:0,brel:1,brelT:18,rel:0,relT:20};
function enter(i){stage=i;const s=stages[i];A=clone(P);tr=0;T=build(s);tc=s.tc||2;ctc=s.ctc||8;P.leave=T.leave;P.freeze=T.freeze; // behavioural switches act immediately
 if(s.seed){S.seed=s.seed[0];S.mask=s.seed[1];if(s.seed[0]==3){S.rel=0;S.relT=s.rel||15}}
 S.seedB=s.seedB||0;S.brel=s.seedB==2?0:1;S.brelT=s.brel||18} // seedB 2 = birds enter gradually from outside
function restart(){for(const p of [trail,agents,birds])for(const r of p.a){renderer.setRenderTarget(r);renderer.setClearColor(0,0);renderer.clear()}
 P=build(stages[0]);camZs=20;enter(0);P=build(stages[0]);tr=1;audio.currentTime=0;if(audio.paused)audio.play().catch(()=>{})}

// ---- input: CTRL advances. Mouse drags paint into the trail (climax) and attracts birds.
const camC=new THREE.Vector2();
const M={x:0,y:0,down:0,right:0,amt:0,pw:new THREE.Vector2(),sv:new THREE.Vector2(),u:new THREE.Vector2(.5,.5),u0:new THREE.Vector2(.5,.5),w:new THREE.Vector2()};
addEventListener('pointermove',e=>{M.x=e.clientX/innerWidth*2-1;M.y=-(e.clientY/innerHeight*2-1)});
addEventListener('pointerdown',e=>{if(e.button===2)M.right=1;else M.down=1});addEventListener('pointerup',()=>{M.down=0;M.right=0});addEventListener('contextmenu',e=>e.preventDefault());
let started=false,dbg=false;
addEventListener('keydown',e=>{
 if(e.key==='Control'&&!e.repeat&&started&&stage<stages.length-1)enter(stage+1);
 else if(e.key==='d'||e.key==='D'){dbg=!dbg;hud.style.display=dbg?'block':'none'}
 else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}
 else if((e.key==='r'||e.key==='R')&&started)restart()});
addEventListener('keydown',e=>{held[e.key.toLowerCase()]=1});addEventListener('keyup',e=>{held[e.key.toLowerCase()]=0});
const hud=document.getElementById('hud'),fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
let fps=60;

// ---- one fixed simulation step (60 Hz)
function simStep(dt){
 shared.uT.value=t;shared.uSwirl.value=P.swirl;
 const bu=boidM.uniforms;bu.uB.value=birds.r;bu.uAg.value=agents.r;bu.uDt.value=dt;bu.uSp.value=5*(1+.2*en);bu.uFW.value=P.flockW;bu.uFB.value=P.flowB;
 bu.uBias.value=P.bias;bu.uBRel.value=S.brel;bu.uCoh.value=coh;bu.uSepM.value=sepM;bu.uC.value.copy(camC);bu.uSeed.value=S.seedB;bu.uFrz.value=P.freeze;bu.uLeave.value=P.leave;bu.uMouse.value.copy(M.w);
 pass(boidM,birds.w);birds.swap();S.seedB=0;
 const au=agentM.uniforms;au.uAg.value=agents.r;au.uTrail.value=trail.r;au.uBirds.value=birds.r;au.uSpd.value=P.spd;au.uEn.value=en;
 au.uC.value.set(camC.x/W+.5,camC.y/W+.5);au.uSD.value=P.sd;au.uSA.value=P.sa;au.uRel.value=S.rel;au.uSeed.value=S.seed;au.uDrift.value=P.drift;au.uWF.value.fromArray(P.wF);au.uWP.value.fromArray(P.wP);
 au.uMask.value.fromArray(S.mask);au.uPark.value.fromArray(S.rel<1?S.mask:[0,0,0,0]);
 pass(agentM,agents.w);agents.swap();S.seed=0;
 const du=diffM.uniforms;du.uTrail.value=trail.r;du.uBlur.value=P.blur;du.uDec.value=P.dec;du.uBrush.value=(M.down&&P.draw>.5)?.9:0;
 du.uM0.value.copy(M.u0);du.uM1.value.copy(M.u);
 pass(diffM,trail.w);
 const dp=depM.uniforms;dp.uAg.value=agents.r;dp.uRel.value=S.rel;dp.uPulse.value=pulse;dp.uMarble.value=P.marble;dp.uDep.value.fromArray(P.dep);dp.uPark.value.fromArray(S.rel<1?S.mask:[0,0,0,0]);
 renderer.setRenderTarget(trail.w);renderer.render(depScene,qCam);trail.swap();
 S.rel=Math.min(1,S.rel+dt/S.relT);S.brel=Math.min(1,S.brel+dt/S.brelT)}

let last=performance.now(),acc=0;
function frame(now){requestAnimationFrame(frame);
 const dt=Math.min((now-last)/1000,.1);last=now;t+=dt;fps+=(1/Math.max(dt,1e-3)-fps)*.05;readAudio(dt);
 tr=Math.min(1,tr+dt/(tc*2));mixP(P,A,T,tr*tr*(3-2*tr)); // ease in AND out
 const ct=held.x?[3,.8]:held.z?[-.8,2.2]:[1,1];coh+=(ct[0]-coh)*(1-Math.exp(-dt*4));sepM+=(ct[1]-sepM)*(1-Math.exp(-dt*4)); // Z scatter / X tighten
 camZs+=(T.camZ-camZs)*(1-Math.exp(-dt/ctc));flapT+=dt*(1+.4*en)*P.flapSpd;
 // camera: ALWAYS turns the picture counter-clockwise (camera roll decreases); never reset between stages
 rotZ-=P.camSpd*dt*(1+.2*en);
 cam.rotation.set(.11*Math.sin(t*.11),.09*Math.sin(t*.083+1.3),rotZ); // 2nd axis: slow sway/tilt on top of the endless CCW roll
 cam.position.z=camZs*(1-.012*pulse);cam.position.x+=Math.sin(rotZ)*P.camV*dt;cam.position.y-=Math.cos(rotZ)*P.camV*dt;
 cam.updateMatrixWorld();
 const fw=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion),kc=-cam.position.z/fw.z;camC.set(cam.position.x+fw.x*kc,cam.position.y+fw.y*kc); // world point at screen centre
 // mouse -> world point on z=0
 const v=new THREE.Vector3(M.x,M.y,.5).unproject(cam).sub(cam.position).normalize(),k=-cam.position.z/v.z;
 M.w.set(cam.position.x+v.x*k,cam.position.y+v.y*k);M.u.set(M.w.x/W+.5,M.w.y/W+.5);
 if(!M.down)M.u0.copy(M.u);
 // flow stirring: drag (right-drag in the climax, where left-drag draws) bends the field around the cursor
 const stirOn=(M.right||(M.down&&P.draw<.5))?1:0;M.amt+=(stirOn-M.amt)*(1-Math.exp(-dt*6));
 M.sv.lerp(new THREE.Vector2().subVectors(M.w,M.pw).divideScalar(Math.max(dt,1e-3)*25),.25);if(M.sv.length()>1)M.sv.normalize();M.pw.copy(M.w);
 shared.uStir.value.set(M.w.x,M.w.y,M.amt,7);shared.uStirV.value.copy(M.sv);
 if(started){acc+=dt;let n=0;while(acc>1/60&&n++<3){simStep(1/60);acc-=1/60}}
 M.u0.copy(M.u);
 const pu=planeM.uniforms;pu.uTrail.value=trail.r;pu.uBg.value.copy(P.bg);pu.uGain.value=P.gain;pu.uPal.value=P.pal;
 const b=birdM.uniforms;b.uB.value=birds.r;b.uFrz.value=P.freeze;b.uC.value.copy(camC);b.uFT.value=flapT;b.uFlap.value=P.flap;b.uA.value=Math.min(1,P.birdA);b.uOth.value=P.others;b.uOne.value=P.one;b.uCol.value.copy(P.birdCol);
 renderer.setRenderTarget(sceneRT);renderer.clear();renderer.render(scene,cam);
 postM.uniforms.uS.value=sceneRT.texture;postM.uniforms.uPulse.value=pulse;pass(postM,null);
 if(dbg){const s=stages[stage],nx=stages[stage+1];
  hud.textContent=`SONG TIME: ${fmt(audio.currentTime)}\nSTAGE: ${stage+1} / ${stages.length}\nCURRENT MODE: ${s.mode}\nNEXT CTRL: ${nx?fmt(nx.at):'--'}\nAGENTS: ${AG*AG} + ${NB*NB} birds\n\nCURRENT:\n${fmt(s.at)} - ${s.name}\nNEXT:\n${nx?fmt(nx.at)+' - '+nx.name:'(hold the final image)'}\n\nPRESS CTRL TO ADVANCE\n\nFPS ${fps.toFixed(0)}  TRAIL ${TR}^2  ENERGY ${en.toFixed(2)}  BASS ${low.toFixed(2)}  BEAT ${pulse.toFixed(2)}  BEATS ${beats}  COHESION ${coh.toFixed(1)}`}}

document.getElementById('start').addEventListener('click',e=>{
 initAudio();actx.resume();audio.play().catch(err=>console.warn('assets/song.mp3 could not play',err));
 e.currentTarget.style.display='none';started=true;enter(0);P=build(stages[0]);tr=1;requestAnimationFrame(n=>{last=n})});
requestAnimationFrame(frame);