const workspaceData = {
  edit: {
    title: 'Find your flow.',
    copy: 'Build your story on a multitrack timeline. Add titles, refine captions, layer effects, and arrange every panel around the way you work.',
    alt: 'Editor’s Edit workspace with title styles, a coastal video preview, inspector, and multitrack timeline',
  },
  color: {
    title: 'Make it feel like you.',
    copy: 'Build a look with serial nodes, color wheels, curves, and LUTs. Read your scopes, compare a reference still, and refine every shade.',
    alt: 'Editor’s Color workspace with a coastal video, two grading nodes, four color wheels, and a luminance waveform',
  },
  audio: {
    title: 'Bring the story into balance.',
    copy: 'Mix tracks and buses, shape your EQ, clean up noise, and automate the details. Measure loudness and deliver a stereo mix or separate stems.',
    alt: 'Editor’s Audio workspace with the stock coastal project, track and master faders, channel effects, and timeline',
  },
  export: {
    title: 'Ready for what’s next.',
    copy: 'Dial in your video and audio settings, or create a handoff package for your next app. Choose editable clips or preserve the finished appearance.',
    alt: 'Editor’s Export dialog showing video settings and handoff destinations for other editing applications',
  },
};

const tabs = [...document.querySelectorAll('[data-workspace]')];
const tour = document.querySelector('.workspace-section');
const panel = document.getElementById('workspace-panel');
const image = document.getElementById('workspace-image');

function selectWorkspace({ name, focus = false }) {
  const data = workspaceData[name];
  if (!data) return;
  for (const tab of tabs) {
    const selected = tab.dataset.workspace === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  panel.setAttribute('aria-labelledby', `tab-${name}`);
  image.srcset = `./media/${name}-480.jpg 480w, ./media/${name}-960.jpg 960w, ./media/${name}-1440.jpg 1440w`;
  image.src = `./media/${name}-1440.jpg`;
  image.alt = data.alt;
  document.getElementById('workspace-heading').textContent = data.title;
  document.getElementById('workspace-copy').textContent = data.copy;
  document.getElementById('workspace-eyebrow').textContent = `THE ${name.toUpperCase()} WORKSPACE`;
  const guide = document.getElementById('workspace-guide');
  const guides = { edit: "timeline", color: "color-workspace", audio: "audio-workspace", export: "video-export" };
  guide.href = `./help/${guides[name]}/`;
  guide.firstChild.textContent = `Explore ${name.charAt(0).toUpperCase() + name.slice(1)} `;
  tour.style.setProperty('--workspace-position', String(Object.keys(workspaceData).indexOf(name)));
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectWorkspace({ name: tab.dataset.workspace }));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectWorkspace({ name: tabs[next].dataset.workspace, focus: true });
  });
});

document.querySelectorAll('[data-explore]').forEach((button) => {
  button.addEventListener('click', () => {
    selectWorkspace({ name: button.dataset.explore, focus: true });
    tour.scrollIntoView({ block: 'start' });
  });
});

const captionDemo = document.querySelector('.caption-demo');
const captionControls = [...document.querySelectorAll('[data-caption]')];
captionControls.forEach((button) => {
  button.addEventListener('click', () => {
    captionDemo.dataset.captionStyle = button.dataset.caption;
    captionControls.forEach((control) => {
      control.setAttribute('aria-pressed', String(control === button));
    });
  });
});

const layouts = [
  { value: 'editing', label: 'Editing layout' },
  { value: 'focus', label: 'Viewer focus layout' },
  { value: 'timeline', label: 'Timeline focus layout' },
];
let layoutIndex = 0;
document.getElementById('cycle-layout').addEventListener('click', () => {
  layoutIndex = (layoutIndex + 1) % layouts.length;
  const layout = layouts[layoutIndex];
  const demo = document.querySelector('.layout-demo');
  demo.dataset.layout = layout.value;
  demo.setAttribute('aria-label', `${layout.label} preview`);
  document.getElementById('layout-name').textContent = layout.label.toUpperCase();
});

const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.getElementById('mobile-nav');

function setMenuOpen({ open, restoreFocus = false }) {
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  mobileNav.hidden = !open;
  document.body.classList.toggle('menu-open', open);
  if (restoreFocus) menuToggle.focus();
}

menuToggle.addEventListener('click', () => {
  setMenuOpen({ open: menuToggle.getAttribute('aria-expanded') !== 'true' });
});
mobileNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    setMenuOpen({ open: false });
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileNav.hidden) setMenuOpen({ open: false, restoreFocus: true });
});
const desktopQuery = matchMedia('(min-width: 801px)');
desktopQuery.addEventListener('change', ({ matches }) => {
  if (matches) setMenuOpen({ open: false });
});

const creditsDialog = document.getElementById('credits-dialog');
document.getElementById('open-credits').addEventListener('click', () => creditsDialog.showModal());
document.getElementById('close-credits').addEventListener('click', () => creditsDialog.close());
creditsDialog.addEventListener('click', (event) => {
  if (event.target !== creditsDialog) return;
  const box = creditsDialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) creditsDialog.close();
});
