// Portfolio interactions: a slow marble shader behind the glass, poppable
// liquid bubbles in the hero, a pointer-following sheen on glass, and small
// synthesised bubble sounds (Web Audio, no files) with a mute toggle.
// Everything is readable without JS; reduced-motion visitors get a still
// marble, still bubbles and paused videos.
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------------------------------------------------------- sound */

  var Sound = {
    ctx: null, out: null, on: true, awake: false,
    load: function () {
      try { this.on = localStorage.getItem("na-sound") !== "off"; } catch (e) {}
    },
    save: function () {
      try { localStorage.setItem("na-sound", this.on ? "on" : "off"); } catch (e) {}
    },
    wake: function () {
      if (this.awake) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.6;
      this.out.connect(this.ctx.destination);
      this.awake = true;
    },
    ready: function () {
      if (!this.on || !this.awake) return false;
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
    },
    // a rising sine with a fast decay reads as a water "bloop"
    bloop: function (pitch, vol) {
      if (!this.ready()) return;
      var c = this.ctx, t = c.currentTime, p = pitch || 1, v = vol || 0.16;
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(240 * p, t);
      o.frequency.exponentialRampToValueAtTime(720 * p, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.25);
    },
    // a short band-passed noise burst plus a blip: the bubble popping
    pop: function () {
      if (!this.ready()) return;
      var c = this.ctx, t = c.currentTime;
      var len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      n.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 1700 + Math.random() * 600; bp.Q.value = 1.4;
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      n.connect(bp); bp.connect(g); g.connect(this.out); n.start(t);
      this.bloop(1.6 + Math.random() * 0.5, 0.1);
    },
    tick: function () {
      if (!this.ready()) return;
      var c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(1350, t); o.frequency.exponentialRampToValueAtTime(1700, t + 0.04);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.08);
    },
    chime: function () {
      if (!this.ready()) return;
      var self = this;
      this.bloop(1.4, 0.12);
      setTimeout(function () { self.bloop(2.1, 0.1); }, 90);
    }
  };
  Sound.load();

  var toggle = document.querySelector("[data-sound-toggle]");
  function paintToggle() {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", Sound.on ? "true" : "false");
    toggle.setAttribute("aria-label", Sound.on ? "Sound effects on" : "Sound effects off");
  }
  paintToggle();
  if (toggle) toggle.addEventListener("click", function () {
    Sound.wake();
    Sound.on = !Sound.on;
    Sound.save(); paintToggle();
    if (Sound.on) Sound.chime();
  });

  // phone menu: the nav links drop down as a glass panel
  var menuBtn = document.querySelector("[data-menu-toggle]"), menu = document.getElementById("nav-links");
  if (menuBtn && menu) {
    function setMenu(open) { menu.classList.toggle("is-open", open); menuBtn.setAttribute("aria-expanded", open ? "true" : "false"); }
    menuBtn.addEventListener("click", function () { Sound.wake(); setMenu(!menu.classList.contains("is-open")); Sound.bloop(1.2); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  // browsers only allow audio after a gesture, so the first one wakes it
  ["pointerdown", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, function () { Sound.wake(); }, { once: true, capture: true });
  });

  document.querySelectorAll("[data-sound]").forEach(function (el) {
    if (finePointer) el.addEventListener("pointerenter", function () { Sound.tick(); });
    el.addEventListener("click", function () { Sound.wake(); Sound.bloop(1 + Math.random() * 0.2); });
  });

  /* ---------------------------------------------------------- glass sheen */

  if (finePointer) {
    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest && e.target.closest(".glass, .pill, .sound-toggle");
      if (!el) return;
      var r = el.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%";
      var y = ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%";
      el.style.setProperty("--mx", x); el.style.setProperty("--my", y);
      el.style.setProperty("--px", x); el.style.setProperty("--py", y);
    }, { passive: true });
  }

  /* ---------------------------------------------------------- marble */

  var canvas = document.querySelector(".marble");
  var gl = canvas && (canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true }));
  if (gl) {
    var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var fs = [
      "precision mediump float;uniform vec2 r;uniform float t;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
      "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}",
      "void main(){vec2 uv=gl_FragCoord.xy/r.y;vec2 p=uv*1.8;float s=t*.012;",
      "vec2 q=vec2(fbm(p+s),fbm(p+vec2(5.2,1.3)-s));",
      "vec2 w=vec2(fbm(p+3.*q+vec2(1.7,9.2)+s*.6),fbm(p+3.*q+vec2(8.3,2.8)-s*.4));",
      "float f=fbm(p+3.2*w);",
      "float v1=1.-smoothstep(0.,.075,abs(sin((p.x*.9+p.y*.5)*2.6+f*8.)));",
      "float v2=1.-smoothstep(0.,.035,abs(sin((p.y-p.x*.35)*6.+f*13.)));",
      // pastel fields (lavender, blush, mint, sky) drift into each other; veins are pearl
      "float a=fbm(p*.55+s*1.5),b=fbm(p*.55+vec2(4.1,2.3)-s*1.2);",
      "vec3 lav=vec3(.93,.91,1.),blu=vec3(.995,.925,.95),mnt=vec3(.905,.975,.945),sky=vec3(.9,.94,.995);",
      "vec3 base=mix(mix(lav,blu,smoothstep(.3,.72,a)),mix(mnt,sky,smoothstep(.3,.72,a)),smoothstep(.36,.66,b));",
      "base=mix(base,base*vec3(.985,.98,1.),smoothstep(.3,.9,f));",
      "vec3 c=mix(base,vec3(1.),v1*.5);",
      "c=mix(c,vec3(.86,.84,.96),v2*.16);",
      "gl_FragColor=vec4(c,1.);}"
    ].join("");
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var uR = gl.getUniformLocation(prog, "r"), uT = gl.getUniformLocation(prog, "t");
      var scale = 0.5; // rendered at half resolution; it sits under blur anyway
      function size() {
        canvas.width = Math.max(1, Math.floor(innerWidth * scale));
        canvas.height = Math.max(1, Math.floor(innerHeight * scale));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uR, canvas.width, canvas.height);
      }
      size();
      addEventListener("resize", function () { size(); if (reduce) draw(40); });
      var start = performance.now(), last = 0, running = true;
      function draw(sec) { gl.uniform1f(uT, sec); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      function loop(now) {
        if (!running) return;
        if (now - last > 50) { draw(40 + (now - start) / 1000); last = now; } // ~20fps is plenty for drifting stone
        requestAnimationFrame(loop);
      }
      if (reduce) draw(40); else requestAnimationFrame(loop);
      document.addEventListener("visibilitychange", function () {
        if (reduce) return;
        running = !document.hidden;
        if (running) requestAnimationFrame(loop);
      });
      canvas.classList.add("is-on");
    }
  }

  /* ---------------------------------------------------------- bubbles */

  // every page header carries a field; the home hero gets the most bubbles
  document.querySelectorAll("[data-bubbles]").forEach(function (hero) {
    var field = hero.querySelector(".bubbles");
    if (!field) return;
    var big = hero.classList.contains("hero");
    var bubbles = [], W = 0, H = 0, mouse = { x: -9999, y: -9999 };
    var count = big ? (innerWidth < 640 ? 6 : 11) : (innerWidth < 640 ? 3 : 6);
    function measure() { W = hero.clientWidth; H = hero.clientHeight; }
    measure();
    addEventListener("resize", measure);

    function spawn(b, fromBottom) {
      b.r = (big ? 26 : 18) + Math.random() * (innerWidth < 640 ? 30 : (big ? 62 : 44));
      b.x = Math.random() * W;
      b.y = fromBottom ? H + b.r : Math.random() * H * 0.9;
      b.vx = (Math.random() - 0.5) * 0.25;
      b.vy = -(0.18 + Math.random() * 0.32);
      b.phase = Math.random() * Math.PI * 2;
      b.el.style.width = b.el.style.height = (b.r * 2) + "px";
      b.el.style.animationDelay = (-Math.random() * 7) + "s";
      b.el.classList.remove("is-popping");
      b.touched = false;
    }

    for (var i = 0; i < count; i++) {
      var el = document.createElement("span");
      el.className = "bubble";
      field.appendChild(el);
      var b = { el: el };
      spawn(b, false);
      bubbles.push(b);
      (function (b) {
        el.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          Sound.wake(); Sound.pop();
          var ring = document.createElement("span");
          ring.className = "ripple";
          ring.style.width = ring.style.height = (b.r * 2) + "px";
          ring.style.transform = "translate(" + (b.x - b.r) + "px," + (b.y - b.r) + "px)";
          field.appendChild(ring);
          setTimeout(function () { ring.remove(); }, 480);
          // a few iridescent droplets thrown off the rim
          if (!reduce && Element.prototype.animate) {
            var drops = 6 + Math.floor(Math.random() * 3);
            for (var k = 0; k < drops; k++) {
              var dr = document.createElement("span"), size = 5 + Math.random() * 9;
              var ang = (k / drops) * Math.PI * 2 + Math.random() * 0.6, dist = b.r * (0.9 + Math.random() * 0.8);
              var sx = b.x + Math.cos(ang) * b.r * 0.8 - size / 2, sy = b.y + Math.sin(ang) * b.r * 0.8 - size / 2;
              dr.className = "drop";
              dr.style.width = dr.style.height = size + "px";
              field.appendChild(dr);
              dr.animate([
                { transform: "translate(" + sx + "px," + sy + "px) scale(1)", opacity: 0.95 },
                { transform: "translate(" + (sx + Math.cos(ang) * dist) + "px," + (sy + Math.sin(ang) * dist + 18) + "px) scale(.3)", opacity: 0 }
              ], { duration: 420 + Math.random() * 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).onfinish = (function (d) { return function () { d.remove(); }; })(dr);
            }
          }
          b.el.classList.add("is-popping");
          b.popped = true;
          setTimeout(function () { b.popped = false; spawn(b, true); }, reduce ? 250 : 300);
        });
      })(b);
    }

    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    }, { passive: true });
    hero.addEventListener("pointerleave", function () { mouse.x = mouse.y = -9999; });

    function place(b) { b.el.style.transform = "translate(" + (b.x - b.r).toFixed(1) + "px," + (b.y - b.r).toFixed(1) + "px)"; }
    bubbles.forEach(place);

    if (!reduce) {
      var heroVisible = true, looping = true;
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) {
          heroVisible = en[0].isIntersecting;
          if (heroVisible && !looping) { looping = true; tPrev = performance.now(); requestAnimationFrame(step); }
        }).observe(hero);
      }
      var tPrev = performance.now();
      function step(now) {
        var dt = Math.min(3, (now - tPrev) / 16.7); tPrev = now;
        bubbles.forEach(function (b) {
          if (b.popped) return;
          b.phase += 0.012 * dt;
          b.x += (b.vx + Math.sin(b.phase) * 0.22) * dt;
          b.y += b.vy * dt;
          // the cursor pushes bubbles aside like a finger in water
          var dx = b.x - mouse.x, dy = b.y - mouse.y, d = Math.sqrt(dx * dx + dy * dy), reach = b.r + 70;
          if (d < reach && d > 0.1) {
            var f = (1 - d / reach) * 1.6 * dt;
            b.x += dx / d * f; b.y += dy / d * f;
            if (!b.touched && d < b.r + 12) { b.touched = true; Sound.bloop(0.8 + 40 / b.r * 0.2, 0.05); }
          } else if (d > reach + 40) { b.touched = false; }
          if (b.y < -b.r * 2) spawn(b, true);
          if (b.x < -b.r) b.x = W + b.r; else if (b.x > W + b.r) b.x = -b.r;
          place(b);
        });
        if (heroVisible) requestAnimationFrame(step); else looping = false;
      }
      requestAnimationFrame(step);
    }
  });

  /* ---------------------------------------------------------- video */

  var vids = document.querySelectorAll("video[data-autoplay]");
  if (!reduce && "IntersectionObserver" in window) {
    var vo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { var p = en.target.play(); if (p && p.catch) p.catch(function () {}); }
        else en.target.pause();
      });
    }, { threshold: 0.35 });
    vids.forEach(function (v) { vo.observe(v); });
  } else {
    vids.forEach(function (v) { v.setAttribute("controls", ""); });
  }

  /* ---------------------------------------------------------- reveals */

  window.addEventListener("load", function () {
    var gsap = window.gsap;
    if (!gsap || reduce) return;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    var ease = "power3.out";
    gsap.from("[data-hero]", { y: 24, opacity: 0, duration: 0.9, ease: ease, stagger: 0.08 });
    if (!window.ScrollTrigger) return;
    gsap.utils.toArray("[data-reveal]").forEach(function (el) {
      gsap.from(el, { y: 36, opacity: 0, duration: 0.9, ease: ease, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    gsap.utils.toArray("[data-reveal-group]").forEach(function (g) {
      gsap.from(g.children, { y: 22, opacity: 0, duration: 0.7, ease: ease, stagger: 0.07, scrollTrigger: { trigger: g, start: "top 86%", once: true } });
    });
    gsap.utils.toArray("[data-bar]").forEach(function (bar, i) {
      gsap.from(bar, { scaleX: 0, duration: 1, delay: i * 0.15, ease: "power2.out", scrollTrigger: { trigger: bar, start: "top 85%", once: true } });
    });
    var flow = document.querySelector("[data-flow]");
    if (flow) gsap.from(flow.children, { y: 18, opacity: 0, duration: 0.55, ease: ease, stagger: 0.09, scrollTrigger: { trigger: flow, start: "top 82%", once: true } });
  });
})();
