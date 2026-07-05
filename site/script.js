/* ========================================================================
   WalletGuard Pro — Landing Page
   Vanilla JS · Shield parallax · Threat modal · Reveal observer
   ======================================================================== */

(() => {
  'use strict';

  /* =========================================================================
     Utilities
     ========================================================================= */
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Eased cubic for counter animations */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  /* =========================================================================
     1. NAVIGATION — scroll state & smooth anchor offset
     ========================================================================= */
  const nav = $('#nav');

  const updateNavOnScroll = () => {
    if (!nav) return;
    nav.classList.toggle('nav--scrolled', window.scrollY > 16);
  };

  updateNavOnScroll();
  window.addEventListener('scroll', updateNavOnScroll, { passive: true });

  /* Smooth scroll that accounts for the fixed nav height */
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const navHeight = nav ? nav.offsetHeight : 72;
      const y = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;
      window.scrollTo({ top: y, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });

  /* =========================================================================
     2. HERO SHIELD — multi-layer mouse parallax
     ========================================================================= */
  const shieldWrapper = $('#shieldWrapper');

  if (shieldWrapper && !prefersReducedMotion) {
    const layers = $$('[data-depth]', shieldWrapper);

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = null;
    let isInside = false;

    const tick = () => {
      // Smoothly approach target
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      layers.forEach((layer) => {
        const depth = parseFloat(layer.dataset.depth) || 1;
        const moveX = currentX * depth * 28;
        const moveY = currentY * depth * 28;
        layer.style.transform = `translate3d(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px, 0)`;
      });

      // Continue until nearly settled
      const settled =
        Math.abs(targetX - currentX) < 0.001 && Math.abs(targetY - currentY) < 0.001;

      if (!settled || isInside) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const startLoop = () => {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    };

    shieldWrapper.addEventListener('mousemove', (e) => {
      const rect = shieldWrapper.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width  - 0.5) * 2; // -1..1
      targetY = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
      isInside = true;
      startLoop();
    });

    shieldWrapper.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
      isInside = false;
      startLoop();
    });

    /* Subtle parallax on touch move for mobile devices */
    shieldWrapper.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = shieldWrapper.getBoundingClientRect();
      targetX = ((touch.clientX - rect.left) / rect.width  - 0.5) * 2;
      targetY = ((touch.clientY - rect.top)  / rect.height - 0.5) * 2;
      isInside = true;
      startLoop();
    }, { passive: true });

    shieldWrapper.addEventListener('touchend', () => {
      targetX = 0;
      targetY = 0;
      isInside = false;
      startLoop();
    });
  }

  /* =========================================================================
     3. REVEAL ANIMATIONS — Intersection Observer
     ========================================================================= */
  const revealTargets = $$('[data-reveal]');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px',
      }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-revealed'));
  }

  /* =========================================================================
     4. THREAT MODAL — interactive demo
     ========================================================================= */
  const simulateBtn = $('#simulateBtn');
  const modal       = $('#threatModal');
  const riskArc     = modal ? $('.modal__risk-arc', modal) : null;
  const riskNumber  = modal ? $('.modal__risk-number', modal) : null;
  const modalCard   = modal ? $('.modal__card', modal) : null;
  const focusableSel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocusedBeforeModal = null;

  /* The full circle circumference for r=44 is 2*PI*44 ≈ 276.46 */
  const ARC_LENGTH = 276.46;
  /* Target risk score (91/100 → 91% of the circle is filled) */
  const RISK_TARGET = 91;

  const openModal = () => {
    if (!modal) return;

    lastFocusedBeforeModal = document.activeElement;
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    /* Reset arc + counter to start state before each open */
    if (riskArc) {
      riskArc.style.transition = 'none';
      riskArc.style.strokeDashoffset = String(ARC_LENGTH);
    }
    if (riskNumber) {
      riskNumber.textContent = '0';
    }

    /* Trigger the animation on the next frame */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (riskArc) {
          riskArc.style.transition = `stroke-dashoffset 1500ms cubic-bezier(0.16, 1, 0.3, 1)`;
          /* Offset = circumference * (1 - target/100) */
          riskArc.style.strokeDashoffset = String(ARC_LENGTH * (1 - RISK_TARGET / 100));
        }
        if (riskNumber) {
          animateValue(riskNumber, 0, RISK_TARGET, 1500);
        }
      });
    });

    /* Move focus into the modal for accessibility */
    const firstFocusable = $(focusableSel, modal);
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 400);
    }
  };

  const closeModal = () => {
    if (!modal || !modal.classList.contains('modal--open')) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    /* Restore focus */
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
  };

  /* Animated number counter */
  const animateValue = (el, from, to, duration) => {
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      el.textContent = Math.round(from + (to - from) * eased).toString();
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* Simulate button → loading state → open modal */
  if (simulateBtn) {
    simulateBtn.addEventListener('click', () => {
      if (simulateBtn.classList.contains('btn--loading')) return;

      simulateBtn.classList.add('btn--loading');
      const label = $('.btn__label', simulateBtn);
      const originalText = label ? label.textContent : '';
      if (label) label.textContent = 'Analyzing calldata…';

      /* Briefly show analysis, then open the modal — feels like a real scan */
      setTimeout(() => {
        simulateBtn.classList.remove('btn--loading');
        if (label) label.textContent = originalText;
        openModal();
      }, 950);
    });
  }

  /* Close handlers — backdrop, X button, "Proceed anyway" */
  if (modal) {
    $$('[data-close]', modal).forEach((el) => {
      el.addEventListener('click', closeModal);
    });

    /* Trap focus inside modal while open (basic) */
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = $$(focusableSel, modal);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* Global Escape closes the modal */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('modal--open')) {
      closeModal();
    }
  });

  /* =========================================================================
     5. MOBILE BURGER (placeholder — gracefully degrades)
     ========================================================================= */
  const burger = $('#navBurger');
  if (burger) {
    burger.addEventListener('click', () => {
      /* For this single-page demo the burger scrolls to the demo section.
         In a production build this would toggle a mobile drawer. */
      const demo = $('#demo');
      if (demo) demo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* =========================================================================
     6. STAT COUNTERS — tick up when hero is in view
     ========================================================================= */
  const statValues = $$('.hero__stat-value[data-count]');

  if (statValues.length && 'IntersectionObserver' in window) {
    const animateStat = (el) => {
      const target = parseInt(el.dataset.count, 10);
      if (Number.isNaN(target)) return;
      const format = el.dataset.format || "compact";
      const duration = 1800;
      const startTime = performance.now();
      const step = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = easeOutCubic(progress);
        const value = Math.floor(target * eased);
        // format="number" → raw count, no suffix
        // format="compact" (default) → "1.2K+", "3.4M+"
        el.textContent = format === "number"
          ? value.toString()
          : formatCompact(value) + '+';
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const formatCompact = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      return n.toString();
    };

    const statObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateStat(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    statValues.forEach((el) => statObserver.observe(el));
  }

  /* =========================================================================
     7. CARD HOVER GLOW — track cursor for radial highlight (progressive enhancement)
     ========================================================================= */
  if (!prefersReducedMotion && window.matchMedia('(hover: hover)').matches) {
    $$('.feature-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width)  * 100;
        const y = ((e.clientY - rect.top)  / rect.height) * 100;
        card.style.setProperty('--mx', `${x}%`);
        card.style.setProperty('--my', `${y}%`);
      });
    });
  }
})();
