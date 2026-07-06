/* ============================================================================
   WalletGuard Pro — Landing Page interactions
   Vanilla JS, no framework. All animations respect prefers-reduced-motion.
   ============================================================================ */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none)").matches;

  // ----- Cursor glow + dot (desktop only) -----
  if (!isTouch && !reduceMotion) {
    const glow = document.getElementById("cursor-glow");
    const dot = document.getElementById("cursor-dot");
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;
    let rafId = null;

    function onMouseMove(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dot) {
        dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
        dot.classList.add("is-active");
      }
      if (!rafId) rafId = requestAnimationFrame(updateGlow);
    }

    function updateGlow() {
      glowX += (mouseX - glowX) * 0.12;
      glowY += (mouseY - glowY) * 0.12;
      if (glow) glow.style.transform = `translate(${glowX}px, ${glowY}px) translate(-50%, -50%)`;
      if (Math.abs(mouseX - glowX) > 0.5 || Math.abs(mouseY - glowY) > 0.5) {
        rafId = requestAnimationFrame(updateGlow);
      } else {
        rafId = null;
      }
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseenter", () => glow && glow.classList.add("is-active"));
    window.addEventListener("mouseleave", () => {
      glow && glow.classList.remove("is-active");
      dot && dot.classList.remove("is-active");
    });

    // Hover state on interactive elements
    document.querySelectorAll("a, button, .feature-card, .how__step, .compare__row, .opensource__stat, details, summary").forEach(el => {
      el.addEventListener("mouseenter", () => dot && dot.classList.add("is-hover"));
      el.addEventListener("mouseleave", () => dot && dot.classList.remove("is-hover"));
    });
  }

  // ----- Nav scroll state -----
  const nav = document.getElementById("nav");
  let lastScroll = 0;
  function onScroll() {
    const y = window.scrollY;
    if (nav) nav.classList.toggle("is-scrolled", y > 24);
    lastScroll = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ----- Mobile menu -----
  const mobileBtn = document.getElementById("nav-mobile");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("is-open");
      mobileBtn.setAttribute("aria-expanded", String(isOpen));
      mobileMenu.setAttribute("aria-hidden", String(!isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
    mobileMenu.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        mobileMenu.classList.remove("is-open");
        mobileBtn.setAttribute("aria-expanded", "false");
        mobileMenu.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
      });
    });
  }

  // ----- Scroll reveals -----
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            revealObs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "-10% 0px -10% 0px", threshold: 0.1 }
    );
    revealEls.forEach((el) => revealObs.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-revealed"));
  }

  // ----- 3D shield parallax -----
  if (!isTouch && !reduceMotion) {
    const shield = document.getElementById("shield");
    const stage = document.querySelector(".shield-stage");
    const heroVisual = document.getElementById("hero-visual");

    if (shield && heroVisual) {
      let shieldX = 0, shieldY = 0;
      let targetX = 0, targetY = 0;
      let rafId = null;

      function onShieldMove(e) {
        const rect = heroVisual.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / rect.width;
        const dy = (e.clientY - cy) / rect.height;
        targetX = dx * 8;
        targetY = dy * 8;
        if (!rafId) rafId = requestAnimationFrame(updateShield);
      }

      function updateShield() {
        shieldX += (targetX - shieldX) * 0.08;
        shieldY += (targetY - shieldY) * 0.08;
        if (stage) stage.style.transform = `rotateY(${shieldX}deg) rotateX(${-shieldY}deg)`;
        if (Math.abs(targetX - shieldX) > 0.05 || Math.abs(targetY - shieldY) > 0.05) {
          rafId = requestAnimationFrame(updateShield);
        } else {
          rafId = null;
        }
      }

      window.addEventListener("mousemove", onShieldMove, { passive: true });
    }
  }

  // ----- Demo animation (trigger when in view) -----
  const demoStage = document.getElementById("demo-stage");
  const warning = document.querySelector("[data-demo-warning]");
  const receipt = document.querySelector("[data-demo-receipt]");
  const urlText = document.querySelector("[data-demo-url-text]");

  if (demoStage && warning && receipt) {
    const triggerDemo = () => {
      // Type the URL with a Cyrillic 'а' to show the phishing detection
      if (urlText) {
        urlText.textContent = "https://uniswаp.org/claim";
      }
      // Show warning after a brief pause
      setTimeout(() => warning.classList.add("is-visible"), 600);
      // Show receipt slightly after
      setTimeout(() => receipt.classList.add("is-visible"), 1100);
    };

    if ("IntersectionObserver" in window) {
      const demoObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              triggerDemo();
              demoObs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      demoObs.observe(demoStage);
    } else {
      triggerDemo();
    }
  }

  // ----- Smooth scroll for anchor links -----
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (href === "#" || href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const navHeight = nav ? nav.offsetHeight : 0;
      const y = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;
      window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  // ----- Subtle stat number animation on first view -----
  if ("IntersectionObserver" in window) {
    const statNums = document.querySelectorAll(".opensource__stat-num, .trusted__num, .hero__trust-num");
    const animated = new WeakSet();

    const numObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animated.has(entry.target)) {
            animated.add(entry.target);
            const el = entry.target;
            const final = el.textContent.trim();
            // Only animate plain numbers (skip "MIT", "0", "100%", etc. that are non-numeric context)
            const match = final.match(/^([\$]?)(\d+)(.*)$/);
            if (!match || reduceMotion) return;
            const prefix = match[1];
            const num = parseInt(match[2], 10);
            const suffix = match[3];
            if (num < 5) return; // too small to animate
            const duration = 1200;
            const start = performance.now();
            const ease = (t) => 1 - Math.pow(1 - t, 3);
            function step(now) {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              const value = Math.round(num * ease(progress));
              el.textContent = prefix + value.toLocaleString() + suffix;
              if (progress < 1) requestAnimationFrame(step);
              else el.textContent = final; // ensure exact final value
            }
            requestAnimationFrame(step);
            numObs.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );
    statNums.forEach((el) => numObs.observe(el));
  }
})();
