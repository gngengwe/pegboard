// ---------- hero peg-grid canvas ----------
function initPegCanvas(): void {
  const canvas = document.getElementById("pegcanvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const SPACING = 34;

  let width = 0;
  let height = 0;
  let pegs: { x: number; y: number; phase: number; lit: boolean }[] = [];

  function resize(): void {
    const rect = canvas!.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas!.width = width * dpr;
    canvas!.height = height * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    pegs = [];
    const cols = Math.ceil(width / SPACING) + 1;
    const rows = Math.ceil(height / SPACING) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() < 0.045;
        pegs.push({
          x: c * SPACING + (r % 2 === 0 ? 0 : SPACING / 2),
          y: r * SPACING,
          phase: Math.random() * Math.PI * 2,
          lit,
        });
      }
    }
  }

  function draw(t: number): void {
    ctx!.clearRect(0, 0, width, height);
    for (const peg of pegs) {
      const pulse = peg.lit ? (Math.sin(t / 900 + peg.phase) + 1) / 2 : 0;
      const alpha = peg.lit ? 0.15 + pulse * 0.55 : 0.16;
      ctx!.beginPath();
      ctx!.arc(peg.x, peg.y, peg.lit ? 2.4 : 1.5, 0, Math.PI * 2);
      ctx!.fillStyle = peg.lit
        ? `rgba(217, 169, 76, ${alpha})`
        : `rgba(217, 169, 76, ${alpha})`;
      ctx!.fill();
    }
  }

  resize();
  window.addEventListener("resize", resize);

  if (reduceMotion) {
    draw(0);
    return;
  }

  function loop(t: number): void {
    draw(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ---------- "hear the booth" toggle ----------
function initBoothSample(): void {
  const btn = document.getElementById("hear-booth");
  const panel = document.getElementById("booth-sample");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const isOpen = panel.hasAttribute("hidden") === false;
    if (isOpen) {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    } else {
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

// ---------- experience pills ----------
function initPills(): {
  getSelected: () => string | null;
} {
  const pills = Array.from(document.querySelectorAll<HTMLButtonElement>(".pill"));
  let selected: string | null = null;

  pills.forEach((pill) => {
    pill.setAttribute("aria-pressed", "false");
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.setAttribute("aria-pressed", "false"));
      pill.setAttribute("aria-pressed", "true");
      selected = pill.dataset.value ?? null;
    });
  });

  return { getSelected: () => selected };
}

// ---------- waitlist form ----------
// No backend is wired up yet. On submit, this composes a pre-filled email to
// the studio inbox rather than pretending to persist a signup somewhere that
// doesn't exist. Replace this with a real endpoint (Cloudflare Pages
// Function + a mail/storage provider) before sending real traffic here.
function initWaitlistForm(getSelected: () => string | null): void {
  const form = document.getElementById("waitlist-form") as HTMLFormElement | null;
  const status = document.getElementById("form-status");
  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const emailInput = form.querySelector<HTMLInputElement>("#email");
    const email = emailInput?.value.trim() ?? "";
    const experience = getSelected();

    if (!email || !emailInput?.checkValidity()) {
      status.textContent = "Enter a valid email address to join the waitlist.";
      status.setAttribute("data-state", "error");
      emailInput?.focus();
      return;
    }
    if (!experience) {
      status.textContent = "Let us know your cribbage experience so we can tailor the invite.";
      status.setAttribute("data-state", "error");
      return;
    }

    const subject = encodeURIComponent("Pegboard waitlist signup");
    const body = encodeURIComponent(
      `Email: ${email}\nCribbage experience: ${experience}`
    );
    window.location.href = `mailto:hello@ngengwe.com?subject=${subject}&body=${body}`;

    status.removeAttribute("data-state");
    status.textContent = "Opening your email client to confirm — send it and you're on the list.";
    form.reset();
    document
      .querySelectorAll<HTMLButtonElement>(".pill")
      .forEach((p) => p.setAttribute("aria-pressed", "false"));
  });
}

function initSegmentLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>("[data-segment]").forEach((link) => {
    link.addEventListener("click", () => {
      const segment = link.dataset.segment;
      const map: Record<string, string> = {
        returning: "been playing for years",
        new: "new to cribbage",
      };
      const value = segment ? map[segment] : undefined;
      if (!value) return;
      const target = document.querySelector<HTMLButtonElement>(
        `.pill[data-value="${value}"]`
      );
      if (target) {
        document
          .querySelectorAll<HTMLButtonElement>(".pill")
          .forEach((p) => p.setAttribute("aria-pressed", "false"));
        target.setAttribute("aria-pressed", "true");
      }
    });
  });
}

// ---------- gallery lightbox ----------
function initGallery(): void {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img") as HTMLImageElement | null;
  const caption = document.getElementById("lightbox-caption");
  if (!lightbox || !img || !caption) return;

  let lastFocused: HTMLElement | null = null;

  function open(trigger: HTMLElement): void {
    const full = trigger.dataset.full;
    const captionText = trigger.dataset.caption ?? "";
    if (!full || !lightbox || !img || !caption) return;
    lastFocused = trigger;
    img.src = full;
    img.alt = captionText;
    caption.textContent = captionText;
    lightbox.removeAttribute("hidden");
    (lightbox.querySelector(".lightbox__close") as HTMLElement | null)?.focus();
  }

  function close(): void {
    if (!lightbox || !img) return;
    lightbox.setAttribute("hidden", "");
    img.src = "";
    lastFocused?.focus();
  }

  document.querySelectorAll<HTMLButtonElement>(".gallery__item").forEach((item) => {
    item.addEventListener("click", () => open(item));
  });

  lightbox.querySelectorAll<HTMLElement>("[data-close]").forEach((el) => {
    el.addEventListener("click", close);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hasAttribute("hidden")) close();
  });
}

initPegCanvas();
initBoothSample();
const pills = initPills();
initWaitlistForm(pills.getSelected);
initSegmentLinks();
initGallery();
