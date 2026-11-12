// Pages live in the address after "#/", so back and forward work and a page
// can be bookmarked or shared. Plain anchors such as "#services" stay on the
// home page and scroll to that section.

// "completed" is the Work Board's list of finished work. "activity" is the
// admin's log of who changed what.
export const PAGES = ["home", "work", "completed", "payments", "enquiries", "team", "activity"];

export function pageFromHash(hash) {
  const match = /^#\/([\w-]*)/.exec(hash ?? "");
  if (!match) return "home";
  return PAGES.includes(match[1]) ? match[1] : "home";
}

export function hashForPage(page) {
  return page === "home" || !PAGES.includes(page) ? "#/" : `#/${page}`;
}

// The section to scroll to for an anchor like "#enquiry", or null.
export function anchorFromHash(hash) {
  const match = /^#([A-Za-z][\w-]*)$/.exec(hash ?? "");
  return match ? match[1] : null;
}
