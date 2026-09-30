/* ALL SHADERS. Agent perception/action/emergence is documented above each algorithm.
   World = 48x48 units, toroidal (wraps). Trail texture uv = world/48 + .5 */

export const NB=28; // bird grid: NB*NB birds (change here only)
export const VS_QUAD=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

const NOISE=`
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p,float P){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 a=mod(i,P),b=mod(i+1.,P);
 return mix(mix(h21(a),h21(vec2(b.x,a.y)),f.x),mix(h21(vec2(a.x,b.y)),h21(b),f.x),f.y);}`;

/* FLOW FIELD (Hobbs-style): a smooth, periodic angle field. uSwirl blends in a tangential
   current around the centre (mandala). Every agent only ever samples the vector at its own position. */
const FIELD=`uniform float uT,uSwirl;uniform vec4 uStir;uniform vec2 uStirV;
vec2 fieldDir(vec2 w){vec2 q=w/48.+.5;
 float a=(vn(q*6.+vec2(0.,uT*.05),6.)*.75+vn(q*12.-vec2(uT*.08,0.),12.)*.25)*12.57;
 vec2 f=vec2(cos(a),sin(a)),t=normalize(vec2(-w.y,w.x)+1e-3),dir=mix(f,t,uSwirl);
 if(uStir.z>.01){vec2 d=w-uStir.xy;d-=48.*floor(d/48.+.5);float r=length(d),g=exp(-r*r/(uStir.w*uStir.w)); // the performer stirs the current:
  dir+=(vec2(-d.y,d.x)/(r+.5)*.8+uStirV)*uStir.z*g*2.5;}                                                      // a vortex + a push along the hand
 return normalize(dir+1e-4);}`;

/* AGENTS (one population of ~590k, species k = 0..3 = trail channel / paint layer).
   PERCEPTION  flow: the field vector at its own position.  physarum: trail value at 3 sensors
               (front, front-left, front-right, distance uSD px). Own species attracts, others repel (.4).
               Everything farther than the sensors is invisible to it.
   FORCES      (1) flow steering = (fieldDir*speed - velocity), clamped, weighted by wF[species]
               (2) physarum turn = +/- ta rotation toward the stronger sensor, weighted by wP[species]
   EMERGENCE   flow only -> long coherent streamlines; physarum only -> deposit/sense feedback ->
               branching networks; both -> marbled, current-bent growth. Species weights let both coexist. */
export const AGENT_FS=NOISE+FIELD+`
uniform sampler2D uAg,uTrail,uBirds;uniform float uR,uSpd,uEn,uRel,uSeed,uDrift,uSD,uSA;
uniform vec4 uWF,uWP,uMask,uPark;uniform vec2 uC;varying vec2 vUv;
float sense(vec2 q,vec4 m){vec4 t=texture2D(uTrail,q);float o=dot(t,m);return o-.4*(t.x+t.y+t.z+t.w-o);}
void main(){
 vec4 s=texture2D(uAg,vUv);vec2 p=s.xy,v=s.zw;
 float hs=h21(vUv*13.1),hr=h21(vUv*5.7+3.),k=floor(hs*4.);
 vec4 m=step(abs(vec4(0,1,2,3)-k),vec4(.5));
 float spd=uSpd*(.6+.8*hr)*(1.+.35*uEn)*(1.+1.2*dot(m,uWF));
 if(uSeed>.5&&dot(m,uMask)>.5){
  float a=h21(vUv+uT)*6.2832;vec2 d=vec2(cos(a),sin(a));
  if(uSeed<1.5){p=fract(texture2D(uBirds,(floor(vUv*${NB}.)+.5)/${NB}.).xy/48.+.5+d*.003*hr);v=d*spd;}   // burst from birds
  else if(uSeed<2.5){p=fract(uC+d*.02*hr);v=d*spd;}                                                 // from centre
  else{p=fract(uC+d*.47);v=-d*spd;}                                                                  // ring outside screen
 }
 if(uRel<1.&&hr>uRel&&dot(m,uPark)>.5){gl_FragColor=vec4(p,v);return;} // parked outside until released
 vec2 w=(p-.5)*48.;
 vec2 st=fieldDir(w)*spd-v;float l=length(st);st*=min(l,.3)/max(l,1e-4);
 v+=st*dot(m,uWF);
 float an=atan(v.y,v.x),sa=uSA,ta=.4;
 float fc=sense(p+vec2(cos(an),sin(an))*uSD/uR,m);
 float fl=sense(p+vec2(cos(an+sa),sin(an+sa))*uSD/uR,m);
 float fr=sense(p+vec2(cos(an-sa),sin(an-sa))*uSD/uR,m);
 float turn=0.;
 if(fc<fl&&fc<fr)turn=(h21(vUv*3.+uT)<.5?ta:-ta);
 else if(fl>fr&&fl>fc)turn=ta;else if(fr>fl&&fr>fc)turn=-ta;
 an+=turn*dot(m,uWP);
 float sp=length(v);v=vec2(cos(an),sin(an))*mix(sp,spd,.08);
 p+=v/uR;p.y-=uDrift/uR;p=fract(p);
 gl_FragColor=vec4(p,v);}`;

/* TRAIL: diffusion + decay (persistence) + performer's brush (extra attractant written into the same trail). */
export const DIFFUSE_FS=`uniform sampler2D uTrail;uniform float uR,uBlur,uDec,uBrush;uniform vec2 uM0,uM1;varying vec2 vUv;
void main(){vec2 e=vec2(1./uR);vec4 c=texture2D(uTrail,vUv);
 vec4 b=(texture2D(uTrail,vUv+vec2(e.x,0.))+texture2D(uTrail,vUv-vec2(e.x,0.))+texture2D(uTrail,vUv+vec2(0.,e.y))+texture2D(uTrail,vUv-vec2(0.,e.y))+c)/5.;
 vec4 t=mix(c,b,uBlur)*uDec;
 if(uBrush>0.){vec2 a=vUv-uM0,d=uM1-uM0;float h=clamp(dot(a,d)/max(dot(d,d),1e-9),0.,1.);t+=vec4(smoothstep(.007,0.,length(a-d*h)))*uBrush;}
 gl_FragColor=t;}`;

/* DEPOSIT: each agent is a GL point that adds its species colour into the trail (additive). */
export const DEPOSIT_VS=NOISE+`uniform sampler2D uAg;uniform float uRel,uPulse,uT,uMarble;uniform vec4 uDep,uPark;attribute vec2 aRef;varying vec4 vC;
void main(){vec4 s=texture2D(uAg,aRef);float hs=h21(aRef*13.1),hr=h21(aRef*5.7+3.),k=floor(hs*4.);
 vec4 m=step(abs(vec4(0,1,2,3)-k),vec4(.5));
 // marbling: each agent's colour drifts between neighbouring palette layers as it travels
 float f=clamp(k+uMarble*1.4*sin(uT*.15+hr*6.28+(s.x+s.y)*9.),0.,3.);
 vec4 wt=max(1.-abs(vec4(0,1,2,3)-f),0.);
 vC=wt*dot(m,uDep)*(.5+hr)*(1.+.5*uPulse);gl_PointSize=1.+2.*hr*hr;
 bool park=uRel<1.&&hr>uRel&&dot(m,uPark)>.5;
 gl_Position=park?vec4(3.,3.,0.,1.):vec4(s.xy*2.-1.,0.,1.);}`;
export const DEPOSIT_FS=`varying vec4 vC;void main(){gl_FragColor=vC;}`;

/* FLOCKING (GPU boids, NB*NB birds; every bird loops over the others itself).
   PERCEPTION  neighbours within 4 units (separation range 1.4). Everyone else is invisible to it.
   FORCES      separation (push away, 1/d^2), alignment (match mean velocity), cohesion (toward local centre),
               + flow-field steering (uFB) + mouse attraction (performer). Summed as accelerations.
   EMERGENCE   no leader, no path: the flock is the sum of local rules. */
export const BOID_FS=NOISE+FIELD+`
uniform sampler2D uB,uAg;uniform float uDt,uSp,uFW,uFB,uSeed,uFrz,uLeave,uMW,uBias,uBRel,uCoh,uSepM;uniform vec2 uMouse,uC;varying vec2 vUv;
void main(){vec4 s=texture2D(uB,vUv);vec2 p=s.xy,v=s.zw;float sp=uSp;
 float hb=h21(vUv*9.3+1.7);
 if(uSeed>1.5){ // entrance: start OUTSIDE the screen, up-wind of the diagonal; parked until released
  vec2 dir=normalize(vec2(1.,.7)),pr=vec2(-dir.y,dir.x);
  p=uC-dir*26.+pr*(h21(vUv*3.1)*40.-20.);v=dir*sp;
 }else if(uSeed>.5){vec4 a=texture2D(uAg,vUv);p=(a.xy-.5)*48.;v=normalize(a.zw+1e-4)*sp;} // birds inherit line/growth agents
 if(uBRel<1.&&hb>uBRel){gl_FragColor=vec4(p,v);return;} // not released yet: waits off-screen
 vec2 sep=vec2(0),ali=vec2(0),coh=vec2(0);float n=0.;
 for(int j=0;j<${NB*NB};j++){vec2 uv=(vec2(mod(float(j),${NB}.),floor(float(j)/${NB}.))+.5)/${NB}.;vec4 o=texture2D(uB,uv);
  vec2 d=o.xy-p;d-=48.*floor(d/48.+.5);float l=length(d);
  if(l>.001&&l<4.){ali+=o.zw;coh+=d;n+=1.;if(l<1.4)sep-=d/(l*l);}}
 vec2 a=sep*6.*uFW*uSepM;
 if(n>0.){a+=(normalize(ali+1e-4)*sp-v)*2.5*uFW;a+=(normalize(coh+1e-4)*sp-v)*.8*uFW*uCoh;}
 a+=(fieldDir(p)*sp-v)*uFB*3.;
 a+=(normalize(vec2(1.,.7))*sp-v)*uBias*3.; // diagonal drift (stage 'yellow lines')
 vec2 dm=uMouse-p;float dl=length(dm);if(uMW>0.&&dl<12.)a+=normalize(dm)*sp*.9*(1.-dl/12.)*uMW;
 if(uLeave>.5)a+=normalize(p+1e-3)*40.;
 v+=a*uDt;float l=length(v);sp*=1.+uLeave;v*=clamp(l,.6*sp,1.15*sp)/max(l,1e-4);
 p+=v*uDt;bool fz=uFrz>.5&&distance(vUv,vec2(.5/${NB}.))<.001;
 if(uLeave<.5&&!fz){vec2 dd=p-uC;p=uC+dd-48.*floor(dd/48.+.5);} // flock world wraps around the camera
 if(fz){p=mix(p,uC,.2);v=mix(normalize(v),vec2(0.,1.),.1)*.001;} // lone bird: frozen at screen centre
 if(!(abs(p.x)<1e4&&abs(p.y)<1e4&&abs(v.x)<1e4&&abs(v.y)<1e4)){p=uC;v=vec2(0.,sp);} // NaN guard
 gl_FragColor=vec4(p,v);}`;

/* WORLD PLANE: turns the trail channels into paint (4 palette layers, paper grain). */
export const PLANE_VS=`varying vec2 vW;void main(){vW=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const PLANE_FS=NOISE+`uniform sampler2D uTrail;uniform vec3 uBg,uPal[4];uniform float uGain;varying vec2 vW;
void main(){vec2 q=vW/48.+.5;vec4 t=1.-exp(-texture2D(uTrail,q)*uGain);
 float g=vn(q*300.,300.)*.5+vn(q*900.,900.)*.5;
 vec3 c=uBg*(.93+.14*g);
 for(int i=0;i<4;i++)c=mix(c,uPal[i]*(.88+.24*g),clamp(t[i],0.,1.));
 gl_FragColor=vec4(c,1.);}`;

/* BIRDS: instanced quads; the silhouette is a rough-edged paper cut-out built from triangles in the fragment shader. */
export const BIRD_VS=NOISE+FIELD+`uniform sampler2D uB;uniform float uSize,uFrz;uniform vec2 uC;attribute vec2 aRef;varying vec2 vP;varying float vOne,vH,vG;
void main(){vec4 s=texture2D(uB,aRef);
 vOne=step(distance(aRef,vec2(.5/${NB}.)),.001);
 if(vOne>.5&&uFrz>.5){s.xy=uC;s.zw=vec2(0.,1.);} // the lone orange bird is drawn exactly at screen centre, pointing up
 vG=smoothstep(.3,1.,dot(normalize(s.zw+1e-5),fieldDir(s.xy))); // riding the current -> glide, fighting it -> flap
 float a=atan(s.w,s.z);vec2 l=position.xy*uSize;float c=cos(a),n=sin(a);
 vec2 w=s.xy+vec2(c*l.x-n*l.y,n*l.x+c*l.y);
 vP=position.xy*2.;vH=h21(aRef*17.);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(w,.02+vH*.01,1.);}`;
export const BIRD_FS=NOISE+`uniform float uFT,uFlap,uA,uOth,uOne;uniform vec3 uCol;varying vec2 vP;varying float vOne,vH,vG;
float cr(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
float tri(vec2 p,vec2 a,vec2 b,vec2 c){float s1=cr(b-a,p-a),s2=cr(c-b,p-b),s3=cr(a-c,p-c);
 return float((s1>=0.&&s2>=0.&&s3>=0.)||(s1<=0.&&s2<=0.&&s3<=0.));}
void main(){
 vec2 p=vP+(vec2(vn(vP*7.+vH*40.,64.),vn(vP*7.+9.+vH*40.,64.))-.5)*.09;
 float f=sin(uFT*(2.+vH*1.5)+vH*6.28)*uFlap*(1.-.75*vG);
 float m=step(length(vec2(p.x/.5,p.y/.14)),1.);
 m=max(m,step(length(p-vec2(.4,0.)),.11));
 m=max(m,tri(p,vec2(.4,.07),vec2(.4,-.07),vec2(.98,-.02)));
 m=max(m,tri(p,vec2(-.4,.08),vec2(-.4,-.08),vec2(-.75,0.)));
 for(int i=0;i<2;i++){float s=i==0?1.:-1.;
  vec2 tip=vec2(-.35-.25*abs(f),s*(.95-.3*abs(f))),tip2=vec2(-.75,s*(.6-.2*abs(f)));
  m=max(m,tri(p,vec2(.3,s*.1),vec2(-.25,s*.1),tip));m=max(m,tri(p,vec2(0.,s*.1),vec2(-.55,s*.1),tip2));}
 vec3 col=uCol*(.8+.4*vn(p*11.,64.));col+=vec3(.16,.04,0.)*step(.6,vn(p*5.+vH*10.,64.));
 float o=vOne*uOne;
 col=mix(col,vec3(1.,.42,.03)*(.85+.3*vn(p*9.,64.))+vec3(0.,.25,0.)*step(.5,vn(p*6.,64.)),o);
 float al=m*uA*mix(uOth,1.,vOne);if(al<.02)discard;gl_FragColor=vec4(col,al);}`;

/* POST: subtle liquid distortion, cheap 12-tap bloom, grade, vignette, grain. */
export const POST_FS=NOISE+`uniform sampler2D uS;uniform float uT,uPulse;uniform vec2 uRes;varying vec2 vUv;
void main(){vec2 uv=vUv+.0025*vec2(sin(vUv.y*8.+uT*.4),cos(vUv.x*6.+uT*.3))*(1.+uPulse);
 vec3 c=texture2D(uS,uv).rgb,b=vec3(0.);
 for(int i=0;i<12;i++){float a=float(i)*2.4,r=sqrt(float(i)+.5)*.0035;
  b+=texture2D(uS,uv+vec2(cos(a)*uRes.y/uRes.x,sin(a))*r).rgb;}
 b=max(b/12.-.55,0.);c+=b*.9;
 c=pow(max(c,0.),vec3(1.,1.08,1.25));
 c=mix(vec3(dot(c,vec3(.3,.6,.1))),c,1.15);
 float v=smoothstep(1.05,.35,length((vUv-.5)*vec2(uRes.x/uRes.y,1.)));c*=mix(.55,1.,v);
 c+=(h21(vUv*uRes+uT)-.5)*.07;
 gl_FragColor=vec4(c,1.);}`;