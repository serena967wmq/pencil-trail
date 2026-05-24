/*
 * pencil-trail.js
 * ---------------------------------------------------------------------------
 * A side-of-pencil graphite cursor trail for the browser.
 *   • the cursor IS the nib — the sharp/dark edge sits on the cursor
 *   • feathers to one side into faint grain (asymmetric, like a soft 6B pencil)
 *   • velocity-aware width + head-dark -> tail-light fade
 *   • one continuous arc-length pass (no beads / legs / tadpoles)
 *   • getCoalescedEvents() + Catmull-Rom + streamline keep fast strokes smooth
 *
 * USAGE (ES module):
 *     import { PencilTrail } from './pencil-trail.js';
 *     const trail = new PencilTrail();              // attaches a full-window canvas
 *     // ...later, to remove it:
 *     // trail.destroy();
 *
 * USAGE (plain script tag): include this file, then:
 *     <script type="module">
 *       import { PencilTrail } from './pencil-trail.js';
 *       new PencilTrail({ darkMax: 0.55 });
 *     </script>
 *
 * OPTIONS (all optional) — pass an object to override any CONFIG default below.
 * ---------------------------------------------------------------------------
 */

const DEFAULTS = {
  target:      null,   // a DOM element to mount into; default = document.body (full window)
  background:  null,   // CSS colour to paint behind the trail; null = transparent overlay
  showNib:     true,   // draw the little dot at the cursor
  decay:       0.018,  // trail life lost per frame; smaller = longer trail (~0.012–0.03)
  widthMin:    3.5,    // half-width at the tail (px)
  widthMax:    10.5,   // half-width region added toward the head (px)
  darkMin:     0.16,   // ink strength at the tail
  darkMax:     0.50,   // ink strength at the head (keep < ~0.6 so the head stays airy)
  grainPerPx:  1.8,    // grains per px of half-width (tooth density)
  featherSign: 1,      // +1 or -1 : which side the grain feathers toward
  inkBase:     20,     // base grey of graphite specks (0 = black); varies +0..32
  streamline:  0.28,   // input smoothing 0..1, lower = rounder/smoother (more lag)
  step:        3,      // input resample spacing (px)
  dot:         1.4,    // arc-length spacing between grain columns (px); smaller = denser
  maxPoints:   1100,   // safety cap on stored points
  zIndex:      9999,   // canvas stacking order
};

function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export class PencilTrail {
  constructor(options = {}) {
    this.cfg = Object.assign({}, DEFAULTS, options);
    const mount = this.cfg.target || document.body;

    // visible canvas
    this.vis = document.createElement('canvas');
    Object.assign(this.vis.style, {
      position:'fixed', inset:'0', display:'block',
      pointerEvents:'none', zIndex:String(this.cfg.zIndex),
    });
    if (this.cfg.background) this.vis.style.background = this.cfg.background;
    mount.appendChild(this.vis);
    this.visCtx = this.vis.getContext('2d');

    // offscreen layer
    this.ink = document.createElement('canvas');
    this.inkCtx = this.ink.getContext('2d');

    // nib dot
    if (this.cfg.showNib) {
      this.nib = document.createElement('div');
      Object.assign(this.nib.style, {
        position:'fixed', width:'8px', height:'8px', borderRadius:'50%',
        background:'#2b2b2b', opacity:'0.4', transform:'translate(-50%,-50%)',
        pointerEvents:'none', zIndex:String(this.cfg.zIndex + 1), left:'-99px', top:'-99px',
      });
      mount.appendChild(this.nib);
    }

    this.RAW = [];
    this.last = null;
    this.sm = null;

    this._resize = this._resize.bind(this);
    this._handle = this._handle.bind(this);
    this._tick = this._tick.bind(this);

    this._resize();
    this._rt = null;
    window.addEventListener('resize', () => { clearTimeout(this._rt); this._rt = setTimeout(this._resize, 150); });
    window.addEventListener('pointermove', this._handle);
    this._raf = requestAnimationFrame(this._tick);
  }

  _resize() {
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, innerWidth);
    this.H = Math.max(1, innerHeight);
    for (const c of [this.vis, this.ink]) { c.width = this.W * this.DPR; c.height = this.H * this.DPR; }
    this.vis.style.width = this.W + 'px'; this.vis.style.height = this.H + 'px';
    this.visCtx.setTransform(this.DPR,0,0,this.DPR,0,0);
    this.inkCtx.setTransform(this.DPR,0,0,this.DPR,0,0);
  }

  _add(x, y) {
    const c = this.cfg;
    if (this.nib) { this.nib.style.left = x+'px'; this.nib.style.top = y+'px'; }
    if (!this.sm) { this.sm = {x,y}; } else { this.sm.x += (x-this.sm.x)*c.streamline; this.sm.y += (y-this.sm.y)*c.streamline; }
    const sx = this.sm.x, sy = this.sm.y;
    if (this.last) {
      const dx = sx-this.last.x, dy = sy-this.last.y, d = Math.hypot(dx,dy);
      const steps = Math.max(1, Math.floor(d/c.step));
      for (let i=1;i<=steps;i++){ const t=i/steps; this.RAW.push({x:this.last.x+dx*t, y:this.last.y+dy*t, life:1}); }
    } else this.RAW.push({x:sx,y:sy,life:1});
    this.last = {x:sx,y:sy};
  }

  _handle(e) {
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const ev of evs) this._add(ev.clientX, ev.clientY);
  }

  _smooth(pts) {
    if (pts.length < 3) return pts.map(p => ({x:p.x,y:p.y,life:p.life}));
    const out = [];
    for (let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||pts[i+1];
      const segLen=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      const sub=Math.max(2,Math.round(segLen/1));
      for (let s=0;s<sub;s++){
        const t=s/sub,t2=t*t,t3=t2*t;
        const x=0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
        const y=0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
        out.push({x,y,life:p1.life+(p2.life-p1.life)*t});
      }
    }
    const lp=pts[pts.length-1]; out.push({x:lp.x,y:lp.y,life:lp.life});
    return out;
  }

  _tick() {
    const c = this.cfg, ctx = this.inkCtx;
    for (const s of this.RAW) s.life -= c.decay;
    while (this.RAW.length && this.RAW[0].life <= 0) this.RAW.shift();
    if (this.RAW.length > c.maxPoints) this.RAW.splice(0, this.RAW.length - c.maxPoints);

    ctx.setTransform(this.DPR,0,0,this.DPR,0,0);
    ctx.clearRect(0,0,this.W,this.H);

    const C = this._smooth(this.RAW);
    const n = C.length;
    if (n > 2) {
      let acc=0; const cum=[0];
      for (let i=1;i<n;i++){ acc+=Math.hypot(C[i].x-C[i-1].x,C[i].y-C[i-1].y); cum.push(acc); }
      const total = acc || 1;
      let carried = 0;
      for (let i=1;i<n;i++){
        const a=C[i-1], b=C[i];
        const segLen=Math.hypot(b.x-a.x,b.y-a.y)||0.0001;
        const ux=(b.x-a.x)/segLen, uy=(b.y-a.y)/segLen;
        const nx=-uy*c.featherSign, ny=ux*c.featherSign;
        for (let d=carried; d<segLen; d+=c.dot){
          const f=d/segLen;
          const px=a.x+(b.x-a.x)*f, py=a.y+(b.y-a.y)*f;
          const headness=(cum[i-1]+d)/total;
          const life=a.life+(b.life-a.life)*f;
          const darkBase=(c.darkMin+(c.darkMax-c.darkMin)*Math.pow(headness,0.7))*life;
          const halfW=(c.widthMin+c.widthMax*Math.pow(headness,0.55));
          const rng=mulberry(Math.floor((cum[i-1]+d)*7.3)|0);
          const cols=Math.round(halfW*c.grainPerPx);
          for (let k=0;k<cols;k++){
            const u=Math.pow(rng(),1.5);
            const edge=u;
            const fade=Math.pow(1-edge,2.0);
            const lat=u*halfW + (rng()-0.5)*0.8;
            const gx=px+nx*lat, gy=py+ny*lat;
            const dark=darkBase*fade*(0.55+0.45*rng());
            const g=c.inkBase+rng()*32;
            const sz=(0.8+(1-edge)*1.1)*(0.7+0.6*rng());
            ctx.fillStyle=`rgba(${g|0},${g|0},${g|0},${Math.min(1,dark)})`;
            ctx.fillRect(gx-sz/2,gy-sz/2,sz,sz);
          }
        }
        carried=(carried<segLen)? (c.dot-((segLen-carried)%c.dot))%c.dot : carried-segLen;
      }
    }

    this.visCtx.setTransform(1,0,0,1,0,0);
    this.visCtx.clearRect(0,0,this.vis.width,this.vis.height);
    this.visCtx.drawImage(this.ink,0,0);
    this._raf = requestAnimationFrame(this._tick);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('pointermove', this._handle);
    this.vis.remove();
    if (this.nib) this.nib.remove();
  }
}

export default PencilTrail;
