/* =====================================================
   Whisked by Trix — visual effects (scroll reveal, nav shadow)
   Everything here is optional: if this file fails or the visitor prefers
   reduced motion, the site works exactly the same, just without the animation.
   ===================================================== */
(() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Soft shadow under the navbar once the page is scrolled */
  const nav = document.querySelector('.navbar');
  const onScroll = () => { if (nav) nav.classList.toggle('scrolled', window.scrollY > 8); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Scroll reveal: elements fade/slide up the first time they enter the screen */
  const SELECTORS = '.section-head, .section-header, .vibe-card, .steps li, .cta, .inclusions-box, .inclusion-item, .product-card, .drink-card, .cart-panel, .checkout-panel';
  let io = null;

  function observe(root) {
    if (reduce || !('IntersectionObserver' in window)) return;
    root = root || document;
    io = io || new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.classList.add('in');
        // Once it has appeared, hand control back to the normal styles (hover effects etc.)
        const wait = 800 + (parseFloat(el.style.getPropertyValue('--d')) || 0) * 1000;
        setTimeout(() => { el.classList.remove('reveal', 'in'); el.style.removeProperty('--d'); }, wait);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    root.querySelectorAll(SELECTORS).forEach(el => {
      if (el.dataset.fx) return;
      el.dataset.fx = '1';
      const siblings = el.parentElement ? Array.from(el.parentElement.children).filter(c => c.matches(SELECTORS)) : [];
      el.style.setProperty('--d', (Math.min(siblings.indexOf(el), 5) * 0.09).toFixed(2) + 's');
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  window.FX = { observe, reduce };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => observe());
  else observe();
})();
